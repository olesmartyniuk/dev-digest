/**
 * Project Context (L05) — internal shapes. Domain layer — pure types only, no
 * Fastify / Drizzle / adapter imports (`no-domain-outward`).
 */

/** One `.md` document found by the repo scan, with its content already read. */
export interface ScannedDoc {
  /** Repo-relative POSIX path, e.g. "docs/architecture.md". */
  path: string;
  /** File name only (last path segment). */
  name: string;
  /** First matching root directory segment counting from the repo root, e.g. "docs". */
  root: string;
  /** Byte size on disk. */
  size: number;
  /** Raw utf8 content. */
  content: string;
  /** mtime, ISO string, or null when unavailable. */
  updatedAt: string | null;
}

/** The result of resolving an agent's effective project context at run time. */
export interface ResolvedRunContext {
  /** Rendered `formatContextEntry` strings, capped — reviewer-core's `specs` input. */
  specs: string[];
  /** The paths that survived the cap, in the SAME order as `specs` — persisted as `specs_read`. */
  paths: string[];
  /** True when `capProjectContext` cut or dropped anything. */
  truncated: boolean;
  /** Attached paths that could not be read (missing, out-of-root, or unreadable), with why. */
  skipped: { path: string; reason: string }[];
}
