import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

/**
 * Onboarding Tour (SPEC-02 / L05) — reads from a repo's clone, for the
 * in-app source-file viewer. Infrastructure-in-module (fs only, same shape
 * as `context/scanner.ts`); duplicated on purpose because importing
 * `../context/scanner.js` breaks `no-cross-module-reach` — see the plan's
 * risk note.
 *
 * Everything here is READ-ONLY against the clone, which `GitClient.sync` may
 * `git reset --hard` at any time, and which this feature never writes to.
 */

/** Whether the clone directory is actually on disk. */
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

/** `{size,updatedAt}` for a file WITHOUT reading its content, or `null` unless it's a real file. */
export async function statSourceFile(
  clonePath: string,
  relPath: string,
): Promise<{ size: number; updatedAt: string } | null> {
  const full = safeJoin(clonePath, relPath);
  if (!full) return null;
  const info = await stat(full).catch(() => null);
  if (!info || !info.isFile()) return null;
  return { size: info.size, updatedAt: info.mtime.toISOString() };
}

/** Read a source file's content, or `null` when unreadable or binary (contains `\u0000`). */
export async function readSourceFile(clonePath: string, relPath: string): Promise<string | null> {
  const full = safeJoin(clonePath, relPath);
  if (!full) return null;
  const content = await readFile(full, 'utf8').catch(() => null);
  if (content === null || content.includes('\u0000')) return null;
  return content;
}
