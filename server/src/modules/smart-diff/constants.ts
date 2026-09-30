import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Smart Diff (L03) — deterministic, no-LLM path classification. No I/O, no
 * imports outside `@devdigest/shared` types: domain layer (`no-domain-outward`,
 * see .dependency-cruiser.cjs).
 */

/** Display order — also the order groups are emitted in. */
export const ROLE_ORDER = ['core', 'tests', 'wiring', 'docs', 'boilerplate'] as const satisfies readonly SmartDiffRole[];

export const LOCKFILE_BASENAMES = new Set(['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock']);
export const ROOT_BOILERPLATE_DIRS = new Set(['dist', 'build']);
export const TEST_DIR_SEGMENTS = new Set(['test', 'tests', '__tests__']);
export const ROOT_TEST_DIRS = new Set(['e2e']);
export const ROOT_WIRING_DIRS = new Set(['.github', '.claude']);
export const BARREL_BASENAMES = new Set(['index.ts', 'index.js']);
export const ROOT_DOCS_DIRS = new Set(['docs']);

// ---- Regexes ---------------------------------------------------------------

/** Also covers `.it.test.ts` (the `.it` segment is part of the basename). */
export const TEST_FILE_RE = /\.test\.tsx?$/;
export const SPEC_FILE_RE = /\.spec\.ts$/;
export const TSCONFIG_RE = /^tsconfig.*\.json$/;
export const DOCKER_COMPOSE_RE = /^docker-compose.*\.yml$/;
export const MARKDOWN_RE = /\.md$/i;
