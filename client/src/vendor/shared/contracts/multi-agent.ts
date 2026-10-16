import { z } from 'zod';
import { Severity, FindingCategory, Verdict } from './findings.js';
import { FindingRecord, ReviewRunResponse } from './review-api.js';
import { RunRequest } from './platform.js';

/**
 * SPEC-05 — Multi-agent review contracts. Extends the existing review start
 * request and adds the read shapes for the results page. `observability.ts`
 * (`MultiAgentRun` / `AgentColumn` / `Conflict`) is deliberately untouched; the
 * richer shapes live here.
 */

// ---- start (D2) ----
export const ReviewStartRequest = RunRequest.extend({
  agentIds: z.array(z.string().uuid()).min(1).optional(),
}).superRefine((b, ctx) => {
  if (b.agentIds && (b.agentId !== undefined || b.all !== undefined))
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['agentIds'],
      message: 'Provide exactly one of agentId, all, agentIds',
    });
  if (b.agentIds && new Set(b.agentIds).size !== b.agentIds.length)
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['agentIds'],
      message: 'agentIds must not contain duplicates',
    });
});
export type ReviewStartRequest = z.infer<typeof ReviewStartRequest>;

export const ReviewStartResponse = ReviewRunResponse.extend({
  /** Present only for the agentIds form (D6). */
  multi_agent_run_id: z.string().optional(),
});
export type ReviewStartResponse = z.infer<typeof ReviewStartResponse>;

// ---- results view ----
export const MultiAgentRunStatus = z.enum(['queued', 'running', 'done', 'failed', 'cancelled']);
export type MultiAgentRunStatus = z.infer<typeof MultiAgentRunStatus>;

export const MultiAgentFinding = FindingRecord.extend({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  group_id: z.string(),
});
export type MultiAgentFinding = z.infer<typeof MultiAgentFinding>;

export const MultiAgentColumn = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: MultiAgentRunStatus,
  error: z.string().nullable(),
  verdict: Verdict.nullable(),
  summary: z.string().nullable(),
  score: z.number().int().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  findings: z.array(MultiAgentFinding),
});
export type MultiAgentColumn = z.infer<typeof MultiAgentColumn>;

export const MultiAgentGroup = z.object({
  id: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  title: z.string(),
  severity: Severity,
  finding_ids: z.array(z.string()),
  run_ids: z.array(z.string()), // contributors, column order
});
export type MultiAgentGroup = z.infer<typeof MultiAgentGroup>;

export const MultiAgentTake = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  verdict: z.union([Severity, z.literal('did_not_flag')]),
  /** Only for did_not_flag: the agent's derived scope (PD-3); null -> generic reason. */
  scope: FindingCategory.nullable(),
});
export type MultiAgentTake = z.infer<typeof MultiAgentTake>;

/** Conflict definition = observability.ts `Conflict` docblock (AC-22). */
export const MultiAgentLocation = z.object({
  group_id: z.string(),
  file: z.string(),
  line: z.number().int(),
  title: z.string(),
  is_conflict: z.boolean(),
  takes: z.array(MultiAgentTake),
});
export type MultiAgentLocation = z.infer<typeof MultiAgentLocation>;

export const MultiAgentRunView = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int(),
  pr_title: z.string(),
  repo_id: z.string(),
  ran_at: z.string(),
  agent_count: z.number().int(),
  total_duration_ms: z.number().int().nullable(), // D10: max of persisted durations
  total_cost_usd: z.number().nullable(), // D10: sum of known costs
  cost_complete: z.boolean(), // AC-33: false if any column cost is null
  in_flight: z.boolean(), // any column queued|running
  columns: z.array(MultiAgentColumn),
  groups: z.array(MultiAgentGroup),
  locations: z.array(MultiAgentLocation),
});
export type MultiAgentRunView = z.infer<typeof MultiAgentRunView>;

export const MultiAgentLatestResponse = z.object({ id: z.string().nullable() });
export type MultiAgentLatestResponse = z.infer<typeof MultiAgentLatestResponse>;

// ---- estimates (D16) ----
export const AgentRunEstimate = z.object({
  agent_id: z.string(),
  sample_size: z.number().int(),
  mean_duration_ms: z.number().nullable(),
  mean_cost_usd: z.number().nullable(),
});
export type AgentRunEstimate = z.infer<typeof AgentRunEstimate>;
