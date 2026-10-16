import { and, desc, eq, inArray } from 'drizzle-orm';
import type { CiRunResult, CiTarget, RunTrace } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { runKey } from './helpers.js';

/**
 * ci data-access (SPEC-05). Owns `ci_installations` and the CI-sourced rows of
 * `agent_runs` / `run_traces`. Workspace-scoped; CI rows keep `pr_id = null`
 * so the PR feed and PR run timeline never see them.
 */

export type RepoRow = typeof t.repos.$inferSelect;
export type InstallationRow = typeof t.ciInstallations.$inferSelect;
export type InstallationWithAgent = InstallationRow & { agentVersion: number; agentName: string };

export interface CiRunDbRow {
  id: string;
  ranAt: Date;
  status: string | null;
  findingsCount: number | null;
  blockers: number | null;
  costUsd: number | null;
  durationMs: number | null;
  ciRepo: string | null;
  ciPrNumber: number | null;
  ciJobUrl: string | null;
  agentId: string | null;
  agentName: string | null;
}

export interface LatestRunRow {
  agentId: string | null;
  repo: string | null;
  status: string | null;
  findingsCount: number | null;
  blockers: number | null;
  ranAt: Date;
}

export interface UpsertInstallation {
  agentId: string;
  repo: string;
  targetType: CiTarget;
  agentSlug: string;
  workflowVersion: number;
  prUrl: string | null;
}

export class CiRepository {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** Installations in the workspace (optionally one agent), newest first, with the agent version/name. */
  async listInstallations(workspaceId: string, agentId?: string): Promise<InstallationWithAgent[]> {
    const rows = await this.db
      .select({
        inst: t.ciInstallations,
        agentVersion: t.agents.version,
        agentName: t.agents.name,
      })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          agentId ? eq(t.ciInstallations.agentId, agentId) : undefined,
        ),
      )
      .orderBy(desc(t.ciInstallations.installedAt));
    return rows.map((r) => ({ ...r.inst, agentVersion: r.agentVersion, agentName: r.agentName }));
  }

  async findInstallation(
    agentId: string,
    repo: string,
    target: CiTarget,
  ): Promise<InstallationRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.ciInstallations)
      .where(
        and(
          eq(t.ciInstallations.agentId, agentId),
          eq(t.ciInstallations.repo, repo),
          eq(t.ciInstallations.targetType, target),
        ),
      );
    return row;
  }

  async upsertInstallation(v: UpsertInstallation): Promise<InstallationRow> {
    const [row] = await this.db
      .insert(t.ciInstallations)
      .values({
        agentId: v.agentId,
        repo: v.repo,
        targetType: v.targetType,
        agentSlug: v.agentSlug,
        workflowVersion: v.workflowVersion,
        prUrl: v.prUrl,
      })
      .onConflictDoUpdate({
        target: [t.ciInstallations.agentId, t.ciInstallations.repo, t.ciInstallations.targetType],
        set: {
          agentSlug: v.agentSlug,
          workflowVersion: v.workflowVersion,
          prUrl: v.prUrl,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row!;
  }

  async knownRunKeys(keys: string[]): Promise<Set<string>> {
    if (keys.length === 0) return new Set();
    const rows = await this.db
      .select({ key: t.agentRuns.ciRunKey })
      .from(t.agentRuns)
      .where(inArray(t.agentRuns.ciRunKey, keys));
    return new Set(rows.map((r) => r.key).filter((k): k is string => k != null));
  }

  /**
   * Insert one ingested run + its trace atomically. Idempotent on `ci_run_key`
   * (AC-28): returns false when the run was already ingested.
   */
  async insertCiRun(
    workspaceId: string,
    agentId: string,
    r: CiRunResult,
    trace: RunTrace,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.agentRuns)
        .values({
          workspaceId,
          agentId,
          prId: null,
          ranAt: new Date(r.finished_at),
          provider: 'openrouter',
          model: r.model,
          durationMs: r.duration_ms ?? null,
          tokensIn: r.tokens_in ?? null,
          tokensOut: r.tokens_out ?? null,
          costUsd: r.cost_usd,
          // R2: stored statuses are running|done|failed|cancelled — the CI verdict is derived on read.
          status: r.status === 'failed' ? 'failed' : 'done',
          error: r.error ?? null,
          source: 'ci',
          findingsCount: r.findings_count,
          blockers: r.blockers,
          score: null,
          ciRepo: r.repository,
          ciPrNumber: r.pr_number ?? null,
          ciJobUrl: r.job_url,
          ciRunKey: runKey(r),
        })
        .onConflictDoNothing({ target: t.agentRuns.ciRunKey })
        .returning({ id: t.agentRuns.id });
      if (!row) return false;
      await tx.insert(t.runTraces).values({ runId: row.id, trace });
      return true;
    });
  }

  async listCiRuns(
    workspaceId: string,
    opts: { agentId?: string; limit: number },
  ): Promise<CiRunDbRow[]> {
    return this.db
      .select({
        id: t.agentRuns.id,
        ranAt: t.agentRuns.ranAt,
        status: t.agentRuns.status,
        findingsCount: t.agentRuns.findingsCount,
        blockers: t.agentRuns.blockers,
        costUsd: t.agentRuns.costUsd,
        durationMs: t.agentRuns.durationMs,
        ciRepo: t.agentRuns.ciRepo,
        ciPrNumber: t.agentRuns.ciPrNumber,
        ciJobUrl: t.agentRuns.ciJobUrl,
        agentId: t.agentRuns.agentId,
        agentName: t.agents.name,
      })
      .from(t.agentRuns)
      .leftJoin(t.agents, eq(t.agentRuns.agentId, t.agents.id))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.source, 'ci'),
          opts.agentId ? eq(t.agentRuns.agentId, opts.agentId) : undefined,
        ),
      )
      .orderBy(desc(t.agentRuns.ranAt))
      .limit(opts.limit);
  }

  /** Newest CI run per (agent, repo). */
  async latestRunsByInstallation(workspaceId: string, agentIds: string[]): Promise<LatestRunRow[]> {
    if (agentIds.length === 0) return [];
    return this.db
      .selectDistinctOn([t.agentRuns.agentId, t.agentRuns.ciRepo], {
        agentId: t.agentRuns.agentId,
        repo: t.agentRuns.ciRepo,
        status: t.agentRuns.status,
        findingsCount: t.agentRuns.findingsCount,
        blockers: t.agentRuns.blockers,
        ranAt: t.agentRuns.ranAt,
      })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.source, 'ci'),
          inArray(t.agentRuns.agentId, agentIds),
        ),
      )
      .orderBy(t.agentRuns.agentId, t.agentRuns.ciRepo, desc(t.agentRuns.ranAt));
  }
}
