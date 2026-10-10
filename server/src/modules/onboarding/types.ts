import type { Onboarding } from '@devdigest/shared';

/**
 * Onboarding Tour (SPEC-02 / L05) — internal shapes. Domain layer — pure types
 * only, no Fastify / Drizzle / adapter imports (`no-domain-outward`).
 */

/** Everything the generator needs to assemble its user message — gathered by the service. */
export interface OnboardingFacts {
  repoFullName: string;
  indexStatus: 'full' | 'partial' | 'degraded' | 'failed';
  filesIndexed: number;
  /** '' when degraded — the repo-map read failed or returned nothing. */
  repoMapText: string;
  criticalPaths: string[][];
  topFiles: string[];
  /** Already capped `Source: <path>\n\n<content>` entries (Project Context). */
  contextEntries: string[];
  contextTruncated: boolean;
}

/** The persisted `onboarding` row, parsed. */
export interface StoredTour {
  onboarding: Onboarding;
  generatedAt: Date;
}
