import type { BlastDegradedReason, BlastRadiusResponse, DownstreamImpact } from '@devdigest/shared';
import type { BlastFacadeResult } from './types.js';

/**
 * Pure reshape: `BlastFacadeResult` (flat callers, keyed by `viaSymbol`) →
 * `BlastRadiusResponse` (grouped per changed symbol). No I/O, no LLM — domain
 * layer (`no-domain-outward`).
 */

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Plain-ASCII, no-LLM summary for MCP/LLM consumers; the UI builds its own stats line. */
export function buildBlastSummary(
  changedSymbols: number,
  downstream: DownstreamImpact[],
  degraded: boolean,
  reason: BlastDegradedReason | null,
): string {
  const callers = downstream.reduce((sum, d) => sum + d.callers.length, 0);
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  for (const d of downstream) {
    for (const e of d.endpoints_affected) endpoints.add(e);
    for (const c of d.crons_affected) crons.add(c);
  }
  const base = [
    pluralize(changedSymbols, 'changed symbol'),
    pluralize(callers, 'caller'),
    pluralize(endpoints.size, 'endpoint'),
    pluralize(crons.size, 'cron job'),
  ].join(' · ');
  return degraded ? `${base} — index incomplete (${reason ?? 'unknown'})` : base;
}

export function toBlastRadiusResponse(prId: string, r: BlastFacadeResult): BlastRadiusResponse {
  const changed_symbols = r.changedSymbols.map((s) => ({ name: s.name, file: s.file, kind: s.kind }));

  // Group callers by viaSymbol, preserving the facade's caller order inside
  // each group (the persistent path already sorts by rank DESC).
  const groups = new Map<string, BlastFacadeResult['callers']>();
  for (const c of r.callers) {
    const list = groups.get(c.viaSymbol);
    if (list) list.push(c);
    else groups.set(c.viaSymbol, [c]);
  }

  // Order groups by the first index at which that name appears in
  // changedSymbols; names that don't appear there go last, alphabetically.
  const firstIndex = new Map<string, number>();
  r.changedSymbols.forEach((s, i) => {
    if (!firstIndex.has(s.name)) firstIndex.set(s.name, i);
  });
  const orderedNames = [...groups.keys()].sort((a, b) => {
    const ia = firstIndex.get(a);
    const ib = firstIndex.get(b);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return a.localeCompare(b);
  });

  const downstream: DownstreamImpact[] = orderedNames.map((name) => {
    const rows = groups.get(name)!;
    const callers = rows.map((row) => ({ name: row.symbol, file: row.file, line: row.line }));
    const callerFiles = [...new Set(rows.map((row) => row.file))];
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const file of callerFiles) {
      const facts = r.factsByFile?.[file];
      for (const e of facts?.endpoints ?? []) endpoints.add(e);
      for (const c of facts?.crons ?? []) crons.add(c);
    }
    return {
      symbol: name,
      callers,
      endpoints_affected: [...endpoints].sort((a, b) => a.localeCompare(b)),
      crons_affected: [...crons].sort((a, b) => a.localeCompare(b)),
    };
  });

  const degraded = r.degraded === true;
  const degraded_reason = degraded ? (r.reason ?? null) : null;

  return {
    pr_id: prId,
    changed_symbols,
    downstream,
    summary: buildBlastSummary(changed_symbols.length, downstream, degraded, degraded_reason),
    degraded,
    degraded_reason,
  };
}
