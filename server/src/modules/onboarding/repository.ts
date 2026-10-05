import { and, eq } from 'drizzle-orm';
import { FeatureModelChoice, Onboarding } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { FEATURE_MODELS_SETTING_KEY, FEATURE_MODEL_ID } from './constants.js';
import type { StoredTour } from './types.js';

/**
 * Onboarding Tour (SPEC-02 / L05) data access. Owns the `onboarding` table
 * (one row per repo, upserted on the PK `repo_id`); reads `repos` for the
 * clone path and `settings` for this feature's model override.
 *
 * Reading `settings` here rather than calling the settings module is
 * deliberate: a module may not reach into another module's folder
 * (`no-cross-module-reach`) — the same pattern as `intent/repository.ts` and
 * `conventions/repository.ts`.
 */
export class OnboardingRepository {
  constructor(private db: Db) {}

  async getRepo(
    workspaceId: string,
    repoId: string,
  ): Promise<{ id: string; fullName: string; clonePath: string | null } | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, fullName: t.repos.fullName, clonePath: t.repos.clonePath })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** The stored tour for a repo, or `null` when there is none or the stored
   *  JSON no longer parses as `Onboarding` (treated as not generated). */
  async getTour(repoId: string): Promise<StoredTour | null> {
    const [row] = await this.db
      .select({ json: t.onboarding.json, generatedAt: t.onboarding.generatedAt })
      .from(t.onboarding)
      .where(eq(t.onboarding.repoId, repoId));
    if (!row) return null;
    const parsed = Onboarding.safeParse(row.json);
    if (!parsed.success) return null;
    return { onboarding: parsed.data, generatedAt: row.generatedAt };
  }

  /** Upsert the single row for this repo (last write wins — no concurrency guard, spec Edge cases). */
  async upsertTour(repoId: string, onboarding: Onboarding): Promise<StoredTour> {
    const generatedAt = new Date();
    const [row] = await this.db
      .insert(t.onboarding)
      .values({ repoId, json: onboarding, generatedAt })
      .onConflictDoUpdate({
        target: t.onboarding.repoId,
        set: { json: onboarding, generatedAt },
      })
      .returning({ json: t.onboarding.json, generatedAt: t.onboarding.generatedAt });
    return { onboarding: row!.json as Onboarding, generatedAt: row!.generatedAt };
  }

  /** The workspace's model override for the `onboarding` feature, if any. */
  async featureModelOverride(workspaceId: string): Promise<FeatureModelChoice | undefined> {
    const [row] = await this.db
      .select({ value: t.settings.value })
      .from(t.settings)
      .where(
        and(eq(t.settings.workspaceId, workspaceId), eq(t.settings.key, FEATURE_MODELS_SETTING_KEY)),
      );
    const bag = row?.value as Record<string, unknown> | null | undefined;
    const parsed = FeatureModelChoice.safeParse(bag?.[FEATURE_MODEL_ID]);
    return parsed.success ? parsed.data : undefined;
  }
}
