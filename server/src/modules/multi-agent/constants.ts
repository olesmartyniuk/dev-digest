import type { FindingCategory, Severity } from '@devdigest/shared';

/** Estimates average over an agent's most recent N completed runs (D16). */
export const ESTIMATE_SAMPLE_SIZE = 10;

/** Disagreement locations need at least this many finished columns (PD-4). */
export const MIN_DONE_FOR_DISAGREEMENT = 2;

export const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };

export const TERMINAL_OR_RUNNING_STATUSES = ['running', 'done', 'failed', 'cancelled'] as const;

export const STATUS_QUEUED = 'queued' as const;
export const STATUS_RUNNING = 'running' as const;
export const STATUS_DONE = 'done' as const;
export const DID_NOT_FLAG = 'did_not_flag' as const;

/** Ordered keyword -> category map used to derive an agent's scope (PD-3). */
export const SCOPE_KEYWORDS: ReadonlyArray<readonly [FindingCategory, RegExp]> = [
  ['security', /secur|vuln|auth|secret|inject|xss|csrf/i],
  ['perf', /perf|latency|speed|memory|efficien|n\+1/i],
  ['test', /\btest|coverage/i],
  ['style', /style|lint|convention|format|readab/i],
  ['bug', /bug|correct|logic/i],
];

/** FindingCategory enum order, used to break frequency ties deterministically. */
export const CATEGORY_ORDER: readonly FindingCategory[] = ['bug', 'security', 'perf', 'style', 'test'];
