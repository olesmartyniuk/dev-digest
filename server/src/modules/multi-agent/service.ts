import type {
  AgentRunEstimate,
  FindingCategory,
  MultiAgentColumn,
  MultiAgentLatestResponse,
  MultiAgentRunView,
  Verdict,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { MultiAgentRepository } from './repository.js';
import {
  agentScope,
  buildLocations,
  findingRowToRecord,
  groupFindings,
  summarizeTotals,
  toColumnStatus,
  type GroupableFinding,
} from './helpers.js';

/**
 * Multi-agent read side (SPEC-05). Everything — grouping, conflicts, totals —
 * is derived from persisted runs/findings on each read; nothing is stored.
 */
export class MultiAgentService {
  private repo: MultiAgentRepository;

  constructor(private container: Container) {
    this.repo = new MultiAgentRepository(container.db);
  }

  async getRun(workspaceId: string, id: string): Promise<MultiAgentRunView> {
    const parent = await this.repo.getParent(workspaceId, id);
    if (!parent) throw new NotFoundError('Multi-agent run not found');

    const runs = await this.repo.runsForParent(id);
    // PD-8: columns ordered by lower(agent name), then run id.
    runs.sort((a, b) => {
      const an = (a.agentName ?? '').toLowerCase();
      const bn = (b.agentName ?? '').toLowerCase();
      return an < bn ? -1 : an > bn ? 1 : a.run.id < b.run.id ? -1 : a.run.id > b.run.id ? 1 : 0;
    });

    const reviewed = await this.repo.reviewsWithFindingsForRuns(runs.map((r) => r.run.id));
    const byRun = new Map(reviewed.map((r) => [r.review.runId, r]));

    const groupable: GroupableFinding[] = [];
    const categoriesByRun = new Map<string, FindingCategory[]>();
    const base = runs.map(({ run, agentName }, columnIndex) => {
      const hit = byRun.get(run.id);
      const records = (hit?.findings ?? []).map((row) => ({
        ...findingRowToRecord(row),
        run_id: run.id,
        agent_id: run.agentId,
      }));
      for (const f of records) groupable.push({ ...f, columnIndex });
      categoriesByRun.set(
        run.id,
        records.map((f) => f.category),
      );
      return { run, agentName, hit, records };
    });

    const { groups, groupIdByFindingId } = groupFindings(groupable);

    const columns: MultiAgentColumn[] = base.map(({ run, agentName, hit, records }) => ({
      run_id: run.id,
      agent_id: run.agentId,
      agent_name: agentName,
      provider: run.provider,
      model: run.model,
      status: toColumnStatus(run.status),
      error: run.error,
      verdict: (hit?.review.verdict as Verdict | null | undefined) ?? null,
      summary: hit?.review.summary ?? null,
      score: run.score ?? hit?.review.score ?? null,
      duration_ms: run.durationMs,
      cost_usd: run.costUsd,
      findings: records.map((f) => ({ ...f, group_id: groupIdByFindingId.get(f.id) ?? f.id })),
    }));

    const scopeByRunId = new Map<string, FindingCategory | null>();
    runs.forEach(({ run, agentName, agentDescription }) => {
      scopeByRunId.set(
        run.id,
        agentScope(agentName, agentDescription, categoriesByRun.get(run.id) ?? []),
      );
    });

    return {
      id: parent.id,
      pr_id: parent.prId,
      pr_number: parent.prNumber,
      pr_title: parent.prTitle,
      repo_id: parent.repoId,
      ran_at: parent.ranAt.toISOString(),
      agent_count: columns.length,
      ...summarizeTotals(columns),
      columns,
      groups,
      locations: buildLocations(columns, groups, scopeByRunId),
    };
  }

  async latest(workspaceId: string): Promise<MultiAgentLatestResponse> {
    return { id: await this.repo.latestParentId(workspaceId) };
  }

  async estimates(workspaceId: string): Promise<AgentRunEstimate[]> {
    // Cross-module data goes through the container, never a module import.
    const agents = await this.container.agentsRepo.listEnabled(workspaceId);
    const stats = await this.repo.estimatesForAgents(
      workspaceId,
      agents.map((a) => a.id),
    );
    return agents.map((a) => {
      const s = stats.get(a.id);
      return {
        agent_id: a.id,
        sample_size: s?.n ?? 0,
        mean_duration_ms: s?.meanDurationMs ?? null,
        mean_cost_usd: s?.meanCostUsd ?? null,
      };
    });
  }
}
