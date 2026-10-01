/* BlastRadiusBlock/helpers.ts — pure functions, no React. */
import type { BlastDegradedReason, BlastRadiusResponse } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";

export interface BlastStats {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

/** Stats line counts: symbols from `changed_symbols`, the rest distinct across `downstream`. */
export function blastStats(b: BlastRadiusResponse): BlastStats {
  const callers = b.downstream.reduce((sum, d) => sum + d.callers.length, 0);
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  for (const d of b.downstream) {
    for (const e of d.endpoints_affected) endpoints.add(e);
    for (const c of d.crons_affected) crons.add(c);
  }
  return { symbols: b.changed_symbols.length, callers, endpoints: endpoints.size, crons: crons.size };
}

/** The `degraded.*` i18n key for a given reason (or the `unknown` fallback). */
export function degradedMessageKey(
  reason: BlastDegradedReason | null,
): `degraded.${BlastDegradedReason | "unknown"}` {
  return `degraded.${reason ?? "unknown"}`;
}

/** A GitHub blob link for a caller, or null when repo/sha context is missing. */
export function callerHref(
  repoFullName: string | null | undefined,
  headSha: string | null | undefined,
  file: string,
  line: number,
): string | null {
  return repoFullName && headSha ? githubBlobUrl(repoFullName, headSha, file, line) : null;
}
