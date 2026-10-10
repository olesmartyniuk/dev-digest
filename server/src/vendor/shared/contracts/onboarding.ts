import { z } from 'zod';
import { Onboarding } from './knowledge.js';

/**
 * Onboarding Tour (SPEC-02 / L05) — the envelope wrapping the unchanged
 * `Onboarding` contract (`contracts/knowledge.ts`) with the read/generate
 * metadata the feature needs (`generated_at`, `status`, `limited_data`).
 * Extends with a NEW file rather than editing `knowledge.ts`.
 */

export const OnboardingSectionKind = z.enum([
  'architecture',
  'critical_paths',
  'how_to_run',
  'reading_path',
  'first_tasks',
]);
export type OnboardingSectionKind = z.infer<typeof OnboardingSectionKind>;

export const OnboardingTourStatus = z.enum(['ready', 'not_generated']);
export type OnboardingTourStatus = z.infer<typeof OnboardingTourStatus>;

/** GET /repos/:id/onboarding and POST /repos/:id/onboarding/generate. */
export const OnboardingTour = z.object({
  repo_id: z.string(),
  status: OnboardingTourStatus,
  tour: Onboarding.nullable(), // null iff status === 'not_generated'
  generated_at: z.string().nullable(), // ISO; null iff not_generated
  limited_data: z.boolean(), // AC-14; false when not_generated
});
export type OnboardingTour = z.infer<typeof OnboardingTour>;

/** `details` of the 409 index_not_ready error envelope (AC-4). */
export const OnboardingIndexNotReady = z.object({
  index_status: z.enum(['full', 'partial', 'degraded', 'failed']),
});
export type OnboardingIndexNotReady = z.infer<typeof OnboardingIndexNotReady>;
