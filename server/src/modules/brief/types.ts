/**
 * PR Why + Risk Brief (SPEC-03 / L05) — internal shapes. Domain layer — pure
 * types only, no Fastify / Drizzle / adapter imports (`no-domain-outward`).
 */
import type { BlastCaller, RiskBrief, SmartDiffRole } from '@devdigest/shared';

/** Pre-computed facts the brief generator is fed — never a raw diff/patch body. */
export interface BriefFacts {
  description: string | null; // pull.body
  intent: { intent: string; inScope: string[]; outOfScope: string[] } | null;
  blast: { summary: string; callers: BlastCaller[] } | null; // null when missing (D4)
  files: { path: string; additions: number; deletions: number; role: SmartDiffRole | null }[]; // NEVER a patch
  contextEntries: string[]; // ResolvedRunContext.specs
  contextTruncated: boolean;
}

export interface BriefValidationResult {
  brief: RiskBrief;
  droppedRisks: number;
  droppedFocus: number;
}
