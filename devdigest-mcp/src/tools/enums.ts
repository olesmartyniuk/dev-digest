import type { Severity, ConventionStatus, ConventionCategory } from '@devdigest/shared';

/**
 * Local re-declarations of enum literals that tool inputs need, kept as
 * literals (not a runtime import of @devdigest/shared — see root decision 1).
 * The `satisfies` + exhaustiveness checks below fail `pnpm typecheck` the
 * moment the shared enum gains a member this list doesn't know about.
 */
export const SEVERITIES = ['CRITICAL', 'WARNING', 'SUGGESTION'] as const satisfies readonly Severity[];
export type LocalSeverity = (typeof SEVERITIES)[number];

export const CONVENTION_STATUSES = ['pending', 'accepted', 'rejected'] as const satisfies readonly ConventionStatus[];
export type LocalConventionStatus = (typeof CONVENTION_STATUSES)[number];

export const CONVENTION_CATEGORIES = [
  'naming',
  'structure',
  'error_handling',
  'async',
  'typing',
  'imports',
  'testing',
  'api',
  'logging',
  'security',
  'formatting',
] as const satisfies readonly ConventionCategory[];
export type LocalConventionCategory = (typeof CONVENTION_CATEGORIES)[number];

export const RESPONSE_FORMATS = ['concise', 'detailed'] as const;
export type ResponseFormat = (typeof RESPONSE_FORMATS)[number];

export const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

// Exhaustiveness: fails to compile if @devdigest/shared adds a member we don't
// list here, so drift is caught at `pnpm typecheck` rather than at runtime.
type Exhaustive<All, Listed> = [Exclude<All, Listed>] extends [never] ? true : never;
const _sev: Exhaustive<Severity, (typeof SEVERITIES)[number]> = true;
const _st: Exhaustive<ConventionStatus, (typeof CONVENTION_STATUSES)[number]> = true;
const _cat: Exhaustive<ConventionCategory, (typeof CONVENTION_CATEGORIES)[number]> = true;
void _sev;
void _st;
void _cat;
