import type { Container } from '../../platform/container.js';
import type {
  AgentEvalDashboard,
  EvalCaseBody,
  EvalCaseView,
  EvalRunConfig,
  EvalRunDetail,
  EvalRunSummary,
  EvalWorkspaceDashboard,
  StartEvalRunBody,
  TurnIntoEvalCaseResponse,
} from '@devdigest/shared';
import type { AgentRow, EvalCaseRow } from '../../db/rows.js';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { EvalRepository } from './repository.js';
import { EvalRunExecutor, type Logger } from './run-executor.js';
import { parseFrozenDiff } from './frozen-diff.js';
import {
  batchConfig,
  batchToSummary,
  buildAgentDashboard,
  caseNameFromFinding,
  caseRowToView,
  caseRunToRecord,
  decisionOf,
  expectationFromFinding,
  extractFileFragment,
  latestFullBatch,
  trendOf,
  validateCaseAgainstDiff,
} from './helpers.js';
import {
  ERR_DIFF_UNAVAILABLE,
  ERR_FINDING_NO_AGENT,
  ERR_FINDING_UNDECIDED,
  ERR_NO_CASES,
  ERR_RUN_IN_PROGRESS,
  RECENT_RUNS_LIMIT,
  RUN_HISTORY_LIMIT,
} from './constants.js';

/**
 * Eval pipeline use cases (SPEC-04): cases (manual / from a decided finding),
 * background runs, history, dashboards. Application layer — depends on the
 * Container and the module's repository; no HTTP, no SQL, no adapters.
 */
export class EvalService {
  private repo: EvalRepository;
  private executor: EvalRunExecutor;

  constructor(private container: Container) {
    this.repo = new EvalRepository(container.db);
    this.executor = new EvalRunExecutor(container, this.repo);
  }

  // ---- helpers -------------------------------------------------------------

  private async requireAgent(workspaceId: string, agentId: string): Promise<AgentRow> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  private async viewOf(row: EvalCaseRow): Promise<EvalCaseView> {
    return caseRowToView(row, await this.repo.lastRunForCase(row.id));
  }

  /** Parse + cross-check a case body against its own diff; 422 on any problem. */
  private validateBody(body: EvalCaseBody): void {
    const diff = parseFrozenDiff(body.input_diff);
    const issues = validateCaseAgainstDiff(
      body.expected_output,
      diff.files.map((f) => f.path),
    );
    if (issues.length > 0) {
      throw new ValidationError('Expected output references files not in the diff', issues);
    }
  }

  private metaOf(body: EvalCaseBody) {
    return body.input_meta ?? { title: '', body: '', origin: 'manual' as const };
  }

  // ---- cases ---------------------------------------------------------------

  async listCases(workspaceId: string, agentId: string): Promise<EvalCaseView[]> {
    await this.requireAgent(workspaceId, agentId);
    const rows = await this.repo.listCasesForAgent(workspaceId, agentId);
    return rows.map((r) => caseRowToView(r.row, r.last));
  }

  async createCase(
    workspaceId: string,
    agentId: string,
    body: EvalCaseBody,
  ): Promise<EvalCaseView> {
    await this.requireAgent(workspaceId, agentId);
    this.validateBody(body);
    const row = await this.repo.insertCase({
      workspaceId,
      agentId,
      name: body.name,
      inputDiff: body.input_diff,
      inputMeta: this.metaOf(body),
      expectedOutput: body.expected_output,
      notes: body.notes ?? null,
    });
    if (!row) throw new AppError('conflict', 'Could not create the eval case', 409);
    return this.viewOf(row);
  }

  async getCase(workspaceId: string, caseId: string): Promise<EvalCaseView> {
    const row = await this.repo.getCase(workspaceId, caseId);
    if (!row) throw new NotFoundError('Eval case not found');
    return this.viewOf(row);
  }

  async updateCase(
    workspaceId: string,
    caseId: string,
    body: EvalCaseBody,
  ): Promise<EvalCaseView> {
    const existing = await this.repo.getCase(workspaceId, caseId);
    if (!existing) throw new NotFoundError('Eval case not found');
    this.validateBody(body);
    const row = await this.repo.updateCase(workspaceId, caseId, {
      name: body.name,
      inputDiff: body.input_diff,
      // Keep the provenance fields (source finding, decision, origin) a manual
      // edit of the editor's PR-meta tab doesn't know about.
      ...(body.input_meta
        ? { inputMeta: { ...(existing.inputMeta as object | null), ...body.input_meta } }
        : {}),
      expectedOutput: body.expected_output,
      notes: body.notes ?? null,
    });
    if (!row) throw new NotFoundError('Eval case not found');
    return this.viewOf(row);
  }

  async deleteCase(workspaceId: string, caseId: string): Promise<void> {
    const ok = await this.repo.deleteCase(workspaceId, caseId);
    if (!ok) throw new NotFoundError('Eval case not found');
  }

  /** AC-1..6: freeze a decided finding into an agent-owned eval case. */
  async turnFindingIntoCase(
    workspaceId: string,
    findingId: string,
  ): Promise<TurnIntoEvalCaseResponse> {
    const ctx = await this.container.reviewRepo.findingContext(findingId);
    if (!ctx || ctx.pull.workspaceId !== workspaceId) {
      throw new NotFoundError('Finding not found');
    }
    const { finding, review, pull } = ctx;

    const decision = decisionOf(finding);
    if (!decision) {
      throw new AppError(
        ERR_FINDING_UNDECIDED,
        'Finding must be accepted or dismissed before it can become an eval case',
        409,
      );
    }

    const agent = review.agentId
      ? await this.container.agentsRepo.getById(workspaceId, review.agentId)
      : undefined;
    if (!agent) {
      throw new AppError(
        ERR_FINDING_NO_AGENT,
        'Finding has no producing agent (its review was not run by an agent)',
        409,
      );
    }

    const existing = await this.repo.getCaseBySourceFinding(workspaceId, findingId);
    if (existing) return { case: await this.viewOf(existing), created: false };

    const unavailable = () =>
      new AppError(
        ERR_DIFF_UNAVAILABLE,
        `Could not load the diff fragment for ${finding.file} (clone missing and no stored patch)`,
        409,
      );
    let fragment: string | null = null;
    try {
      const repoRow = await this.container.reviewRepo.getRepo(pull.repoId);
      if (!repoRow) throw new Error('repo missing');
      const diff = await this.container.loadPrDiff(workspaceId, pull, repoRow);
      fragment = extractFileFragment(diff.raw, finding.file);
    } catch {
      throw unavailable();
    }
    if (fragment === null) throw unavailable();

    const row = await this.repo.insertCase({
      workspaceId,
      agentId: agent.id,
      name: caseNameFromFinding(finding.title, finding.id),
      inputDiff: fragment,
      inputMeta: {
        title: pull.title,
        body: pull.body ?? '',
        source_finding_id: finding.id,
        source_pr_id: pull.id,
        decision,
        origin: 'finding',
      },
      expectedOutput: [expectationFromFinding(finding, decision)],
      sourceFindingId: finding.id,
    });
    if (row) return { case: await this.viewOf(row), created: true };

    // Lost the race on the unique source_finding_id: return the winner.
    const winner = await this.repo.getCaseBySourceFinding(workspaceId, findingId);
    if (!winner) throw new AppError('conflict', 'Could not create the eval case', 409);
    return { case: await this.viewOf(winner), created: false };
  }

  // ---- runs ----------------------------------------------------------------

  /** AC-10: create the batch row and return before any LLM call. */
  async startRun(
    workspaceId: string,
    agentId: string,
    body: StartEvalRunBody,
    logger?: Logger,
  ): Promise<EvalRunSummary> {
    const agent = await this.requireAgent(workspaceId, agentId);

    let cases: EvalCaseRow[];
    if (body.case_ids) {
      const ids = [...new Set(body.case_ids)];
      cases = await this.repo.getCasesByIds(workspaceId, agentId, ids);
      if (cases.length !== ids.length) {
        throw new ValidationError('Some case_ids do not belong to this agent');
      }
    } else {
      cases = (await this.repo.listCasesForAgent(workspaceId, agentId)).map((r) => r.row);
    }
    if (cases.length === 0) {
      throw new AppError(ERR_NO_CASES, 'Agent has no eval cases', 422);
    }

    const skills = (await this.container.agentsRepo.linkedSkills(agent.id)).filter(
      (l) => l.skill.enabled,
    );
    // The config snapshot of the version this run used (AC-11). Compare reads
    // the prompt from here, not from agent_versions (seeded agents have no v1 row).
    const config: EvalRunConfig = {
      provider: agent.provider,
      model: agent.model,
      system_prompt: agent.systemPrompt,
      strategy: agent.strategy,
      skill_ids: skills.map((l) => l.skill.id),
    };

    const batch = await this.repo.createBatch({
      workspaceId,
      agentId,
      agentVersion: agent.version,
      configJson: config,
      partial: !!body.case_ids,
      caseIds: cases.map((c) => c.id),
    });
    if (!batch) {
      throw new AppError(
        ERR_RUN_IN_PROGRESS,
        'An eval run is already in progress for this agent',
        409,
      );
    }

    void this.executor
      .execute(
        workspaceId,
        batch,
        config,
        cases,
        skills.map((l) => l.skill.body),
        logger,
      )
      .catch((err) => logger?.error({ err, batchId: batch.id }, 'eval executor crashed'));

    return batchToSummary(batch, agent.name, agent.model);
  }

  async listRuns(workspaceId: string, agentId: string): Promise<EvalRunSummary[]> {
    const agent = await this.requireAgent(workspaceId, agentId);
    const batches = await this.repo.listBatchesForAgent(workspaceId, agentId, RUN_HISTORY_LIMIT);
    return batches.map((b) => batchToSummary(b, agent.name, agent.model));
  }

  async getRun(workspaceId: string, runId: string): Promise<EvalRunDetail> {
    const batch = await this.repo.getBatch(workspaceId, runId);
    if (!batch) throw new NotFoundError('Eval run not found');
    const agent = await this.container.agentsRepo.getById(workspaceId, batch.agentId);
    const rows = await this.repo.caseRunsForBatch(batch.id);
    const config = batchConfig(batch);
    return {
      ...batchToSummary(batch, agent?.name ?? 'Unknown agent', config.model || agent?.model || ''),
      config,
      cases: rows.map((r) => caseRunToRecord(r.run, r.caseName)),
    };
  }

  // ---- dashboards ----------------------------------------------------------

  async agentDashboard(workspaceId: string, agentId: string): Promise<AgentEvalDashboard> {
    const agent = await this.requireAgent(workspaceId, agentId);
    const [casesTotal, batches] = await Promise.all([
      this.repo.countCasesForAgent(workspaceId, agentId),
      this.repo.listBatchesForAgent(workspaceId, agentId, RUN_HISTORY_LIMIT),
    ]);
    const latest = latestFullBatch(batches);
    const records = latest
      ? (await this.repo.caseRunsForBatch(latest.id)).map((r) => caseRunToRecord(r.run, r.caseName))
      : [];
    const { dashboard, regression } = buildAgentDashboard(agentId, casesTotal, batches, records);
    return {
      dashboard,
      runs: batches.map((b) => batchToSummary(b, agent.name, agent.model)),
      regression,
    };
  }

  async workspaceDashboard(workspaceId: string): Promise<EvalWorkspaceDashboard> {
    const [agents, recent] = await Promise.all([
      this.repo.agentsWithCases(workspaceId),
      this.repo.listRecentBatches(workspaceId, RECENT_RUNS_LIMIT),
    ]);
    const cards = await Promise.all(
      agents.map(async (a) => {
        const batches = await this.repo.listBatchesForAgent(
          workspaceId,
          a.agentId,
          RUN_HISTORY_LIMIT,
        );
        const last = latestFullBatch(batches) ?? batches[0];
        return {
          agent_id: a.agentId,
          agent_name: a.agentName,
          model: a.model,
          cases_total: a.casesTotal,
          last_run: last ? batchToSummary(last, a.agentName, a.model) : null,
          trend: trendOf(batches),
        };
      }),
    );
    return {
      agents: cards,
      recent_runs: recent.map((r) => batchToSummary(r.batch, r.agentName, r.model)),
    };
  }

  /** Boot reaping (R6 analogue). */
  reapStaleRuns(): Promise<number> {
    return this.repo.reapStaleBatches();
  }
}
