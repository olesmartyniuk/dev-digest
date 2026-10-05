import { and, eq } from 'drizzle-orm';
import { FeatureModelChoice, PrBriefView } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { FEATURE_MODELS_SETTING_KEY, FEATURE_MODEL_ID } from './constants.js';

/**
 * PR Why + Risk Brief (SPEC-03 / L05) data access. Owns the `pr_brief` table
 * (one row per PR, upserted on the PK `pr_id`); reads `settings` locally for
 * this feature's model override.
 *
 * Reading `settings` here rather than calling the settings module's
 * `getFeatureModelOverride` is deliberate: a module may not reach into
 * another module's folder (`no-cross-module-reach`) — see
 * `intent/repository.ts` for the same rule applied to the same need.
 */
export class BriefRepository {
  constructor(private db: Db) {}

  /** Stored brief, or null when absent or no longer parsing as PrBriefView (treated as not generated). */
  async getBrief(prId: string): Promise<PrBriefView | null> {
    const [row] = await this.db
      .select({ json: t.prBrief.json })
      .from(t.prBrief)
      .where(eq(t.prBrief.prId, prId));
    if (!row) return null;
    const parsed = PrBriefView.safeParse(row.json);
    return parsed.success ? parsed.data : null;
  }

  /** Upsert on PK pr_id — last write wins, no concurrency guard (spec Edge cases). */
  async upsertBrief(prId: string, brief: PrBriefView): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json: brief })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: brief } });
  }

  /** The workspace's model override for the `risk_brief` feature (D1), if any. */
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
