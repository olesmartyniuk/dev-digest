import { z } from 'zod';
import { SkillType } from './knowledge.js';

/**
 * Conventions Extractor (L02) — house rules mined out of a cloned repo and
 * promoted into a Skill.
 *
 * This file EXTENDS the barrel; `knowledge.ts`'s older `ConventionCandidate`
 * (id/rule/evidence/accepted) stays untouched. It predates the feature and has
 * no room for a category, an evidence LINE, a rejected state, or the
 * config-vs-model distinction the extractor needs, so the feature ships its own
 * contract rather than rewriting a published one.
 *
 * The pipeline these types describe:
 *   sample (code)  →  propose (cheap LLM)  →  VERIFY the evidence (code)  →
 *   accept/reject (human)  →  merge into one Skill.
 * Nothing the model claims is persisted until a code-level check has found the
 * cited snippet in the cited file — see `ConventionDrop`.
 */

// ---- Category ----
/**
 * Buckets a rule can fall into. Deliberately coarse: the category only groups
 * the Skill body into sections and lets the UI filter, so a wrong-but-adjacent
 * guess from the model costs nothing.
 */
export const ConventionCategory = z.enum([
  'naming',
  'structure',
  'error_handling',
  'async',
  'typing',
  'imports',
  'testing',
  'api',
  'logging',
  'security',
  'formatting',
]);
export type ConventionCategory = z.infer<typeof ConventionCategory>;

// ---- Lifecycle ----
/**
 * A candidate starts `pending`. The human verdict is what makes it part of the
 * Skill (`accepted`) or keeps it out of every future scan (`rejected`) — a
 * re-scan only ever replaces `pending` rows, so a verdict is never re-asked.
 */
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

/**
 * Where a candidate came from:
 *  - `config`: derived in code from eslint/tsconfig/prettier/package.json. No
 *    model involved, so its evidence is exact by construction.
 *  - `model`: proposed by the LLM from sampled source files, then verified.
 */
export const ConventionOrigin = z.enum(['config', 'model']);
export type ConventionOrigin = z.infer<typeof ConventionOrigin>;

// ---- Evidence ----
/** A verified citation: the file, the 1-based line, and the text found there. */
export const ConventionEvidence = z.object({
  path: z.string(),
  line: z.number().int().min(1),
  snippet: z.string(),
});
export type ConventionEvidence = z.infer<typeof ConventionEvidence>;

// ---- The persisted candidate ----
export const Convention = z.object({
  id: z.string(),
  repo_id: z.string(),
  category: ConventionCategory,
  rule: z.string(),
  rationale: z.string().nullable(),
  evidence: ConventionEvidence,
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
  origin: ConventionOrigin,
  created_at: z.string(),
});
export type Convention = z.infer<typeof Convention>;

// ---- Extraction run ----
/** Why a proposed candidate never reached the database. */
export const ConventionDropReason = z.enum([
  'file_not_sampled',
  'file_missing',
  'snippet_not_found',
  'low_confidence',
  'duplicate',
  'already_judged',
]);
export type ConventionDropReason = z.infer<typeof ConventionDropReason>;

/**
 * One dropped candidate. Mirrors the review pipeline's G3 rule: the extractor
 * never drops silently — every rejection is reported with its reason so a scan
 * that yields little can be diagnosed instead of guessed at.
 */
export const ConventionDrop = z.object({
  rule: z.string(),
  path: z.string(),
  reason: ConventionDropReason,
});
export type ConventionDrop = z.infer<typeof ConventionDrop>;

export const ConventionExtractStats = z.object({
  /** Source files fed to the model. */
  sampled_files: z.number().int(),
  /** Config files read for the deterministic (no-model) pass. */
  config_files: z.number().int(),
  /** Candidates proposed before verification (config + model). */
  proposed: z.number().int(),
  /** Candidates that survived verification and were persisted. */
  kept: z.number().int(),
  /** Candidates whose cited line was wrong but whose snippet was found elsewhere. */
  line_corrected: z.number().int(),
  /** The model that ran, or `null` when the model pass was skipped. */
  model: z.string().nullable(),
  /**
   * Why the model pass did not contribute — no API key, or the provider call
   * failed. The config pass needs no model, so a scan still returns the rules
   * the repo has written down rather than failing outright; this field is what
   * stops that degraded result from looking like a complete one.
   */
  model_skipped: z.string().nullable(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int(),
});
export type ConventionExtractStats = z.infer<typeof ConventionExtractStats>;

export const ConventionExtractResult = z.object({
  conventions: z.array(Convention),
  stats: ConventionExtractStats,
  drops: z.array(ConventionDrop),
});
export type ConventionExtractResult = z.infer<typeof ConventionExtractResult>;

// ---- Promotion to a Skill ----
/**
 * The server-rendered draft the "Create skill" modal opens with. Assembling the
 * markdown on the server keeps one implementation of the merge (the same one a
 * future CLI or eval harness would call) and lets the client stay a plain form:
 * the user edits this draft freely before it is saved.
 */
export const ConventionSkillDraft = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  /** The accepted conventions merged into `body`. */
  convention_ids: z.array(z.string()),
});
export type ConventionSkillDraft = z.infer<typeof ConventionSkillDraft>;
