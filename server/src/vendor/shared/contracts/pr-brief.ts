import { z } from 'zod';
import { RiskBrief } from './brief.js';
import { Provider } from './knowledge.js';

/**
 * L05 / SPEC-03 — the generated PR brief as stored in pr_brief.json and served
 * by GET/POST /pulls/:id/brief. Extends RiskBrief (brief.ts) rather than
 * editing it — RiskBrief stays the model's own output schema.
 */
export const BriefMissingSource = z.enum(['intent', 'blast']);
export type BriefMissingSource = z.infer<typeof BriefMissingSource>;

export const PrBriefView = RiskBrief.extend({
  pr_id: z.string(),
  head_sha: z.string(), // commit the brief was generated against — bookkeeping only (AC-9)
  missing_sources: z.array(BriefMissingSource),
  provider: Provider,
  model: z.string(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  generated_at: z.string(), // ISO
});
export type PrBriefView = z.infer<typeof PrBriefView>;

export const PrBriefResponse = z.object({ brief: PrBriefView.nullable() });
export type PrBriefResponse = z.infer<typeof PrBriefResponse>;
