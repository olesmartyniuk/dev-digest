import { CI_REPO_FULL_NAME_RE } from '@devdigest/shared';
import type { CiRunResult, CiVerdict, RepoRef } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { ARTIFACT_PREFIX } from './constants.js';

/** Lowercase, non-alphanumerics → `-`, collapse/trim dashes; falls back to `agent`. */
export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'agent';
}

/** On collision append a deterministic suffix derived from the id (decision 11). */
export function uniqueSlug(base: string, id: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  return `${base}-${id.replace(/-/g, '').slice(0, 6)}`;
}

/** Validate owner/name from the repos row before it reaches GitHub or a generated file. */
export function assertRepoRef(owner: string, name: string): RepoRef {
  if (!CI_REPO_FULL_NAME_RE.test(`${owner}/${name}`)) {
    throw new ValidationError('Repository name is not valid for CI export');
  }
  return { owner, name };
}

/**
 * Run rows store the engine's status (R2: done | failed). The CI verdict is
 * derived: failed → failed; done with no findings → no_findings; else succeeded.
 */
export function ciVerdict(status: string | null, findings: number | null): CiVerdict {
  if (status === 'failed') return 'failed';
  return (findings ?? 0) === 0 ? 'no_findings' : 'succeeded';
}

/** An installation is out of date when its workflow predates the agent's current version. */
export function isOutOfDate(workflowVersion: number | null, agentVersion: number): boolean {
  return workflowVersion == null || workflowVersion < agentVersion;
}

export function artifactPrefixFor(slug: string): string {
  return `${ARTIFACT_PREFIX}${slug}-`;
}

/** Idempotency key of an ingested run. */
export function runKey(r: Pick<CiRunResult, 'github_run_id' | 'github_run_attempt'>): string {
  return `${r.github_run_id}-${r.github_run_attempt}`;
}

/** `<run_id>-<attempt>` parsed from an artifact name for a given prefix; null if malformed. */
export function runKeyFromArtifactName(name: string, prefix: string): string | null {
  if (!name.startsWith(prefix)) return null;
  const m = name.slice(prefix.length).match(/^(\d+)-(\d+)$/);
  return m ? `${m[1]}-${m[2]}` : null;
}
