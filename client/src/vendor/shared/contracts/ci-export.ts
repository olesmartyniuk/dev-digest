import { z } from 'zod';
import { CiTarget, CiInstallation, CiExportInput, CiResultArtifact } from './eval-ci.js';
import { CiFailOn } from './knowledge.js';
import { RunDependencies } from './trace.js';

/**
 * SPEC-05 — Export-to-CI contracts. A NEW file: it extends the barrel without
 * rewriting `eval-ci.ts`. Server and client copies must stay byte-identical.
 */

/** `owner/name` — validated before any GitHub call or generated file. */
export const CI_REPO_FULL_NAME_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
/** Lowercase kebab slug — the only agent/skill identifier interpolated into paths and shell lines. */
export const CI_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const CiTrigger = z.enum(['opened', 'synchronize', 'reopened']);
export type CiTrigger = z.infer<typeof CiTrigger>;

/** `github_review | pr_comment | none` — reused from the existing export input. */
export const CiPostAs = CiExportInput.shape.post_as;
export type CiPostAs = z.infer<typeof CiPostAs>;

/** Request body for `POST /agents/:id/export-ci/preview`. */
export const CiPreviewInput = z.object({
  repo_id: z.string().uuid(),
  target: CiTarget.default('gha'),
  post_as: CiPostAs.default('github_review'),
  triggers: z.array(CiTrigger).min(1).default(['opened', 'synchronize']),
});
export type CiPreviewInput = z.infer<typeof CiPreviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiPreviewInputBody = z.input<typeof CiPreviewInput>;

export const CiPreviewFile = z.object({
  path: z.string(),
  contents: z.string(),
  editable: z.boolean(),
  exists: z.boolean(),
});
export type CiPreviewFile = z.infer<typeof CiPreviewFile>;

export const CiPreview = z.object({
  repo: z.string(),
  base_branch: z.string(),
  agent_slug: z.string(),
  files: z.array(CiPreviewFile),
  openrouter_key_ready: z.boolean(),
  existing_installation_id: z.string().nullable(),
});
export type CiPreview = z.infer<typeof CiPreview>;

/** Request body for `POST /agents/:id/export-ci`. */
export const CiInstallInput = CiPreviewInput.extend({
  action: CiExportInput.shape.action,
  /** The user's edited workflow text — the ONLY file the client may override. */
  workflow: z.string().min(1).max(100_000).optional(),
});
export type CiInstallInput = z.infer<typeof CiInstallInput>;
export type CiInstallInputBody = z.input<typeof CiInstallInput>;

/** Ingested runs are never `running`, so this is a subset of `CiRunStatus`. */
export const CiVerdict = z.enum(['succeeded', 'failed', 'no_findings']);
export type CiVerdict = z.infer<typeof CiVerdict>;

export const CiLatestRun = z.object({
  status: CiVerdict,
  ran_at: z.string(),
  blocking: z.boolean(),
});
export type CiLatestRun = z.infer<typeof CiLatestRun>;

export const CiInstallationView = CiInstallation.extend({
  agent_slug: z.string().nullable(),
  workflow_version: z.number().int().nullable(),
  out_of_date: z.boolean(),
  pr_url: z.string().nullable(),
  latest_run: CiLatestRun.nullable(),
});
export type CiInstallationView = z.infer<typeof CiInstallationView>;

export const CiRunRow = z.object({
  id: z.string(),
  ran_at: z.string(),
  repo: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  status: CiVerdict,
  blocking: z.boolean(),
  findings_count: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  job_url: z.string().nullable(),
});
export type CiRunRow = z.infer<typeof CiRunRow>;

/** Response of `GET /agents/:id/ci`. */
export const AgentCiOverview = z.object({
  agent_id: z.string(),
  agent_version: z.number().int(),
  ci_fail_on: CiFailOn,
  installations: z.array(CiInstallationView),
  runs: z.array(CiRunRow),
});
export type AgentCiOverview = z.infer<typeof AgentCiOverview>;

export const CiSyncInput = z.object({ agent_id: z.string().uuid().optional() });
export type CiSyncInput = z.infer<typeof CiSyncInput>;

export const CiSyncResult = z.object({
  ingested: z.number().int(),
  skipped: z.number().int(),
  error: z.string().nullable(),
});
export type CiSyncResult = z.infer<typeof CiSyncResult>;

/** The `devdigest-result.json` shape the runner uploads and the studio ingests. */
export const CiRunResult = CiResultArtifact.extend({
  status: CiVerdict,
  blockers: z.number().int().nonnegative(),
  error: z.string().max(2000).nullish(),
  agent_slug: z.string().regex(CI_SLUG_RE),
  repository: z.string().regex(CI_REPO_FULL_NAME_RE),
  job_url: z
    .string()
    .url()
    .refine((u) => u.startsWith('https://github.com/'), 'job_url must be a github.com URL'),
  github_run_id: z.number().int().positive(),
  github_run_attempt: z.number().int().positive(),
  model: z.string().min(1),
  manifest_version: z.number().int().nullable(),
  commit_sha: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .nullable(),
  dependencies: RunDependencies,
  finished_at: z.string().datetime(),
  tokens_in: z.number().int().nullish(),
  tokens_out: z.number().int().nullish(),
});
export type CiRunResult = z.infer<typeof CiRunResult>;
