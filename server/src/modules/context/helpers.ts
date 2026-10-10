import type { ContextDocument } from '@devdigest/shared';
import { CONTEXT_DOC_EXTENSION, CONTEXT_SOURCE_PREFIX } from './constants.js';
import type { ScannedDoc } from './types.js';

/**
 * Project Context (L05) — pure helpers. No fs, no db, no Container, no
 * Fastify (`no-domain-outward`) — everything here is deterministic given its
 * arguments, so it's unit-tested without a clone or a database.
 */

/**
 * The first directory segment of `path` (counting from the repo root, the
 * file name excluded) that is one of `roots`, or `null` when none matches.
 * `server/specs/api-contract.md` with roots `['specs','docs','insights']`
 * returns `'specs'` — a root counts at ANY depth, not just the top level.
 */
export function matchContextRoot(path: string, roots: readonly string[]): string | null {
  const segments = path.split('/');
  // Exclude the file name (last segment) — only directory segments count.
  for (const segment of segments.slice(0, -1)) {
    if (roots.includes(segment)) return segment;
  }
  return null;
}

/**
 * Whether `path` is a safe, attachable repo-relative Markdown path: `.md`
 * extension, at least one directory segment under a configured root, no
 * traversal (`..`), no bare `.` or empty segments, and no backslashes (a
 * Windows path accidentally leaking a native separator).
 */
export function isAttachablePath(path: string, roots: readonly string[]): boolean {
  if (!path.toLowerCase().endsWith(CONTEXT_DOC_EXTENSION)) return false;
  if (path.includes('\\')) return false;
  if (path.startsWith('/')) return false;
  const segments = path.split('/');
  if (segments.some((s) => s === '..' || s === '.' || s === '')) return false;
  return matchContextRoot(path, roots) !== null;
}

/**
 * AC-12a — an agent's effective project context: every linked, ENABLED
 * skill's documents in the order the skills themselves are linked, then the
 * agent's own documents, keeping each path only at its FIRST occurrence (a
 * path attached to both a skill and the agent is read once).
 */
export function assembleContextPaths(skillLists: string[][], agentPaths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of skillLists) {
    for (const path of list) {
      if (seen.has(path)) continue;
      seen.add(path);
      out.push(path);
    }
  }
  for (const path of agentPaths) {
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out;
}

/**
 * AC-16 — the citation a reviewer sees for one attached document: a
 * `Source: <path>` line, a blank line, then the raw content. reviewer-core's
 * `PROJECT_CONTEXT_RULE` tells the model to name this path in a finding's
 * rationale when the finding rests on this document.
 */
export function formatContextEntry(path: string, content: string): string {
  return `${CONTEXT_SOURCE_PREFIX}${path}\n\n${content}`;
}

/** Map a scanned document + its token count + usage counts to the wire DTO. */
export function toContextDocumentDto(
  doc: ScannedDoc,
  tokens: number,
  usedBy: { agents: number; skills: number },
): ContextDocument {
  return {
    path: doc.path,
    name: doc.name,
    root: doc.root,
    size: doc.size,
    chars: doc.content.length,
    tokens,
    entry_chars: formatContextEntry(doc.path, doc.content).length,
    updated_at: doc.updatedAt,
    used_by: usedBy,
  };
}
