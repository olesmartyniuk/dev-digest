import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import {
  CONTEXT_DOC_EXTENSION,
  CONTEXT_SKIP_DIRECTORIES,
  CONTEXT_WALK_MAX_DEPTH,
  CONTEXT_WALK_MAX_FILES,
} from './constants.js';
import { matchContextRoot } from './helpers.js';
import type { ScannedDoc } from './types.js';

/**
 * Project Context (L05) — reads from a repo's clone. Infrastructure-in-module
 * (fs only, same shape as `conventions/sampler.ts`); this module may not
 * import that one (`no-cross-module-reach`), so `cloneDirExists`/`safeJoin`
 * are intentionally duplicated here — see the plan's risk note.
 *
 * Everything here is READ-ONLY against the clone, which `GitClient.sync` may
 * `git reset --hard` at any time, and which the feature never writes to (D3).
 */

/** Whether the clone directory is actually on disk (see `conventions/sampler.ts`'s note on drift). */
export async function cloneDirExists(clonePath: string): Promise<boolean> {
  const info = await stat(resolve(clonePath)).catch(() => null);
  return info?.isDirectory() ?? false;
}

/** Resolve a repo-relative path inside the clone, refusing to escape it. */
export function safeJoin(clonePath: string, relPath: string): string | null {
  const root = resolve(clonePath);
  const target = resolve(root, relPath);
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

/**
 * Walk the clone for `.md` files under any of `roots` (at any depth), bounded
 * by depth and file count, skipping dot-directories and the fixed skip list.
 * Returns the result sorted by repo-relative path (AC-2).
 */
export async function scanContextDocs(
  clonePath: string,
  roots: readonly string[],
): Promise<ScannedDoc[]> {
  const root = resolve(clonePath);
  const found: ScannedDoc[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > CONTEXT_WALK_MAX_DEPTH || found.length >= CONTEXT_WALK_MAX_FILES) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (found.length >= CONTEXT_WALK_MAX_FILES) return;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue;
        if ((CONTEXT_SKIP_DIRECTORIES as readonly string[]).includes(entry.name)) continue;
        await walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith(CONTEXT_DOC_EXTENSION)) continue;

      // Repo-relative, forward-slash path — required on Windows, where
      // `relative()` returns backslash-separated segments.
      const rel = relative(root, full).split(sep).join('/');
      const matchedRoot = matchContextRoot(rel, roots);
      if (matchedRoot === null) continue;

      const info = await stat(full).catch(() => null);
      if (!info) continue;
      const content = await readFile(full, 'utf8').catch(() => null);
      if (content === null || content.includes('\u0000')) continue;

      found.push({
        path: rel,
        name: basename(rel),
        root: matchedRoot,
        size: info.size,
        content,
        updatedAt: info.mtime.toISOString(),
      });
    }
  }

  await walk(root, 0);
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Read one document by repo-relative path. Returns `null` when the path
 * escapes the clone, is missing, or can't be read (never throws) — callers
 * (`ContextService`) turn that into a skipped/missing document, not a 500.
 */
export async function readContextDoc(clonePath: string, relPath: string): Promise<string | null> {
  const full = safeJoin(clonePath, relPath);
  if (!full) return null;
  return readFile(full, 'utf8').catch(() => null);
}

/**
 * `{size,updatedAt}` for a document WITHOUT reading its content — lets the
 * single-document preview (`ContextService.readDocument`) reject an
 * oversized file before paying for a full read. `null` under the same
 * conditions as `readContextDoc`.
 */
export async function statContextDoc(
  clonePath: string,
  relPath: string,
): Promise<{ size: number; updatedAt: string } | null> {
  const full = safeJoin(clonePath, relPath);
  if (!full) return null;
  const info = await stat(full).catch(() => null);
  if (!info || !info.isFile()) return null;
  return { size: info.size, updatedAt: info.mtime.toISOString() };
}
