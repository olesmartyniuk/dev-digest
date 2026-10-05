import { z } from 'zod';

/**
 * Project Context (SPEC-01 / L05) — `.md` documents discovered under a repo's
 * configured roots (default `specs/`, `docs/`, `insights/`), attached (paths
 * only) to Agents and Skills, and fed into reviewer-core's `specs` slot at
 * run time. See `specs/SPEC-01-project-context.md`.
 *
 * `SpecFile` (contracts/platform.ts) is reused UNCHANGED as the single-document
 * response (`GET /repos/:id/context/file`) — not redefined here.
 */

/** A repo-relative POSIX path to a `.md` document — never absolute, never escaping the repo. */
export const ContextPath = z
  .string()
  .min(1)
  .max(512)
  .regex(/\.md$/i, 'must end in .md')
  .refine(
    (p) =>
      !p.startsWith('/') &&
      !p.includes('\\') &&
      !p.split('/').some((s) => s === '..' || s === '.' || s === ''),
    { message: 'must be a repo-relative POSIX path' },
  );
export type ContextPath = z.infer<typeof ContextPath>;

/** One discovered document in a repo's listing (`GET /repos/:id/context`). */
export const ContextDocument = z.object({
  path: z.string(),
  name: z.string(),
  root: z.string(),
  size: z.number().int(),
  /** Raw content length (chars), before the `Source: <path>` citation prefix. */
  chars: z.number().int(),
  /** Estimated token count of `content` (the tokenizer adapter). */
  tokens: z.number().int(),
  /** Rendered `formatContextEntry(path, content)` length — what actually counts against the cap. */
  entry_chars: z.number().int(),
  updated_at: z.string().nullable(),
  /** How many agents/skills currently have this path attached. */
  used_by: z.object({
    agents: z.number().int(),
    skills: z.number().int(),
  }),
});
export type ContextDocument = z.infer<typeof ContextDocument>;

/** Whether the repo's clone is usable for a Project Context scan. */
export const ContextCloneStatus = z.enum(['ready', 'not_cloned', 'missing']);
export type ContextCloneStatus = z.infer<typeof ContextCloneStatus>;

/** `GET /repos/:id/context` and `POST /repos/:id/context/rescan` response. */
export const ContextListing = z.object({
  repo_id: z.string(),
  clone_status: ContextCloneStatus,
  /** The configured root directory names this listing scanned (`DEVDIGEST_CONTEXT_ROOTS`). */
  roots: z.array(z.string()),
  documents: z.array(ContextDocument),
  scanned_at: z.string().nullable(),
  /** `MAX_PROJECT_CONTEXT_CHARS` (reviewer-core) — the client sums `entry_chars` against this. */
  cap_chars: z.number().int(),
});
export type ContextListing = z.infer<typeof ContextListing>;

/** Body for `PUT /agents/:id/context` and `PUT /skills/:id/context` — replace the whole ordered list. */
export const SetContextAttachmentsBody = z.object({
  paths: z
    .array(ContextPath)
    .max(50)
    .refine((ps) => new Set(ps).size === ps.length, { message: 'duplicate paths are not allowed' }),
});
export type SetContextAttachmentsBody = z.infer<typeof SetContextAttachmentsBody>;

/** `GET /skills/:id/context` response — a skill's own attached paths, in prompt order. */
export const SkillContext = z.object({
  skill_id: z.string(),
  paths: z.array(z.string()),
});
export type SkillContext = z.infer<typeof SkillContext>;

/** One linked skill's contribution to an agent's inherited context (`GET /agents/:id/context`). */
export const InheritedContext = z.object({
  skill_id: z.string(),
  skill_name: z.string(),
  enabled: z.boolean(),
  paths: z.array(z.string()),
});
export type InheritedContext = z.infer<typeof InheritedContext>;

/** `GET /agents/:id/context` response. */
export const AgentContext = z.object({
  agent_id: z.string(),
  /** This agent's own attached paths (prompt order). */
  paths: z.array(z.string()),
  /** Every linked skill's contribution, including disabled ones (`enabled: false`). */
  inherited: z.array(InheritedContext),
  /** The de-duplicated, run-time order: enabled skills' paths (in link order) then this agent's own. */
  effective: z.array(z.string()),
});
export type AgentContext = z.infer<typeof AgentContext>;

/** `GET /skills/:id/context/preview` response — the serialized `## Project context` block a skill would contribute. */
export const ContextPreview = z.object({
  clone_status: ContextCloneStatus,
  /** The rendered `## Project context` block, or null when there is nothing to show. */
  text: z.string().nullable(),
  /** Paths that survived the cap and are reflected in `text`. */
  paths: z.array(z.string()),
  /** Attached paths that could not be read from the clone. */
  missing: z.array(z.string()),
  truncated: z.boolean(),
});
export type ContextPreview = z.infer<typeof ContextPreview>;
