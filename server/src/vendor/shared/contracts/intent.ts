import { z } from 'zod';
import { Intent } from './brief.js';
import { Provider } from './knowledge.js';

/**
 * L03 — PR intent classification: a cheap-model call that derives WHY a PR
 * exists (title/description/linked issue/referenced plan-or-spec docs/hunk
 * headers only), stored per-PR and injected into every agent's review prompt.
 * Extends `Intent` (brief.ts) rather than editing it — `Intent` stays the
 * bare `PrBrief` building block.
 */

export const IntentConfidence = z.enum(['high', 'medium', 'low']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;

export const IntentSourceKind = z.enum(['title', 'description', 'linked_issue', 'plan', 'spec', 'hunk_headers']);
export type IntentSourceKind = z.infer<typeof IntentSourceKind>;

export const IntentSourceStatus = z.enum(['used', 'empty', 'unavailable', 'skipped']);
export type IntentSourceStatus = z.infer<typeof IntentSourceStatus>;

export const IntentSource = z.object({
  kind: IntentSourceKind,
  ref: z.string().nullable(), // path, #N, URL (truncated) or summary; never content
  status: IntentSourceStatus,
  note: z.string().nullable(), // why unavailable/skipped
});
export type IntentSource = z.infer<typeof IntentSource>;

/** Stored PR intent + provenance, as served by GET/POST /pulls/:id/intent. */
export const PrIntentView = Intent.extend({
  pr_id: z.string(),
  confidence: IntentConfidence,
  confidence_reason: z.string().nullable(),
  sources: z.array(IntentSource),
  provider: Provider.nullable(),
  model: z.string().nullable(),
  head_sha: z.string().nullable(),
  stale: z.boolean(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  classified_at: z.string(),
});
export type PrIntentView = z.infer<typeof PrIntentView>;

export const PrIntentResponse = z.object({
  intent: PrIntentView.nullable(),
  skipped: z.string().nullable(),
});
export type PrIntentResponse = z.infer<typeof PrIntentResponse>;
