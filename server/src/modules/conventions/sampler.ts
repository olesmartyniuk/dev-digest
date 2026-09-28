import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import type { SampleFile } from './types.js';
import { truncateSample } from './helpers.js';
import {
  CONFIG_FILES,
  MAX_CONFIG_CHARS,
  MAX_PROJECT_FILES,
  PROJECT_FILE_PATTERN,
  SKIP_DIRECTORIES,
  SOURCE_EXTENSIONS,
  WALK_MAX_DEPTH,
  WALK_MAX_FILES,
} from './constants.js';

/**
 * Sample selection — ENTIRELY in code, no model.
 *
 * Which files the model gets to look at decides what it can possibly find, so
 * that choice stays deterministic and auditable: the repo's configs, plus the
 * top-ranked source files from repo-intel. Asking a model to pick its own
 * reading list costs a round-trip and makes two runs over the same commit
 * disagree.
 *
 * Everything here is read-only against the clone, which `GitClient.sync` may
 * `git reset --hard` at any time.
 */

/**
 * Whether the clone directory is actually on disk.
 *
 * `clone_path` is a database column and `server/clones/**` is git-ignored, so
 * the two drift apart routinely: a checkout moved, the folder was cleaned, or
 * the repo was imported from a different working copy. Every read below
 * degrades to "nothing found" on ENOENT, which would otherwise report a
 * missing clone as "this repo has no source files" — the one diagnosis that
 * sends the user looking in the wrong place.
 */
export async function cloneDirExists(clonePath: string): Promise<boolean> {
  const info = await stat(resolve(clonePath)).catch(() => null);
  return info?.isDirectory() ?? false;
}

/** Resolve a repo-relative path inside the clone, refusing to escape it. */
function safeJoin(clonePath: string, relPath: string): string | null {
  const root = resolve(clonePath);
  const target = resolve(root, relPath);
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

async function readIfPresent(clonePath: string, relPath: string): Promise<string | null> {
  const full = safeJoin(clonePath, relPath);
  if (!full) return null;
  return readFile(full, 'utf8').catch(() => null);
}

/**
 * The repo's own written-down rules: eslint / tsconfig / prettier /
 * package.json at the root, plus any MSBuild project file.
 *
 * The fixed-name list is read from the clone root only — a nested package's
 * config describes that package, not the repo's house style. MSBuild is the
 * exception: a .NET solution's rules live in `<Name>.csproj`, whose name is
 * the project's, so those are discovered one directory down as well.
 */
export async function readConfigFiles(clonePath: string): Promise<SampleFile[]> {
  const out: SampleFile[] = [];
  for (const name of CONFIG_FILES) {
    const raw = await readIfPresent(clonePath, name);
    if (raw == null) continue;
    out.push(truncateSample(name, raw, Number.MAX_SAFE_INTEGER, MAX_CONFIG_CHARS));
  }
  for (const name of await findProjectFiles(clonePath)) {
    const raw = await readIfPresent(clonePath, name);
    if (raw == null) continue;
    out.push(truncateSample(name, raw, Number.MAX_SAFE_INTEGER, MAX_CONFIG_CHARS));
  }
  return out;
}

/** MSBuild project files at the clone root or one level below it. */
async function findProjectFiles(clonePath: string): Promise<string[]> {
  const root = resolve(clonePath);
  const found: string[] = [];

  async function scan(dir: string, prefix: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!PROJECT_FILE_PATTERN.test(entry.name)) continue;
      found.push(prefix ? `${prefix}/${entry.name}` : entry.name);
    }
  }

  await scan(root, '');
  const dirs = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of dirs) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.') || (SKIP_DIRECTORIES as readonly string[]).includes(entry.name)) {
      continue;
    }
    await scan(join(root, entry.name), entry.name);
  }
  return found.slice(0, MAX_PROJECT_FILES);
}

/** Read the chosen source files, skipping any that vanished or are binary-ish. */
export async function readSourceSamples(
  clonePath: string,
  paths: string[],
): Promise<SampleFile[]> {
  const out: SampleFile[] = [];
  for (const path of paths) {
    const raw = await readIfPresent(clonePath, path);
    if (raw == null || raw.includes('\u0000')) continue;
    out.push(truncateSample(path, raw));
  }
  return out;
}

/**
 * Fallback file picker for a repo repo-intel cannot rank — the index is off
 * (`REPO_INTEL_ENABLED=false`), not built yet, or the clone was just made.
 *
 * Without this, the feature would simply return nothing on a fresh import,
 * which reads as a broken button rather than a missing index. Ranking proxy:
 * substantial source files, largest first, tests/configs/generated excluded.
 */
export async function walkSourceFiles(clonePath: string, limit: number): Promise<string[]> {
  const root = resolve(clonePath);
  const found: { path: string; size: number }[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > WALK_MAX_DEPTH || found.length >= WALK_MAX_FILES) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (found.length >= WALK_MAX_FILES) return;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || (SKIP_DIRECTORIES as readonly string[]).includes(entry.name)) {
          continue;
        }
        await walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!(SOURCE_EXTENSIONS as readonly string[]).includes(extname(entry.name).toLowerCase())) continue;
      const rel = relative(root, full).split(sep).join('/');
      if (isJunkPath(rel)) continue;
      const info = await stat(full).catch(() => null);
      if (!info) continue;
      // Too small to hold a pattern, too large to sample usefully.
      if (info.size < 500 || info.size > 200_000) continue;
      found.push({ path: rel, size: info.size });
    }
  }

  await walk(root, 0);
  return found
    .sort((a, b) => b.size - a.size)
    .slice(0, limit)
    .map((f) => f.path);
}

/**
 * Same exclusions repo-intel's own rank-driven sampler applies, so the fallback
 * and the indexed path agree on what is NOT representative of house style.
 */
const JUNK_PATH_PATTERNS = [
  '.test.',
  '.spec.',
  '.d.ts',
  '__tests__/',
  '__mocks__/',
  '/test/',
  '/tests/',
  '/migrations/',
  '/__fixtures__/',
  '.config.',
  'vitest.',
  'jest.',
  'eslint',
  'prettier',
  '.min.',
] as const;

function isJunkPath(path: string): boolean {
  const lower = path.toLowerCase();
  return JUNK_PATH_PATTERNS.some((p) => lower.includes(p));
}
