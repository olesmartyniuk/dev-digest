import type { IntentSource, Provider } from '@devdigest/shared';

/**
 * Internal shapes of the intent classification pipeline. Domain layer — pure
 * types only, no Fastify / Drizzle / adapter imports (`no-domain-outward`).
 */

export type ReferenceKind = 'plan' | 'spec' | 'linked_issue';

/** A reference detected in the PR body, before it is resolved (read or not). */
export interface DetectedReference {
  kind: ReferenceKind;
  ref: string;
  target:
    | { type: 'repo_path'; path: string; ref: string | null }
    | { type: 'issue'; number: number }
    | { type: 'external'; reason: string };
}

/** A referenced plan/spec doc that was actually read. */
export interface ResolvedDoc {
  kind: 'plan' | 'spec';
  ref: string;
  content: string;
}

/** Everything gathered for one classification call, before prompt rendering. */
export interface IntentInput {
  title: string;
  description: string | null;
  issue: { number: number; title: string; body: string | null } | null;
  docs: ResolvedDoc[];
  files: { path: string; additions: number; deletions: number; headers: string[] }[];
  sources: IntentSource[];
}

/**
 * The logging surface the intent service needs. `RunLogger` satisfies this
 * structurally; declared locally so this module never imports `platform/`.
 */
export interface IntentLogSink {
  info(msg: string, data?: unknown): void;
  result(msg: string, data?: unknown): void;
  step<T>(
    label: string,
    fn: () => Promise<T>,
    opts?: { kind?: 'info' | 'tool' | 'result' | 'error'; data?: unknown },
  ): Promise<T>;
}

/**
 * Structural shape of the persisted `pr_intent` row, typed locally (NOT via a
 * Drizzle type) so `helpers.ts` never imports `db/` — see `no-domain-outward`.
 */
export interface PrIntentRowLike {
  prId: string;
  intent: string;
  inScope: string[];
  outOfScope: string[];
  confidence: 'high' | 'medium' | 'low';
  confidenceReason: string | null;
  sources: IntentSource[];
  provider: Provider | null;
  model: string | null;
  headSha: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  classifiedAt: Date;
}
