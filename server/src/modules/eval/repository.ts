import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { EvalBatchRow, EvalCaseRow, EvalRunRow } from '../../db/rows.js';
import { STALE_RUN_ERROR } from './constants.js';

export type { EvalBatchRow, EvalCaseRow, EvalRunRow };

/**
 * Eval pipeline data-access (SPEC-04). Owns `eval_cases`, `eval_runs` and
 * `eval_batches`. Workspace-scoped throughout. This is the only file in the
 * eval module that imports `drizzle-orm`.
 */

export interface InsertEvalCase {
  workspaceId: string;
  agentId: string;
  name: string;
  inputDiff: string;
  inputMeta: unknown;
  expectedOutput: unknown;
  notes?: string | null;
  sourceFindingId?: string | null;
}

export interface UpdateEvalCase {
  name?: string;
  inputDiff?: string;
  inputMeta?: unknown;
  expectedOutput?: unknown;
  notes?: string | null;
}

export interface InsertCaseRun {
  caseId: string;
  batchId: string;
  actualOutput: unknown;
  pass: boolean | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  durationMs: number | null;
  costUsd: number | null;
}

export interface CompleteBatch {
  status: 'done' | 'failed';
  aggregate: unknown | null;
  na: unknown | null;
  costUsd: number | null;
  erroredCount: number;
  error: string | null;
}

/** pg unique_violation, whether surfaced directly or wrapped by the driver. */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
}

export class EvalRepository {
  constructor(private db: Db) {}

  // ---- cases ---------------------------------------------------------------

  private agentCaseFilter(workspaceId: string, agentId: string) {
    return and(
      eq(t.evalCases.workspaceId, workspaceId),
      eq(t.evalCases.ownerKind, 'agent'),
      eq(t.evalCases.ownerId, agentId),
    );
  }

  /** Each of the agent's cases with its most recent per-case run (or null). */
  async listCasesForAgent(
    workspaceId: string,
    agentId: string,
  ): Promise<{ row: EvalCaseRow; last: EvalRunRow | null }[]> {
    const rows = await this.db
      .select()
      .from(t.evalCases)
      .where(this.agentCaseFilter(workspaceId, agentId))
      .orderBy(asc(t.evalCases.createdAt), asc(t.evalCases.name));
    if (rows.length === 0) return [];
    const lasts = await this.db
      .selectDistinctOn([t.evalRuns.caseId])
      .from(t.evalRuns)
      .where(
        inArray(
          t.evalRuns.caseId,
          rows.map((r) => r.id),
        ),
      )
      .orderBy(t.evalRuns.caseId, desc(t.evalRuns.ranAt));
    const byCase = new Map(lasts.map((r) => [r.caseId, r]));
    return rows.map((row) => ({ row, last: byCase.get(row.id) ?? null }));
  }

  async countCasesForAgent(workspaceId: string, agentId: string): Promise<number> {
    const [r] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.evalCases)
      .where(this.agentCaseFilter(workspaceId, agentId));
    return r?.n ?? 0;
  }

  async getCase(workspaceId: string, caseId: string): Promise<EvalCaseRow | undefined> {
    const [r] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)));
    return r;
  }

  /** Latest per-case run for one case. */
  async lastRunForCase(caseId: string): Promise<EvalRunRow | null> {
    const [r] = await this.db
      .select()
      .from(t.evalRuns)
      .where(eq(t.evalRuns.caseId, caseId))
      .orderBy(desc(t.evalRuns.ranAt))
      .limit(1);
    return r ?? null;
  }

  async getCaseBySourceFinding(
    workspaceId: string,
    findingId: string,
  ): Promise<EvalCaseRow | undefined> {
    const [r] = await this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.sourceFindingId, findingId),
        ),
      );
    return r;
  }

  async getCasesByIds(
    workspaceId: string,
    agentId: string,
    ids: string[],
  ): Promise<EvalCaseRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(t.evalCases)
      .where(and(this.agentCaseFilter(workspaceId, agentId), inArray(t.evalCases.id, ids)))
      .orderBy(asc(t.evalCases.createdAt), asc(t.evalCases.name));
  }

  async findCaseByOwnerAndName(
    workspaceId: string,
    agentId: string,
    name: string,
  ): Promise<EvalCaseRow | undefined> {
    const [r] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(this.agentCaseFilter(workspaceId, agentId), eq(t.evalCases.name, name)));
    return r;
  }

  /**
   * Insert an agent-owned case. Returns `null` when `source_finding_id` collides
   * with an existing case (unique violation) so the service can re-read the
   * winner of the race (AC-5).
   */
  async insertCase(values: InsertEvalCase): Promise<EvalCaseRow | null> {
    try {
      const [r] = await this.db
        .insert(t.evalCases)
        .values({
          workspaceId: values.workspaceId,
          ownerKind: 'agent',
          ownerId: values.agentId,
          agentId: values.agentId,
          name: values.name,
          inputDiff: values.inputDiff,
          inputMeta: values.inputMeta,
          expectedOutput: values.expectedOutput,
          notes: values.notes ?? null,
          sourceFindingId: values.sourceFindingId ?? null,
        })
        .returning();
      return r ?? null;
    } catch (err) {
      if (isUniqueViolation(err)) return null;
      throw err;
    }
  }

  async updateCase(
    workspaceId: string,
    caseId: string,
    patch: UpdateEvalCase,
  ): Promise<EvalCaseRow | undefined> {
    const set: Partial<typeof t.evalCases.$inferInsert> = {};
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.inputDiff !== undefined) set.inputDiff = patch.inputDiff;
    if (patch.inputMeta !== undefined) set.inputMeta = patch.inputMeta;
    if (patch.expectedOutput !== undefined) set.expectedOutput = patch.expectedOutput;
    if (patch.notes !== undefined) set.notes = patch.notes;
    if (Object.keys(set).length === 0) return this.getCase(workspaceId, caseId);
    const [r] = await this.db
      .update(t.evalCases)
      .set(set)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)))
      .returning();
    return r;
  }

  /** `eval_runs` rows go with the case via the existing FK cascade. */
  async deleteCase(workspaceId: string, caseId: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  // ---- batches -------------------------------------------------------------

  /**
   * Create a `running` batch. Returns `null` when the partial unique index
   * `eval_batches_one_running_per_agent` rejects it (a run is already active -> 409).
   */
  async createBatch(values: {
    workspaceId: string;
    agentId: string;
    agentVersion: number;
    configJson: unknown;
    partial: boolean;
    caseIds: string[];
  }): Promise<EvalBatchRow | null> {
    try {
      const [r] = await this.db
        .insert(t.evalBatches)
        .values({
          workspaceId: values.workspaceId,
          agentId: values.agentId,
          agentVersion: values.agentVersion,
          configJson: values.configJson,
          partial: values.partial,
          caseIds: values.caseIds,
        })
        .returning();
      return r ?? null;
    } catch (err) {
      if (isUniqueViolation(err)) return null;
      throw err;
    }
  }

  async insertCaseRun(values: InsertCaseRun): Promise<EvalRunRow> {
    const [r] = await this.db
      .insert(t.evalRuns)
      .values({
        caseId: values.caseId,
        batchId: values.batchId,
        actualOutput: values.actualOutput,
        pass: values.pass,
        recall: values.recall,
        precision: values.precision,
        citationAccuracy: values.citationAccuracy,
        durationMs: values.durationMs,
        costUsd: values.costUsd,
      })
      .returning();
    return r!;
  }

  async completeBatch(batchId: string, values: CompleteBatch): Promise<void> {
    await this.db
      .update(t.evalBatches)
      .set({
        status: values.status,
        aggregate: values.aggregate,
        na: values.na,
        costUsd: values.costUsd,
        erroredCount: values.erroredCount,
        error: values.error,
        finishedAt: new Date(),
      })
      .where(eq(t.evalBatches.id, batchId));
  }

  async listBatchesForAgent(
    workspaceId: string,
    agentId: string,
    limit: number,
  ): Promise<EvalBatchRow[]> {
    return this.db
      .select()
      .from(t.evalBatches)
      .where(
        and(eq(t.evalBatches.workspaceId, workspaceId), eq(t.evalBatches.agentId, agentId)),
      )
      .orderBy(desc(t.evalBatches.startedAt))
      .limit(limit);
  }

  async listRecentBatches(
    workspaceId: string,
    limit: number,
  ): Promise<{ batch: EvalBatchRow; agentName: string; model: string }[]> {
    const rows = await this.db
      .select({ batch: t.evalBatches, agentName: t.agents.name, model: t.agents.model })
      .from(t.evalBatches)
      .innerJoin(t.agents, eq(t.evalBatches.agentId, t.agents.id))
      .where(eq(t.evalBatches.workspaceId, workspaceId))
      .orderBy(desc(t.evalBatches.startedAt))
      .limit(limit);
    return rows;
  }

  async getBatch(workspaceId: string, batchId: string): Promise<EvalBatchRow | undefined> {
    const [r] = await this.db
      .select()
      .from(t.evalBatches)
      .where(and(eq(t.evalBatches.workspaceId, workspaceId), eq(t.evalBatches.id, batchId)));
    return r;
  }

  async caseRunsForBatch(
    batchId: string,
  ): Promise<{ run: EvalRunRow; caseName: string }[]> {
    const rows = await this.db
      .select({ run: t.evalRuns, caseName: t.evalCases.name })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalRuns.caseId, t.evalCases.id))
      .where(eq(t.evalRuns.batchId, batchId))
      .orderBy(asc(t.evalRuns.ranAt));
    return rows;
  }

  /** Agents that own at least one eval case, with their case counts. */
  async agentsWithCases(
    workspaceId: string,
  ): Promise<{ agentId: string; agentName: string; model: string; casesTotal: number }[]> {
    const rows = await this.db
      .select({
        agentId: t.agents.id,
        agentName: t.agents.name,
        model: t.agents.model,
        casesTotal: sql<number>`count(${t.evalCases.id})::int`,
      })
      .from(t.evalCases)
      .innerJoin(t.agents, eq(t.evalCases.agentId, t.agents.id))
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerKind, 'agent')))
      .groupBy(t.agents.id, t.agents.name, t.agents.model)
      .orderBy(asc(t.agents.name));
    return rows;
  }

  /** Boot reaping (R6 analogue): any `running` batch is stale; partial case rows are kept. */
  async reapStaleBatches(): Promise<number> {
    const rows = await this.db
      .update(t.evalBatches)
      .set({ status: 'failed', error: STALE_RUN_ERROR, finishedAt: new Date() })
      .where(eq(t.evalBatches.status, 'running'))
      .returning({ id: t.evalBatches.id });
    return rows.length;
  }
}
