/**
 * Project Context (L05) — tunables. No I/O, no imports outside this file:
 * `constants.ts` is domain-layer (see .dependency-cruiser.cjs `no-domain-outward`).
 */

/** The only extension the scan ever picks up. */
export const CONTEXT_DOC_EXTENSION = '.md';

/** Depth limit for the repo scan, so a monorepo clone can't blow the budget. */
export const CONTEXT_WALK_MAX_DEPTH = 12;
/** File-count limit for the repo scan. */
export const CONTEXT_WALK_MAX_FILES = 500;

/** A document preview above this many bytes is rejected (422), not read. */
export const CONTEXT_MAX_PREVIEW_BYTES = 1_000_000;

/** Directories the scan never descends into (beyond dot-directories). */
export const CONTEXT_SKIP_DIRECTORIES = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
] as const;

/** Prefix for the `Source: <path>` citation line (`formatContextEntry`, AC-16). */
export const CONTEXT_SOURCE_PREFIX = 'Source: ';
