import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockAuthProvider, MockSecretsProvider } from '../src/adapters/mocks.js';
import { EvalRepository } from '../src/modules/eval/repository.js';
import type { AgentRow, EvalCaseRow, FindingRow, PullRow } from '../src/db/rows.js';

type App = Awaited<ReturnType<typeof buildApp>>;

/**
 * Hermetic (no-DB) route tests for the eval module, following
 * `blast-routes.test.ts`: shared repos are stubbed with `vi.spyOn`, so no query
 * ever runs. Proves Zod rejects bad input BEFORE the handler (422), the 409
 * preconditions of "Turn into eval case", and the run-start guards.
 */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const AGENT_ID = '22222222-2222-2222-2222-222222222222';
const FINDING_ID = '33333333-3333-3333-3333-333333333333';
const CASE_ID = '44444444-4444-4444-4444-444444444444';

const agentRow = (): AgentRow =>
  ({
    id: AGENT_ID,
    workspaceId: 'w1',
    name: 'Security Reviewer',
    provider: 'openrouter',
    model: 'm',
    systemPrompt: 'sec',
    strategy: 'single-pass',
    version: 3,
  }) as AgentRow;

const findingRow = (over: Partial<FindingRow> = {}): FindingRow =>
  ({
    id: FINDING_ID,
    reviewId: 'r1',
    file: 'src/config.ts',
    startLine: 12,
    endLine: 12,
    severity: 'CRITICAL',
    category: 'security',
    title: 'Hardcoded key',
    acceptedAt: null,
    dismissedAt: null,
    ...over,
  }) as FindingRow;

const pullRow = (): PullRow => ({ id: 'p1', workspaceId: 'w1', repoId: 'r1', title: 't', body: null }) as PullRow;

describe('eval routes (no DB)', () => {
  let app: App | undefined;

  async function boot() {
    app = await buildApp({
      config,
      overrides: { auth: new MockAuthProvider(), secrets: new MockSecretsProvider({}) },
    });
    return app;
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    await app?.close();
    app = undefined;
  });

  it('rejects a non-uuid :id with 422', async () => {
    const a = await boot();
    const res = await a.inject({ method: 'GET', url: '/agents/not-a-uuid/eval-cases' });
    expect(res.statusCode).toBe(422);
  });

  it('rejects a schema-invalid expected_output with 422 before anything is persisted', async () => {
    const a = await boot();
    const insert = vi.spyOn(EvalRepository.prototype, 'insertCase');
    vi.spyOn(a.container.agentsRepo, 'getById').mockResolvedValue(agentRow());
    const res = await a.inject({
      method: 'POST',
      url: `/agents/${AGENT_ID}/eval-cases`,
      payload: {
        name: 'bad',
        input_diff: 'diff --git a/x b/x',
        expected_output: [{ kind: 'must_find', line: 3 }],
      },
    });
    expect(res.statusCode).toBe(422);
    expect(insert).not.toHaveBeenCalled();
  });

  it('409 finding_undecided when the finding is neither accepted nor dismissed', async () => {
    const a = await boot();
    vi.spyOn(a.container.reviewRepo, 'findingContext').mockResolvedValue({
      finding: findingRow(),
      review: { agentId: AGENT_ID } as never,
      pull: pullRow(),
    });
    const res = await a.inject({ method: 'POST', url: `/findings/${FINDING_ID}/eval-case` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('finding_undecided');
  });

  it('409 finding_no_agent when the review has no producing agent', async () => {
    const a = await boot();
    vi.spyOn(a.container.reviewRepo, 'findingContext').mockResolvedValue({
      finding: findingRow({ acceptedAt: new Date() }),
      review: { agentId: null } as never,
      pull: pullRow(),
    });
    const res = await a.inject({ method: 'POST', url: `/findings/${FINDING_ID}/eval-case` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('finding_no_agent');
  });

  it('422 eval_no_cases when the agent has no cases, and no batch is created', async () => {
    const a = await boot();
    vi.spyOn(a.container.agentsRepo, 'getById').mockResolvedValue(agentRow());
    vi.spyOn(EvalRepository.prototype, 'listCasesForAgent').mockResolvedValue([]);
    const create = vi.spyOn(EvalRepository.prototype, 'createBatch');
    const res = await a.inject({ method: 'POST', url: `/agents/${AGENT_ID}/eval-runs`, payload: {} });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('eval_no_cases');
    expect(create).not.toHaveBeenCalled();
  });

  it('409 eval_run_in_progress when a run is already active for the agent', async () => {
    const a = await boot();
    vi.spyOn(a.container.agentsRepo, 'getById').mockResolvedValue(agentRow());
    vi.spyOn(a.container.agentsRepo, 'linkedSkills').mockResolvedValue([]);
    vi.spyOn(EvalRepository.prototype, 'listCasesForAgent').mockResolvedValue([
      { row: { id: CASE_ID, name: 'c' } as EvalCaseRow, last: null },
    ]);
    vi.spyOn(EvalRepository.prototype, 'createBatch').mockResolvedValue(null);
    const res = await a.inject({ method: 'POST', url: `/agents/${AGENT_ID}/eval-runs` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('eval_run_in_progress');
  });
});
