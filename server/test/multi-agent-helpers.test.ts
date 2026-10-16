import { describe, it, expect } from 'vitest';
import type { MultiAgentColumn, MultiAgentFinding, Severity } from '@devdigest/shared';
import { ReviewStartRequest } from '@devdigest/shared';
import {
  agentScope,
  buildLocations,
  groupFindings,
  summarizeTotals,
  toColumnStatus,
  type GroupableFinding,
} from '../src/modules/multi-agent/helpers.js';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

function finding(
  id: string,
  over: Partial<GroupableFinding> & { run_id?: string } = {},
): GroupableFinding {
  return {
    id,
    severity: 'WARNING',
    category: 'bug',
    title: `title ${id}`,
    file: 'src/a.ts',
    start_line: 10,
    end_line: 10,
    rationale: 'r',
    suggestion: null,
    confidence: 0.9,
    kind: 'finding',
    trifecta_components: null,
    evidence: null,
    review_id: 'rev',
    accepted_at: null,
    dismissed_at: null,
    run_id: 'run1',
    agent_id: 'ag1',
    columnIndex: 0,
    ...over,
  } as GroupableFinding;
}

function column(
  run_id: string,
  status: MultiAgentColumn['status'],
  findings: Array<{ id: string; severity: Severity }> = [],
  over: Partial<MultiAgentColumn> = {},
): MultiAgentColumn {
  return {
    run_id,
    agent_id: `ag-${run_id}`,
    agent_name: `Agent ${run_id}`,
    provider: null,
    model: null,
    status,
    error: null,
    verdict: null,
    summary: null,
    score: null,
    duration_ms: null,
    cost_usd: null,
    findings: findings.map(
      (f) => ({ ...finding(f.id, { severity: f.severity, run_id }), group_id: f.id }) as MultiAgentFinding,
    ),
    ...over,
  };
}

describe('toColumnStatus', () => {
  it('passes known statuses and maps the rest to queued', () => {
    expect(toColumnStatus('done')).toBe('done');
    expect(toColumnStatus('running')).toBe('running');
    expect(toColumnStatus(null)).toBe('queued');
    expect(toColumnStatus('weird')).toBe('queued');
  });
});

describe('groupFindings', () => {
  it('groups across a/ b/ ./ path prefixes when ranges overlap, ignoring severity/category/title', () => {
    const { groups, groupIdByFindingId } = groupFindings([
      finding('f1', { file: 'a/src/a.ts', start_line: 10, end_line: 12, severity: 'CRITICAL', run_id: 'r1' }),
      finding('f2', {
        file: './src/a.ts',
        start_line: 12,
        end_line: 14,
        severity: 'SUGGESTION',
        category: 'style',
        title: 'other',
        run_id: 'r2',
        columnIndex: 1,
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.finding_ids.sort()).toEqual(['f1', 'f2']);
    expect(groups[0]!.run_ids).toEqual(['r1', 'r2']);
    expect(groups[0]!.start_line).toBe(10);
    expect(groups[0]!.end_line).toBe(14);
    expect(groupIdByFindingId.get('f1')).toBe(groupIdByFindingId.get('f2'));
  });

  it('keeps non-overlapping ranges apart', () => {
    const { groups } = groupFindings([
      finding('f1', { start_line: 1, end_line: 2 }),
      finding('f2', { start_line: 5, end_line: 6, columnIndex: 1, run_id: 'r2' }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('chains A-B-C into one group and is order independent', () => {
    const a = finding('fa', { start_line: 1, end_line: 5 });
    const b = finding('fb', { start_line: 5, end_line: 9, columnIndex: 1, run_id: 'r2' });
    const c = finding('fc', { start_line: 9, end_line: 12, columnIndex: 2, run_id: 'r3' });
    const one = groupFindings([a, b, c]);
    const two = groupFindings([c, a, b]);
    expect(one.groups).toHaveLength(1);
    expect(two.groups).toEqual(one.groups);
    expect(one.groups[0]!.end_line).toBe(12);
  });

  it('picks the highest-severity finding as the representative (ties: column order)', () => {
    const { groups } = groupFindings([
      finding('w', { severity: 'WARNING', title: 'warn', columnIndex: 0 }),
      finding('c1', { severity: 'CRITICAL', title: 'crit-1', columnIndex: 2, run_id: 'r3' }),
      finding('c0', { severity: 'CRITICAL', title: 'crit-0', columnIndex: 1, run_id: 'r2' }),
    ]);
    expect(groups[0]!.title).toBe('crit-0');
    expect(groups[0]!.severity).toBe('CRITICAL');
  });
});

describe('buildLocations', () => {
  const groupsFor = (cols: MultiAgentColumn[]) =>
    groupFindings(cols.flatMap((c, i) => c.findings.map((f) => ({ ...f, columnIndex: i })))).groups;

  it('is empty with fewer than 2 done columns', () => {
    const cols = [column('r1', 'done', [{ id: 'f1', severity: 'WARNING' }]), column('r2', 'failed')];
    expect(buildLocations(cols, groupsFor(cols), new Map())).toEqual([]);
  });

  it('omits failed/cancelled columns and flags did-not-flag as a conflict', () => {
    const cols = [
      column('r1', 'done', [{ id: 'f1', severity: 'WARNING' }]),
      column('r2', 'done'),
      column('r3', 'failed'),
      column('r4', 'cancelled'),
    ];
    const locs = buildLocations(cols, groupsFor(cols), new Map([['r2', 'security']]));
    expect(locs).toHaveLength(1);
    expect(locs[0]!.takes.map((t) => t.run_id)).toEqual(['r1', 'r2']);
    expect(locs[0]!.takes[1]).toMatchObject({ verdict: 'did_not_flag', scope: 'security' });
    expect(locs[0]!.is_conflict).toBe(true);
  });

  it('flags severity divergence, and not agreement', () => {
    const diverge = [
      column('r1', 'done', [{ id: 'f1', severity: 'CRITICAL' }]),
      column('r2', 'done', [{ id: 'f2', severity: 'WARNING' }]),
    ];
    expect(buildLocations(diverge, groupsFor(diverge), new Map())[0]!.is_conflict).toBe(true);

    const agree = [
      column('r1', 'done', [{ id: 'f1', severity: 'WARNING' }]),
      column('r2', 'done', [{ id: 'f2', severity: 'WARNING' }]),
    ];
    expect(buildLocations(agree, groupsFor(agree), new Map())[0]!.is_conflict).toBe(false);
  });
});

describe('agentScope', () => {
  it('uses a keyword match first', () => {
    expect(agentScope('Security Reviewer', '', ['bug'])).toBe('security');
    expect(agentScope('Fast', 'checks latency', [])).toBe('perf');
  });
  it('falls back to the most frequent category, ties by enum order', () => {
    expect(agentScope('Generalist', '', ['style', 'style', 'perf'])).toBe('style');
    expect(agentScope('Generalist', '', ['test', 'perf'])).toBe('perf');
  });
  it('returns null with nothing to go on', () => {
    expect(agentScope('Generalist', '', [])).toBeNull();
  });
});

describe('summarizeTotals', () => {
  it('takes max duration, sums known costs and flags incomplete cost', () => {
    const t = summarizeTotals([
      column('r1', 'done', [], { duration_ms: 1000, cost_usd: 0.1 }),
      column('r2', 'done', [], { duration_ms: 3000, cost_usd: null }),
    ]);
    expect(t).toEqual({ total_duration_ms: 3000, total_cost_usd: 0.1, cost_complete: false, in_flight: false });
  });
  it('reports in-flight and unknown totals', () => {
    const t = summarizeTotals([column('r1', 'running')]);
    expect(t).toMatchObject({ total_duration_ms: null, total_cost_usd: null, in_flight: true });
  });
});

describe('ReviewStartRequest', () => {
  it('rejects duplicates, empty, mixed and non-uuid agentIds', () => {
    expect(ReviewStartRequest.safeParse({ agentIds: [UUID_A, UUID_A] }).success).toBe(false);
    expect(ReviewStartRequest.safeParse({ agentIds: [] }).success).toBe(false);
    expect(ReviewStartRequest.safeParse({ agentIds: ['nope'] }).success).toBe(false);
    expect(ReviewStartRequest.safeParse({ agentIds: [UUID_A], all: true }).success).toBe(false);
    expect(ReviewStartRequest.safeParse({ agentIds: [UUID_A], agentId: 'x' }).success).toBe(false);
  });
  it('accepts a valid list and the legacy forms', () => {
    expect(ReviewStartRequest.safeParse({ agentIds: [UUID_A, UUID_B] }).success).toBe(true);
    expect(ReviewStartRequest.safeParse({}).success).toBe(true);
    expect(ReviewStartRequest.safeParse({ all: true }).success).toBe(true);
    expect(ReviewStartRequest.safeParse({ agentId: 'x' }).success).toBe(true);
  });
});
