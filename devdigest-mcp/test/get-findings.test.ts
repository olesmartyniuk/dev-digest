import { describe, expect, it, vi } from 'vitest';
import type { ReviewRecord } from '@devdigest/shared';
import { DevDigestApiError } from '../src/api/client.js';
import type { DevDigestApi } from '../src/api/endpoints.js';
import { getFindingsHandler, projectFinding } from '../src/tools/get-findings.js';
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
    agent_name: 'Reviewer',
    kind: 'review',
    verdict: 'request_changes',
    summary: 'summary text',
    score: 70,
    model: 'gpt-5',
    grounding: 'ok',
    created_at: '2026-01-01T00:00:00Z',
    findings: [],
    ...overrides,
  };
}

function deps(reviews: ReviewRecord[]): ToolDeps {
  const listReviews: DevDigestApi['listReviews'] = async () => reviews;
  const api = { listReviews } as unknown as DevDigestApi;
  return { api, config: {} as ToolDeps['config'], sleep: vi.fn(), now: () => 0 };
}

function payload(result: Awaited<ReturnType<typeof getFindingsHandler>>): Record<string, unknown> {
  const first = result.content[0];
  return JSON.parse(first && 'text' in first ? (first.text as string) : '{}');
}

const baseArgs = {
  pr_id: 'pr1',
  include_dismissed: false,
  limit: 25,
  offset: 0,
  response_format: 'concise' as const,
};

describe('getFindingsHandler', () => {
  const reviews = [
    review({
      id: 'rev1',
      run_id: 'run1',
      agent_id: 'agent1',
      agent_name: 'Reviewer A',
      findings: [
        finding({ id: 'f1', severity: 'CRITICAL', file: 'b.ts', start_line: 5 }),
        finding({ id: 'f2', severity: 'WARNING', file: 'a.ts', start_line: 1 }),
        finding({ id: 'f3', severity: 'SUGGESTION', file: 'a.ts', start_line: 10 }),
        finding({ id: 'f4', severity: 'WARNING', file: 'a.ts', start_line: 2, dismissed_at: '2026-01-02T00:00:00Z' }),
      ],
    }),
    review({
      id: 'rev2',
      run_id: 'run2',
      agent_id: 'agent2',
      agent_name: 'Reviewer B',
      findings: [finding({ id: 'f5', severity: 'CRITICAL', file: 'c.ts', start_line: 1 })],
    }),
  ];

  it('sorts most-severe-first, then file, then line', async () => {
    const result = await getFindingsHandler({ ...baseArgs }, deps(reviews));
    const p = payload(result);
    const ids = (p.findings as Array<{ title: string }>).length;
    expect(ids).toBeGreaterThan(0);
    const severities = (p.findings as Array<{ severity: string }>).map((f) => f.severity);
    expect(severities).toEqual(['CRITICAL', 'CRITICAL', 'WARNING', 'SUGGESTION']);
  });

  it('filters by run_id, agent_id and severity', async () => {
    const byRun = payload(await getFindingsHandler({ ...baseArgs, run_id: 'run2' }, deps(reviews)));
    expect((byRun.findings as unknown[]).length).toBe(1);

    const byAgent = payload(await getFindingsHandler({ ...baseArgs, agent_id: 'agent1' }, deps(reviews)));
    expect((byAgent.findings as unknown[]).length).toBe(3);

    const bySeverity = payload(
      await getFindingsHandler({ ...baseArgs, severity: ['CRITICAL'] }, deps(reviews)),
    );
    expect((bySeverity.findings as unknown[]).length).toBe(2);
  });

  it('hides dismissed findings by default', async () => {
    const result = payload(await getFindingsHandler({ ...baseArgs, run_id: 'run1' }, deps(reviews)));
    expect((result.findings as unknown[]).length).toBe(3);
    const withDismissed = payload(
      await getFindingsHandler({ ...baseArgs, run_id: 'run1', include_dismissed: true }, deps(reviews)),
    );
    expect((withDismissed.findings as unknown[]).length).toBe(4);
  });

  it('paginates with next_offset', async () => {
    const page1 = payload(await getFindingsHandler({ ...baseArgs, limit: 2, offset: 0 }, deps(reviews)));
    expect(page1.next_offset).toBe(2);
    const page2 = payload(await getFindingsHandler({ ...baseArgs, limit: 2, offset: 2 }, deps(reviews)));
    expect(page2.next_offset).toBeNull();
  });

  it('concise payload has exactly the expected keys and omits id/rationale', async () => {
    const p = payload(await getFindingsHandler({ ...baseArgs }, deps(reviews)));
    expect(Object.keys(p).sort()).toEqual(['findings', 'next_offset', 'pr_id', 'results', 'total']);
    const f = (p.findings as Array<Record<string, unknown>>)[0];
    expect(f).not.toHaveProperty('id');
    expect(f).not.toHaveProperty('rationale');
    const r = (p.results as Array<Record<string, unknown>>)[0]!;
    expect(Object.keys(r).sort()).toEqual(['agent_name', 'findings_count', 'run_id', 'score', 'verdict'].sort());
  });

  it('detailed payload has reviews[] with summary/created_at and findings with id/rationale', async () => {
    const p = payload(await getFindingsHandler({ ...baseArgs, response_format: 'detailed' }, deps(reviews)));
    expect(p).toHaveProperty('reviews');
    const r = (p.reviews as Array<Record<string, unknown>>)[0];
    expect(r).toHaveProperty('summary');
    expect(r).toHaveProperty('created_at');
    const f = (p.findings as Array<Record<string, unknown>>)[0];
    expect(f).toHaveProperty('id');
    expect(f).toHaveProperty('rationale');
  });

  it('projectFinding omit drops agent_name/run_id only in concise', () => {
    const pf = { ...finding(), run_id: 'run1', agent_name: 'Reviewer A' };
    const concise = projectFinding(pf, 'concise', ['agent_name', 'run_id']);
    expect(concise).not.toHaveProperty('agent_name');
    expect(concise).not.toHaveProperty('run_id');
    const detailed = projectFinding(pf, 'detailed', ['agent_name', 'run_id']);
    expect(detailed).toHaveProperty('agent_name');
    expect(detailed).toHaveProperty('run_id');
  });

  it('notes when there are no reviews at all', async () => {
    const p = payload(await getFindingsHandler({ ...baseArgs, pr_id: 'empty' }, deps([])));
    expect(p.note).toContain('run_agent_on_pr');
  });

  it('notes when filters leave zero findings', async () => {
    const p = payload(
      await getFindingsHandler({ ...baseArgs, run_id: 'run2', severity: ['SUGGESTION'] }, deps(reviews)),
    );
    // run2 only has a CRITICAL finding -> the severity filter leaves zero
    expect(p.note).toContain('include_dismissed');
  });

  it('notes when run_id matches no review', async () => {
    const p = payload(await getFindingsHandler({ ...baseArgs, run_id: 'missing-run' }, deps(reviews)));
    expect(p.note).toContain('No review for run_id missing-run');
    expect((p.results as unknown[]).length).toBeGreaterThan(0);
  });

  it('a 404 from the API gives isError with the GitHub PR number hint', async () => {
    const d: ToolDeps = {
      api: { listReviews: async () => { throw new DevDigestApiError('Pull request not found', 404); } } as unknown as DevDigestApi,
      config: {} as ToolDeps['config'],
      sleep: vi.fn(),
      now: () => 0,
    };
    const result = await getFindingsHandler({ ...baseArgs }, d);
    expect(result.isError).toBe(true);
    const text = result.content[0] && 'text' in result.content[0] ? (result.content[0].text as string) : '';
    expect(text).toContain('not the GitHub PR number');
  });
});
