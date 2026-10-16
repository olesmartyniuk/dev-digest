import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { FindingRow } from '../../db/rows.js';
import { ESTIMATE_SAMPLE_SIZE, STATUS_DONE } from './constants.js';

export type { FindingRow };

export interface ParentRow {
  id: string;
  prId: string;
  ranAt: Date;
  prNumber: number;
  prTitle: string;
  repoId: string;
}

export interface EstimateRow {
  n: number;
  meanDurationMs: number | null;
  meanCostUsd: number | null;
}

/** Persistence for the multi-agent read API (SPEC-05). Read-only. */
export class MultiAgentRepository {
  constructor(private db: Db) {}

  /** Workspace-scoped: a parent from another workspace is `undefined` (-> 404). */
  async getParent(workspaceId: string, id: string): Promise<ParentRow | undefined> {
    const [row] = await this.db
      .select({
        id: t.multiAgentRuns.id,
        prId: t.multiAgentRuns.prId,
        ranAt: t.multiAgentRuns.ranAt,
        prNumber: t.pullRequests.number,
        prTitle: t.pullRequests.title,
        repoId: t.pullRequests.repoId,
      })
      .from(t.multiAgentRuns)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
      .where(and(eq(t.multiAgentRuns.id, id), eq(t.multiAgentRuns.workspaceId, workspaceId)));
    return row;
  }

  async latestParentId(workspaceId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: t.multiAgentRuns.id })
      .from(t.multiAgentRuns)
      .where(eq(t.multiAgentRuns.workspaceId, workspaceId))
      .orderBy(desc(t.multiAgentRuns.ranAt), desc(t.multiAgentRuns.id))
      .limit(1);
    return row?.id ?? null;
  }

  async runsForParent(parentId: string): Promise<
    Array<{
      run: typeof t.agentRuns.$inferSelect;
      agentName: string | null;
      agentDescription: string | null;
    }>
  > {
    return this.db
      .select({
        run: t.agentRuns,
        agentName: t.agents.name,
        agentDescription: t.agents.description,
      })
      .from(t.agentRuns)
      .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
      .where(eq(t.agentRuns.multiAgentRunId, parentId));
  }

  async reviewsWithFindingsForRuns(
    runIds: string[],
  ): Promise<Array<{ review: typeof t.reviews.$inferSelect; findings: FindingRow[] }>> {
    if (runIds.length === 0) return [];
    const reviews = await this.db
      .select()
      .from(t.reviews)
      .where(and(inArray(t.reviews.runId, runIds), eq(t.reviews.kind, 'review')));
    if (reviews.length === 0) return [];
    const findings = await this.db
      .select()
      .from(t.findings)
      .where(
        inArray(
          t.findings.reviewId,
          reviews.map((r) => r.id),
        ),
      );
    return reviews.map((review) => ({
      review,
      findings: findings.filter((f) => f.reviewId === review.id),
    }));
  }

  /** PD-7: mean duration/cost over each agent's newest N `done` runs. */
  async estimatesForAgents(
    workspaceId: string,
    agentIds: string[],
  ): Promise<Map<string, EstimateRow>> {
    const out = new Map<string, EstimateRow>();
    if (agentIds.length === 0) return out;

    const ranked = this.db
      .select({
        agentId: t.agentRuns.agentId,
        durationMs: t.agentRuns.durationMs,
        costUsd: t.agentRuns.costUsd,
        rn: sql<number>`row_number() over (partition by ${t.agentRuns.agentId} order by ${t.agentRuns.ranAt} desc)`.as(
          'rn',
        ),
      })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.status, STATUS_DONE),
          inArray(t.agentRuns.agentId, agentIds),
        ),
      )
      .as('ranked');

    const rows = await this.db
      .select({
        agentId: ranked.agentId,
        n: sql<number>`count(*)::int`,
        meanDurationMs: sql<string | null>`avg(${ranked.durationMs})`,
        meanCostUsd: sql<string | null>`avg(${ranked.costUsd})`,
      })
      .from(ranked)
      .where(sql`${ranked.rn} <= ${ESTIMATE_SAMPLE_SIZE}`)
      .groupBy(ranked.agentId);

    for (const r of rows) {
      if (!r.agentId) continue;
      out.set(r.agentId, {
        n: Number(r.n),
        meanDurationMs: r.meanDurationMs == null ? null : Number(r.meanDurationMs),
        meanCostUsd: r.meanCostUsd == null ? null : Number(r.meanCostUsd),
      });
    }
    return out;
  }
}
