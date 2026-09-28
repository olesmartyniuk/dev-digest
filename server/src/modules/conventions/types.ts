import type {
  ConventionCategory,
  ConventionDropReason,
  ConventionOrigin,
} from '@devdigest/shared';

/**
 * Internal shapes of the extraction pipeline. Domain layer — pure types only,
 * no Fastify / Drizzle / adapter imports (`no-domain-outward`).
 */

/** One file read out of the clone, ready to be rendered into the prompt. */
export interface SampleFile {
  /** Repo-relative POSIX path. */
  path: string;
  /** File content, possibly truncated to the sample caps. */
  content: string;
  /** Lines of `content` (post-truncation) — the verifier's line bound. */
  lineCount: number;
  /** True when the content was cut off by a sample cap. */
  truncated: boolean;
}

/**
 * A rule proposed by the config pass or the model, BEFORE evidence
 * verification. Nothing in this shape is trusted: `evidencePath` may not
 * exist, `evidenceLine` may point past EOF, `evidenceSnippet` may be invented.
 */
export interface CandidateConvention {
  category: ConventionCategory;
  rule: string;
  rationale: string | null;
  evidencePath: string;
  evidenceLine: number;
  evidenceSnippet: string;
  confidence: number;
  origin: ConventionOrigin;
}

/** A candidate that survived verification, with its citation corrected. */
export interface VerifiedConvention extends CandidateConvention {
  /** Normalized rule text — the dedupe key within a repo. */
  ruleKey: string;
  /** True when the model's line was wrong and the snippet was found elsewhere. */
  lineCorrected: boolean;
}

/** A candidate that did not survive, with the reason it was dropped. */
export interface DroppedConvention {
  rule: string;
  path: string;
  reason: ConventionDropReason;
}

export interface VerificationOutcome {
  kept: VerifiedConvention[];
  dropped: DroppedConvention[];
}
