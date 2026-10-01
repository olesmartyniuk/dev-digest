import type { BlastRadiusResponse } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { DEGRADED_FALLBACK_REASON } from './constants.js';
import { toBlastRadiusResponse } from './helpers.js';
import type { BlastFacadeResult } from './types.js';

/**
 * Blast radius (L04) — read-only reshape of `container.repoIntel.getBlastRadius`
 * into `BlastRadiusResponse` (changed symbols → callers → endpoints/crons). No
 * new analysis, no LLM call. `pr_files` persistence lives in
 * `container.reviewRepo` (the composition root already owns cross-cutting pull
 * entities) — this service never imports `modules/reviews/*` or
 * `modules/repo-intel/*` directly (`no-cross-module-reach`).
 *
 * No `repository.ts`: this module owns no table.
 */
export class BlastService {
  constructor(private container: Container) {}

  async get(workspaceId: string, prId: string): Promise<BlastRadiusResponse> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const files = (await this.container.reviewRepo.getPrFiles(pull.id)).map((f) => f.path);

    let result: BlastFacadeResult;
    try {
      // Explicit annotation — the compile-time drift guard from types.ts:
      // repo-intel's real BlastResult must stay assignable to BlastFacadeResult.
      result = await this.container.repoIntel.getBlastRadius(pull.repoId, files);
    } catch {
      // Reads must never 500 just because the index is broken — matches the
      // "enrichment is best-effort" pattern (server/INSIGHTS.md, 2026-09-16).
      result = {
        changedSymbols: [],
        callers: [],
        impactedEndpoints: [],
        degraded: true,
        reason: DEGRADED_FALLBACK_REASON,
      };
    }

    return toBlastRadiusResponse(pull.id, result);
  }
}
