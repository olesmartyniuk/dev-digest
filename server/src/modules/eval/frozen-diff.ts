import type { UnifiedDiff } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { AppError } from '../../platform/errors.js';
import { ERR_INVALID_CASE } from './constants.js';

/**
 * Parse a case's frozen diff text. Isolated here because it is the only eval
 * file that touches `adapters/` (same pattern as `reviews/diff-loader.ts`; the
 * `no-service-imports-adapters-directly` rule only covers service/run-executor).
 *
 * A frozen diff that yields no files or no hunks can never be satisfied, so it
 * is rejected loudly rather than stored (spec edge case).
 */
export function parseFrozenDiff(text: string): UnifiedDiff {
  const diff = parseUnifiedDiff(text);
  const hunks = diff.files.reduce((n, f) => n + f.hunks.length, 0);
  if (diff.files.length === 0 || hunks === 0) {
    throw new AppError(
      ERR_INVALID_CASE,
      'The case diff is not a valid unified diff (no files or hunks found)',
      422,
    );
  }
  return diff;
}
