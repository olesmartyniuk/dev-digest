import type { SmartDiffResponse } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { buildSmartDiff } from './helpers.js';

/**
 * Smart Diff (L03) — deterministic, no-LLM path classification for the
 * "Files changed" tab. Owns the application logic for the `smart-diff`
 * module; `pr_files` persistence lives in `container.reviewRepo` (the
 * composition root already owns cross-cutting pull entities) — this service
 * never imports `modules/reviews/*` or `modules/pulls/*` directly
 * (`no-cross-module-reach`).
 *
 * No `repository.ts`: this module owns no table and reads no settings. No
 * `git.diff` call either — `pr_files` (path + line counts) is sufficient.
 */
export class SmartDiffService {
  constructor(private container: Container) {}

  async get(workspaceId: string, prId: string): Promise<SmartDiffResponse> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const rows = await this.container.reviewRepo.getPrFiles(pull.id);
    return buildSmartDiff(rows.map((r) => ({ path: r.path, additions: r.additions, deletions: r.deletions })));
  }
}
