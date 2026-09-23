import { and, asc, eq, inArray } from 'drizzle-orm';
import { FeatureModelChoice } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRow } from '../../db/rows.js';
import { FEATURE_MODELS_SETTING_KEY, FEATURE_MODEL_ID } from './constants.js';
import type { VerifiedConvention } from './types.js';

export type { ConventionRow };

/**
 * Conventions data access. Owns the `conventions` table; reads `repos` for the
 * clone path and `settings` for this feature's model override.
 *
 * Reading `settings` here rather than calling the settings module's
 * `getFeatureModelOverride` is deliberate: a module may not reach into another
 * module's folder (`no-cross-module-reach`), and the parse is one shared Zod
 * contract wide.
 */

export interface RepoBasics {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  clonePath: string | null;
}

export interface UpdateConvention {
  status?: 'pending' | 'accepted' | 'rejected';
  rule?: string;
  ruleKey?: string;
  rationale?: string | null;
  category?: string;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<RepoBasics | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** Every candidate for a repo, oldest first (stable order across re-renders). */
  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(asc(t.conventions.createdAt), asc(t.conventions.id));
  }

  async listAccepted(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'accepted'),
        ),
      )
      .orderBy(asc(t.conventions.createdAt), asc(t.conventions.id));
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  /**
   * Rule keys the user has already judged (accepted or rejected) for this repo.
   * A re-scan skips them, so a verdict is asked for exactly once.
   */
  async judgedRuleKeys(workspaceId: string, repoId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ ruleKey: t.conventions.ruleKey })
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          inArray(t.conventions.status, ['accepted', 'rejected']),
        ),
      );
    return new Set(rows.map((r) => r.ruleKey).filter(Boolean));
  }

  /** Clear the previous scan's undecided rows. Judged rows are left alone. */
  async deletePending(workspaceId: string, repoId: string): Promise<number> {
    const rows = await this.db
      .delete(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'pending'),
        ),
      )
      .returning({ id: t.conventions.id });
    return rows.length;
  }

  async insertMany(
    workspaceId: string,
    repoId: string,
    items: VerifiedConvention[],
  ): Promise<ConventionRow[]> {
    if (items.length === 0) return [];
    return this.db
      .insert(t.conventions)
      .values(
        items.map((c) => ({
          workspaceId,
          repoId,
          category: c.category,
          rule: c.rule,
          ruleKey: c.ruleKey,
          rationale: c.rationale,
          evidencePath: c.evidencePath,
          evidenceLine: c.evidenceLine,
          evidenceSnippet: c.evidenceSnippet,
          confidence: c.confidence,
          status: 'pending' as const,
          origin: c.origin,
        })),
      )
      .returning();
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConvention,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.ruleKey !== undefined ? { ruleKey: patch.ruleKey } : {}),
        ...(patch.rationale !== undefined ? { rationale: patch.rationale } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  /** The workspace's model override for the `conventions` feature, if any. */
  async featureModelOverride(workspaceId: string): Promise<FeatureModelChoice | undefined> {
    const [row] = await this.db
      .select({ value: t.settings.value })
      .from(t.settings)
      .where(
        and(
          eq(t.settings.workspaceId, workspaceId),
          eq(t.settings.key, FEATURE_MODELS_SETTING_KEY),
        ),
      );
    const bag = row?.value as Record<string, unknown> | null | undefined;
    const parsed = FeatureModelChoice.safeParse(bag?.[FEATURE_MODEL_ID]);
    return parsed.success ? parsed.data : undefined;
  }
}
