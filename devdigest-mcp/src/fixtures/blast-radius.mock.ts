import type { BlastRadius } from '@devdigest/shared';

/**
 * Static sample for get_blast_radius. Blast-radius analysis is not wired to
 * repo-intel yet in this lesson (L04) — this fixture exists so the tool's
 * output shape is already exactly `BlastRadius`, and wiring the real route
 * later only replaces the handler body (see Step 11 / Risks).
 */
export const BLAST_RADIUS_MOCK = {
  changed_symbols: [
    { name: 'ReviewService.runReview', file: 'server/src/modules/reviews/service.ts', kind: 'method' },
    { name: 'ReviewRunExecutor.executeRuns', file: 'server/src/modules/reviews/run-executor.ts', kind: 'method' },
  ],
  downstream: [
    {
      symbol: 'ReviewService.runReview',
      callers: [{ name: 'reviewsRoutes', file: 'server/src/modules/reviews/routes.ts', line: 37 }],
      endpoints_affected: ['POST /pulls/:id/review'],
      crons_affected: [],
    },
  ],
  summary:
    '[MOCK] Static sample — blast radius is not wired to repo-intel yet (L04). Do not base decisions on it.',
} as const satisfies BlastRadius;
