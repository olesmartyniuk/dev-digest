import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { Intent, IntentConfidence, IntentSource, Provider } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent ---------------------------------------------------------------

export async function upsertIntent(db: Db, prId: string, intent: Intent): Promise<void> {
  await db
    .insert(t.prIntent)
    .values({
      prId,
      intent: intent.intent,
      inScope: intent.in_scope,
      outOfScope: intent.out_of_scope,
    })
    .onConflictDoUpdate({
      target: t.prIntent.prId,
      set: { intent: intent.intent, inScope: intent.in_scope, outOfScope: intent.out_of_scope },
    });
}

export async function getIntent(db: Db, prId: string): Promise<Intent | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  if (!row) return undefined;
  return { intent: row.intent, in_scope: row.inScope, out_of_scope: row.outOfScope };
}

// ---- intent record (L03 — richer classification + provenance) ------------

/** Input for `upsertIntentRecord` — everything the L03 classifier produces. */
export interface IntentRecordInput {
  intent: string;
  inScope: string[];
  outOfScope: string[];
  confidence: IntentConfidence;
  confidenceReason: string | null;
  sources: IntentSource[];
  provider: Provider | null;
  model: string | null;
  headSha: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
}

/** Upsert the full L03 classification record (+provenance) for a PR. */
export async function upsertIntentRecord(db: Db, prId: string, rec: IntentRecordInput): Promise<void> {
  const values = {
    prId,
    intent: rec.intent,
    inScope: rec.inScope,
    outOfScope: rec.outOfScope,
    confidence: rec.confidence,
    confidenceReason: rec.confidenceReason,
    sources: rec.sources,
    provider: rec.provider,
    model: rec.model,
    headSha: rec.headSha,
    tokensIn: rec.tokensIn,
    tokensOut: rec.tokensOut,
    costUsd: rec.costUsd,
    classifiedAt: new Date(),
  };
  await db
    .insert(t.prIntent)
    .values(values)
    .onConflictDoUpdate({ target: t.prIntent.prId, set: values });
}

export async function getIntentRecord(
  db: Db,
  prId: string,
): Promise<(typeof t.prIntent.$inferSelect) | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  return row;
}
