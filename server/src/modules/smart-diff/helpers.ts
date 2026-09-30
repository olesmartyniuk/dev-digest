import type { SmartDiff, SmartDiffFile, SmartDiffRole } from '@devdigest/shared';
import {
  BARREL_BASENAMES,
  DOCKER_COMPOSE_RE,
  LOCKFILE_BASENAMES,
  MARKDOWN_RE,
  ROLE_ORDER,
  ROOT_BOILERPLATE_DIRS,
  ROOT_DOCS_DIRS,
  ROOT_TEST_DIRS,
  ROOT_WIRING_DIRS,
  SPEC_FILE_RE,
  TEST_DIR_SEGMENTS,
  TEST_FILE_RE,
  TSCONFIG_RE,
} from './constants.js';
import type { SmartDiffInputFile } from './types.js';

/**
 * Pure, deterministic path classification + Smart Diff response builder. No
 * LLM call anywhere in this file — see the plan's decision A/B: `finding_lines`
 * is always `[]` (the client owns finding↔file association) and
 * `pseudocode_summary` is always `null` (reserved for a later lesson).
 */

/** Replace `\` with `/` and strip a leading `./`. */
export function normalizePath(path: string): string {
  const slashed = path.replace(/\\/g, '/');
  return slashed.startsWith('./') ? slashed.slice(2) : slashed;
}

/**
 * Classify a repo-relative path into a `SmartDiffRole`. FIRST MATCH WINS,
 * checked in exactly this order: boilerplate → tests → wiring → docs → core.
 * Do not reorder these — see the plan's recorded edge cases (a `.snap` file
 * under `__tests__/` is boilerplate, not tests; a `.md` file under `.claude/`
 * or `e2e/` is wiring/tests, not docs).
 */
export function classifyPath(path: string): SmartDiffRole {
  const normalized = normalizePath(path);
  const segments = normalized.split('/');
  const basename = segments[segments.length - 1] ?? '';
  const dirs = segments.slice(0, -1);
  const rootDir = segments[0] ?? '';
  const rootAnchored = segments.length > 1;

  // 1. boilerplate
  if (
    basename.endsWith('.lock') ||
    LOCKFILE_BASENAMES.has(basename) ||
    (ROOT_BOILERPLATE_DIRS.has(rootDir) && rootAnchored) ||
    dirs.includes('__snapshots__') ||
    basename.endsWith('.snap') ||
    basename.includes('.generated.') ||
    basename.endsWith('.min.js')
  ) {
    return 'boilerplate';
  }

  // 2. tests
  if (
    TEST_FILE_RE.test(basename) ||
    SPEC_FILE_RE.test(basename) ||
    dirs.some((d) => TEST_DIR_SEGMENTS.has(d)) ||
    (ROOT_TEST_DIRS.has(rootDir) && rootAnchored)
  ) {
    return 'tests';
  }

  // 3. wiring
  if (
    BARREL_BASENAMES.has(basename) ||
    basename.includes('.config.') ||
    TSCONFIG_RE.test(basename) ||
    basename.startsWith('.eslintrc') ||
    basename.startsWith('.env') ||
    DOCKER_COMPOSE_RE.test(basename) ||
    (ROOT_WIRING_DIRS.has(rootDir) && rootAnchored)
  ) {
    return 'wiring';
  }

  // 4. docs
  if (
    MARKDOWN_RE.test(basename) ||
    (ROOT_DOCS_DIRS.has(rootDir) && rootAnchored) ||
    basename.startsWith('README') ||
    basename.startsWith('CHANGELOG') ||
    basename === 'LICENSE'
  ) {
    return 'docs';
  }

  // 5. otherwise core
  return 'core';
}

/**
 * Classify + bucket + sort every file, and compute the (always-inert)
 * `split_suggestion`. `pr_files` has no ORDER BY, so this is the one place
 * that makes the response deterministic regardless of DB row order.
 */
export function buildSmartDiff(files: SmartDiffInputFile[]): SmartDiff {
  const byRole = new Map<SmartDiffRole, SmartDiffFile[]>();
  let totalLines = 0;

  for (const f of files) {
    totalLines += f.additions + f.deletions;
    const role = classifyPath(f.path);
    const list = byRole.get(role) ?? [];
    list.push({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      pseudocode_summary: null,
      finding_lines: [],
    });
    byRole.set(role, list);
  }

  const groups = ROLE_ORDER.filter((role) => byRole.has(role)).map((role) => ({
    role,
    files: [...byRole.get(role)!].sort((a, b) => a.path.localeCompare(b.path)),
  }));

  return {
    groups,
    split_suggestion: { too_big: false, total_lines: totalLines, proposed_splits: [] },
  };
}
