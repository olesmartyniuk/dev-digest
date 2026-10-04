import { describe, expect, it, vi } from 'vitest';
import type { ReviewRecord, ReviewRunResponse, RunSummary } from '@devdigest/shared';
import { DevDigestApiError } from '../src/api/client.js';
import type { DevDigestApi } from '../src/api/endpoints.js';
import { runAgentOnPrHandler } from '../src/tools/run-agent-on-pr.js';
import type { ToolDeps } from '../src/tools/types.js';

function finding(overrides: Partial<ReviewRecord['findings'][number]> = {}): ReviewRecord['findings'][number] {
  return {
    id: 'f1',
    review_id: 'r1',
    severity: 'WARNING',
    category: 'bug',
    title: 'title',
    file: 'a.ts',
    start_line: 1,
    end_line: 2,
    rationale: 'because',
    suggestion: null,
    confidence: 0.9,
    kind: 'finding',
    trifecta_components: null,
    evidence: null,
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

function review(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: 'rev1',
    pr_id: 'pr1',
    agent_id: 'agent1',
    run_id: 'run1',
    agent_name: 'Reviewer A',
    kind: 'review',
    verdict: 'approve',
    summary: 'summary text',
    score: 90,
    model: 'gpt-5',
    grounding: 'ok',
    created_at: '2026-01-01T00:00:00Z',
    findings: [],
    ...overrides,
  };
}

function runSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    run_id: 'run1',
    agent_id: 'agent1',
    agent_name: 'Reviewer A',
    provider: 'openai',
    model: 'gpt-5',
    status: 'done',
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: 0.01,
    findings_count: 1,
    grounding: 'ok',
    ran_at: '2026-01-01T00:00:00Z',
    score: 90,
    blockers: 0,
    ...overrides,
  };
}

interface FakeApiOpts {
  triggerReview: DevDigestApi['triggerReview'];
  listRuns: DevDigestApi['listRuns'];
  listReviews?: DevDigestApi['listReviews'];
}

function makeDeps(opts: FakeApiOpts, pollIntervalMs = 1): { deps: ToolDeps; calls: { listRuns: number; listReviews: number } } {
  const calls = { listRuns: 0, listReviews: 0 };
  const api = {
    triggerReview: opts.triggerReview,
    listRuns: async (prId: string) => {
      calls.listRuns += 1;
      return opts.listRuns(prId);
    },
    listReviews: async (prId: string) => {
      calls.listReviews += 1;
      return (opts.listReviews ?? (async () => []))(prId);
    },
  } as unknown as DevDigestApi;

  const clock = { time: 0 };
  const deps: ToolDeps = {
    api,
    config: { pollIntervalMs, defaultRunTimeoutMs: 300_000 } as ToolDeps['config'],
    now: () => clock.time,
    sleep: async (ms: number) => {
      clock.time += ms;
    },
  };
  return { deps, calls };
}

function fakeExtra(signal: AbortSignal = new AbortController().signal) {
  return {
    signal,
    sendNotification: vi.fn(async () => {}),
    _meta: undefined,
  } as unknown as Parameters<typeof runAgentOnPrHandler>[2];
}

const baseArgs = {
  pr_id: 'pr1',
  max_findings: 50,
  response_format: 'concise' as const,
};

function text(result: Awaited<ReturnType<typeof runAgentOnPrHandler>>): string {
  const first = result.content[0];
  return first && 'text' in first ? (first.text as string) : '';
}

function payload(result: Awaited<ReturnType<typeof runAgentOnPrHandler>>): Record<string, unknown> {
  return JSON.parse(text(result));
}

describe('runAgentOnPrHandler', () => {
  it('neither or both mode params is an error naming list_agents, with no API call made', async () => {
    const triggerReview = vi.fn();
    const { deps } = makeDeps({ triggerReview, listRuns: async () => [] });
    const result = await runAgentOnPrHandler({ ...baseArgs }, deps, fakeExtra());
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('list_agents');
    expect(triggerReview).not.toHaveBeenCalled();

    const both = await runAgentOnPrHandler({ ...baseArgs, agent_id: 'a1', all_agents: true }, deps, fakeExtra());
    expect(both.isError).toBe(true);
    expect(triggerReview).not.toHaveBeenCalled();
  });

  it('single, concise happy path: trigger -> poll -> one listReviews call, scoped findings', async () => {
    const triggerReview = vi.fn(async (): Promise<ReviewRunResponse> => ({
      pr_id: 'pr1',
      runs: [{ run_id: 'run1', agent_id: 'agent1', agent_name: 'Reviewer A' }],
      reviews: [],
    }));
    let pollCount = 0;
    const listRuns = vi.fn(async () => {
      pollCount += 1;
      return [runSummary({ status: pollCount < 2 ? 'running' : 'done' })];
    });
    const listReviews = vi.fn(async (): Promise<ReviewRecord[]> => [
      review({
        id: 'rev1',
        run_id: 'run1',
        verdict: 'approve',
        score: 90,
        findings: [finding({ id: 'f1', file: 'a.ts' })],
      }),
      review({
        id: 'rev-old',
        run_id: 'run-old',
        verdict: 'comment',
        score: 80,
        findings: [finding({ id: 'f-old', file: 'z.ts' })],
      }),
    ]);
    const { deps, calls } = makeDeps({ triggerReview, listRuns, listReviews });

    const result = await runAgentOnPrHandler({ ...baseArgs, agent_id: 'agent1' }, deps, fakeExtra());
    expect(result.isError).toBeFalsy();
    expect(triggerReview).toHaveBeenCalledTimes(1);
    expect(calls.listRuns).toBeGreaterThanOrEqual(1);
    expect(calls.listReviews).toBe(1);

    const p = payload(result);
    expect(Object.keys(p).sort()).toEqual(['agent_name', 'findings', 'pr_id', 'score', 'verdict'].sort());
    expect(p.verdict).toBe('approve');
    expect(p.score).toBe(90);
    const findings = p.findings as Array<Record<string, unknown>>;
    expect(findings).toHaveLength(1);
    expect(findings[0]).not.toHaveProperty('agent_name');
    expect(findings[0]).not.toHaveProperty('run_id');
    expect(findings[0]).not.toHaveProperty('id');
    expect(findings[0]).not.toHaveProperty('rationale');
  });

  it('single, truncation: shows truncated/total_findings/next only when cut', async () => {
    const triggerReview = vi.fn(async (): Promise<ReviewRunResponse> => ({
      pr_id: 'pr1',
      runs: [{ run_id: 'run1', agent_id: 'agent1', agent_name: 'Reviewer A' }],
      reviews: [],
    }));
    const listRuns = vi.fn(async () => [runSummary({ status: 'done' })]);
    const listReviews = vi.fn(async (): Promise<ReviewRecord[]> => [
      review({
        findings: [
          finding({ id: 'f1', severity: 'CRITICAL' }),
          finding({ id: 'f2', severity: 'WARNING' }),
          finding({ id: 'f3', severity: 'SUGGESTION' }),
        ],
      }),
    ]);
    const { deps } = makeDeps({ triggerReview, listRuns, listReviews });

    const truncatedResult = await runAgentOnPrHandler({ ...baseArgs, agent_id: 'agent1', max_findings: 2 }, deps, fakeExtra());
    const p1 = payload(truncatedResult);
    expect(p1.truncated).toBe(true);
    expect(p1.total_findings).toBe(3);
    expect(p1.next).toContain('get_findings');
    expect(p1.next).toContain('offset=2');

    const fullResult = await runAgentOnPrHandler({ ...baseArgs, agent_id: 'agent1', max_findings: 50 }, deps, fakeExtra());
    const p2 = payload(fullResult);
    expect(p2.truncated).toBeUndefined();
    expect(p2.total_findings).toBeUndefined();
    expect(p2.next).toBeUndefined();
  });

  it('multi, concise, disagreeing verdicts: no top-level verdict, findings keep agent_name, sorted CRITICAL first', async () => {
    const triggerReview = vi.fn(async (): Promise<ReviewRunResponse> => ({
      pr_id: 'pr1',
      runs: [
        { run_id: 'run1', agent_id: 'agent1', agent_name: 'Reviewer A' },
        { run_id: 'run2', agent_id: 'agent2', agent_name: 'Reviewer B' },
      ],
      reviews: [],
    }));
    const listRuns = vi.fn(async () => [
      runSummary({ run_id: 'run1', status: 'done' }),
      runSummary({ run_id: 'run2', status: 'done' }),
    ]);
    const listReviews = vi.fn(async (): Promise<ReviewRecord[]> => [
      review({
        id: 'rev1',
        run_id: 'run1',
        agent_name: 'Reviewer A',
        verdict: 'approve',
        findings: [finding({ id: 'f1', severity: 'WARNING', file: 'a.ts' })],
      }),
      review({
        id: 'rev2',
        run_id: 'run2',
        agent_name: 'Reviewer B',
        verdict: 'request_changes',
        findings: [finding({ id: 'f2', severity: 'CRITICAL', file: 'b.ts' })],
      }),
    ]);
    const { deps } = makeDeps({ triggerReview, listRuns, listReviews });

    const result = await runAgentOnPrHandler({ ...baseArgs, all_agents: true }, deps, fakeExtra());
    const p = payload(result);
    expect(p).not.toHaveProperty('verdict');
    const results = p.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.verdict)).toEqual(['approve', 'request_changes']);
    const findings = p.findings as Array<Record<string, unknown>>;
    expect(findings[0]?.severity).toBe('CRITICAL');
    expect(findings[0]).toHaveProperty('agent_name');
    expect(findings[0]).not.toHaveProperty('run_id');
  });

  it('multi with one enabled agent still returns the results[] shape', async () => {
    const triggerReview = vi.fn(async (): Promise<ReviewRunResponse> => ({
      pr_id: 'pr1',
      runs: [{ run_id: 'run1', agent_id: 'agent1', agent_name: 'Reviewer A' }],
      reviews: [],
    }));
    const listRuns = vi.fn(async () => [runSummary({ status: 'done' })]);
    const listReviews = vi.fn(async (): Promise<ReviewRecord[]> => [review({ findings: [finding()] })]);
    const { deps } = makeDeps({ triggerReview, listRuns, listReviews });

    const result = await runAgentOnPrHandler({ ...baseArgs, all_agents: true }, deps, fakeExtra());
    const p = payload(result);
    expect(p).toHaveProperty('results');
  });

  it('detailed includes runs[] with duration_ms/cost_usd and reviews[] with summary', async () => {
    const triggerReview = vi.fn(async (): Promise<ReviewRunResponse> => ({
      pr_id: 'pr1',
      runs: [{ run_id: 'run1', agent_id: 'agent1', agent_name: 'Reviewer A' }],
      reviews: [],
    }));
    const listRuns = vi.fn(async () => [runSummary({ status: 'done', duration_ms: 4200, cost_usd: 0.05 })]);
    const listReviews = vi.fn(async (): Promise<ReviewRecord[]> => [review({ findings: [finding()] })]);
    const { deps } = makeDeps({ triggerReview, listRuns, listReviews });

    const result = await runAgentOnPrHandler(
      { ...baseArgs, agent_id: 'agent1', response_format: 'detailed' },
      deps,
      fakeExtra(),
    );
    const p = payload(result);
    const runs = p.runs as Array<Record<string, unknown>>;
    expect(runs[0]?.duration_ms).toBe(4200);
    expect(runs[0]?.cost_usd).toBe(0.05);
    const reviews = p.reviews as Array<Record<string, unknown>>;
    expect(reviews[0]).toHaveProperty('summary');
  });

  it('single failed run gives isError carrying the error and retry hint', async () => {
    const triggerReview = vi.fn(async (): Promise<ReviewRunResponse> => ({
      pr_id: 'pr1',
      runs: [{ run_id: 'run1', agent_id: 'agent1', agent_name: 'Reviewer A' }],
      reviews: [],
    }));
    const listRuns = vi.fn(async () => [runSummary({ status: 'failed', error: 'No API key configured' })]);
    const { deps } = makeDeps({ triggerReview, listRuns });

    const result = await runAgentOnPrHandler({ ...baseArgs, agent_id: 'agent1' }, deps, fakeExtra());
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('No API key configured');
    expect(text(result)).toContain('retry run_agent_on_pr');
  });

  it('multi with one failed + one done: payload has the done findings and a failed line', async () => {
    const triggerReview = vi.fn(async (): Promise<ReviewRunResponse> => ({
      pr_id: 'pr1',
      runs: [
        { run_id: 'run1', agent_id: 'agent1', agent_name: 'Reviewer A' },
        { run_id: 'run2', agent_id: 'agent2', agent_name: 'Reviewer B' },
      ],
      reviews: [],
    }));
    const listRuns = vi.fn(async () => [
      runSummary({ run_id: 'run1', status: 'done' }),
      runSummary({ run_id: 'run2', status: 'failed', error: 'provider error' }),
    ]);
    const listReviews = vi.fn(async (): Promise<ReviewRecord[]> => [
      review({ id: 'rev1', run_id: 'run1', agent_name: 'Reviewer A', findings: [finding({ id: 'f1' })] }),
    ]);
    const { deps } = makeDeps({ triggerReview, listRuns, listReviews });

    const result = await runAgentOnPrHandler({ ...baseArgs, all_agents: true }, deps, fakeExtra());
    expect(result.isError).toBe(true);
    const extra = JSON.parse(text(result).split('\n').slice(1).join('\n'));
    const results = extra.results as Array<Record<string, unknown>>;
    const done = results.find((r) => 'verdict' in r);
    const failed = results.find((r) => 'status' in r);
    expect(done).toBeDefined();
    expect(failed).toMatchObject({ agent_name: 'Reviewer B', status: 'failed', error: 'provider error' });
    expect((extra.findings as unknown[]).length).toBe(1);
  });

  it('timeout gives isError mentioning get_findings', async () => {
    const triggerReview = vi.fn(async (): Promise<ReviewRunResponse> => ({
      pr_id: 'pr1',
      runs: [{ run_id: 'run1', agent_id: 'agent1', agent_name: 'Reviewer A' }],
      reviews: [],
    }));
    const listRuns = vi.fn(async () => [runSummary({ status: 'running' })]);
    const { deps } = makeDeps({ triggerReview, listRuns }, 400_000); // one poll already exceeds the min 30s timeout

    const result = await runAgentOnPrHandler({ ...baseArgs, agent_id: 'agent1', timeout_seconds: 30 }, deps, fakeExtra());
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('get_findings');
  });

  it('a 429 on trigger gives the rate-limit message mentioning retry run_agent_on_pr', async () => {
    const triggerReview = vi.fn(async () => {
      throw new DevDigestApiError('Too Many Requests', 429);
    });
    const { deps } = makeDeps({ triggerReview, listRuns: async () => [] });

    const result = await runAgentOnPrHandler({ ...baseArgs, agent_id: 'agent1' }, deps, fakeExtra());
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('retry run_agent_on_pr');
  });

  it('a 404 "Agent not found" on trigger mentions list_agents', async () => {
    const triggerReview = vi.fn(async () => {
      throw new DevDigestApiError('Agent not found', 404);
    });
    const { deps } = makeDeps({ triggerReview, listRuns: async () => [] });

    const result = await runAgentOnPrHandler({ ...baseArgs, agent_id: 'missing' }, deps, fakeExtra());
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('list_agents');
  });
});
