import { z } from 'zod';
import { BlastRadius } from './brief.js';

/**
 * L04 — Blast radius HTTP response: per changed symbol, its callers and the
 * HTTP endpoints / cron jobs reachable from them, reshaped from the
 * repo-intel facade's `BlastResult` (no new analysis, no LLM call).
 * Extends `BlastRadius` (brief.ts) rather than editing it — `BlastRadius`
 * stays the bare `PrBrief` building block (same rule as intent.ts).
 */

/** Mirrors repo-intel's DegradedReason (server/src/modules/repo-intel/types.ts:27-32). */
export const BlastDegradedReason = z.enum(['flag_off', 'index_failed', 'index_partial', 'repo_too_large', 'no_data']);
export type BlastDegradedReason = z.infer<typeof BlastDegradedReason>;

/** GET /pulls/:id/blast. */
export const BlastRadiusResponse = BlastRadius.extend({
  pr_id: z.string(),
  degraded: z.boolean(),
  degraded_reason: BlastDegradedReason.nullable(),
});
export type BlastRadiusResponse = z.infer<typeof BlastRadiusResponse>;
