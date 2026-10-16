/**
 * Pure helpers for the multi-agent module (side-effect free; no DB / network).
 * Grouping, conflicts and totals are always derived from persisted findings and
 * never stored.
 */
import { normalizeEvalPath, rangesOverlap } from '@devdigest/reviewer-core';
import type {
  FindingCategory,
  FindingRecord,
  MultiAgentColumn,
  MultiAgentFinding,
  MultiAgentGroup,
  MultiAgentLocation,
  MultiAgentRunStatus,
  MultiAgentTake,
  Severity,
} from '@devdigest/shared';
import type { FindingRow } from './repository.js';
import {
  CATEGORY_ORDER,
  DID_NOT_FLAG,
  MIN_DONE_FOR_DISAGREEMENT,
  SCOPE_KEYWORDS,
  SEVERITY_RANK,
  STATUS_DONE,
  STATUS_QUEUED,
  STATUS_RUNNING,
  TERMINAL_OR_RUNNING_STATUSES,
} from './constants.js';

/** PD-6: persisted status, or `queued` when it is not a known one. */
export function toColumnStatus(status: string | null): MultiAgentRunStatus {
  return (TERMINAL_OR_RUNNING_STATUSES as readonly string[]).includes(status ?? '')
    ? (status as MultiAgentRunStatus)
    : STATUS_QUEUED;
}

export type GroupableFinding = Omit<MultiAgentFinding, 'group_id'> & { columnIndex: number };

const lo = (f: { start_line: number; end_line: number }) => Math.min(f.start_line, f.end_line);
const hi = (f: { start_line: number; end_line: number }) => Math.max(f.start_line, f.end_line);
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** PD-2: transitive overlap grouping per normalized path, by sweep. */
export function groupFindings(findings: GroupableFinding[]): {
  groups: MultiAgentGroup[];
  groupIdByFindingId: Map<string, string>;
} {
  const byFile = new Map<string, GroupableFinding[]>();
  for (const f of findings) {
    const key = normalizeEvalPath(f.file);
    const list = byFile.get(key);
    if (list) list.push(f);
    else byFile.set(key, [f]);
  }

  type Acc = { span: [number, number]; members: GroupableFinding[] };
  const built: Array<{ group: MultiAgentGroup; normFile: string }> = [];
  const groupIdByFindingId = new Map<string, string>();

  for (const [normFile, list] of byFile) {
    const sorted = [...list].sort(
      (a, b) => lo(a) - lo(b) || hi(a) - hi(b) || a.columnIndex - b.columnIndex || cmp(a.id, b.id),
    );
    const accs: Acc[] = [];
    let cur: Acc | null = null;
    for (const f of sorted) {
      const range: [number, number] = [lo(f), hi(f)];
      if (cur && rangesOverlap(cur.span, range)) {
        cur.members.push(f);
        cur.span[1] = Math.max(cur.span[1], range[1]);
      } else {
        cur = { span: [range[0], range[1]], members: [f] };
        accs.push(cur);
      }
    }
    for (const acc of accs) {
      const rep = [...acc.members].sort(
        (a, b) =>
          SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
          a.columnIndex - b.columnIndex ||
          cmp(a.id, b.id),
      )[0]!;
      const id = acc.members[0]!.id;
      const runIds: string[] = [];
      for (const m of [...acc.members].sort((a, b) => a.columnIndex - b.columnIndex)) {
        if (!runIds.includes(m.run_id)) runIds.push(m.run_id);
        groupIdByFindingId.set(m.id, id);
      }
      built.push({
        normFile,
        group: {
          id,
          file: rep.file,
          start_line: acc.span[0],
          end_line: acc.span[1],
          title: rep.title,
          severity: rep.severity,
          finding_ids: acc.members.map((m) => m.id),
          run_ids: runIds,
        },
      });
    }
  }

  built.sort((a, b) => cmp(a.normFile, b.normFile) || a.group.start_line - b.group.start_line);
  return { groups: built.map((b) => b.group), groupIdByFindingId };
}

/** PD-3: derive an agent's scope from its name/description, else its findings. */
export function agentScope(
  name: string | null,
  description: string | null,
  categoriesInRun: FindingCategory[],
): FindingCategory | null {
  const text = `${name ?? ''} ${description ?? ''}`;
  for (const [category, re] of SCOPE_KEYWORDS) if (re.test(text)) return category;
  if (categoriesInRun.length === 0) return null;
  const counts = new Map<FindingCategory, number>();
  for (const c of categoriesInRun) counts.set(c, (counts.get(c) ?? 0) + 1);
  let best: FindingCategory | null = null;
  let bestN = 0;
  for (const c of CATEGORY_ORDER) {
    const n = counts.get(c) ?? 0;
    if (n > bestN) {
      best = c;
      bestN = n;
    }
  }
  return best;
}

/** PD-4/PD-5: per-location takes for every finished column. */
export function buildLocations(
  columns: MultiAgentColumn[],
  groups: MultiAgentGroup[],
  scopeByRunId: Map<string, FindingCategory | null>,
): MultiAgentLocation[] {
  const done = columns.filter((c) => c.status === STATUS_DONE);
  if (done.length < MIN_DONE_FOR_DISAGREEMENT) return [];

  return groups.map((g) => {
    const members = new Set(g.finding_ids);
    const takes: MultiAgentTake[] = done.map((c) => {
      const flagged = c.findings.filter((f) => members.has(f.id));
      if (flagged.length === 0) {
        return {
          run_id: c.run_id,
          agent_id: c.agent_id,
          agent_name: c.agent_name,
          verdict: DID_NOT_FLAG,
          scope: scopeByRunId.get(c.run_id) ?? null,
        };
      }
      const top = flagged.reduce<Severity>(
        (acc, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[acc] ? f.severity : acc),
        flagged[0]!.severity,
      );
      return { run_id: c.run_id, agent_id: c.agent_id, agent_name: c.agent_name, verdict: top, scope: null };
    });
    const anyDidNotFlag = takes.some((t) => t.verdict === DID_NOT_FLAG);
    const severities = new Set(takes.filter((t) => t.verdict !== DID_NOT_FLAG).map((t) => t.verdict));
    return {
      group_id: g.id,
      file: g.file,
      line: g.start_line,
      title: g.title,
      is_conflict: anyDidNotFlag || severities.size > 1,
      takes,
    };
  });
}

/** D10 / AC-33 totals. */
export function summarizeTotals(columns: MultiAgentColumn[]): {
  total_duration_ms: number | null;
  total_cost_usd: number | null;
  cost_complete: boolean;
  in_flight: boolean;
} {
  const durations = columns.map((c) => c.duration_ms).filter((d): d is number => d != null);
  const costs = columns.map((c) => c.cost_usd).filter((d): d is number => d != null);
  return {
    total_duration_ms: durations.length ? Math.max(...durations) : null,
    total_cost_usd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
    cost_complete: columns.every((c) => c.cost_usd != null),
    in_flight: columns.some((c) => c.status === STATUS_QUEUED || c.status === STATUS_RUNNING),
  };
}

/** Mirror of reviews/helpers.ts `findingRowToDto` (kept local: no cross-module reach). */
export function findingRowToRecord(row: FindingRow): FindingRecord {
  return {
    id: row.id,
    severity: row.severity as FindingRecord['severity'],
    category: row.category as FindingRecord['category'],
    title: row.title,
    file: row.file,
    start_line: row.startLine,
    end_line: row.endLine,
    rationale: row.rationale,
    suggestion: row.suggestion ?? null,
    confidence: row.confidence,
    kind: (row.kind as FindingRecord['kind']) ?? 'finding',
    trifecta_components: (row.trifectaComponents as FindingRecord['trifecta_components']) ?? null,
    evidence: null,
    review_id: row.reviewId,
    accepted_at: row.acceptedAt?.toISOString() ?? null,
    dismissed_at: row.dismissedAt?.toISOString() ?? null,
  };
}
