import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  cloneDirExists,
  readContextDoc,
  scanContextDocs,
  statContextDoc,
} from '../src/modules/context/scanner.js';
import { CONTEXT_WALK_MAX_DEPTH, CONTEXT_WALK_MAX_FILES } from '../src/modules/context/constants.js';

const ROOTS = ['specs', 'docs', 'insights'];

/** Write a fixture file, creating its parent directories first. Uses
 *  `dirname()`, never `lastIndexOf('/')` — see server/INSIGHTS.md 2026-09-27. */
async function writeFixture(root: string, relPath: string, content: string): Promise<void> {
  const full = join(root, relPath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content, 'utf8');
}

describe('context scanner', () => {
  let clonePath: string;

  beforeAll(async () => {
    clonePath = await mkdtemp(join(tmpdir(), 'devdigest-context-'));
    await writeFixture(clonePath, 'docs/a.md', 'A doc.');
    await writeFixture(clonePath, 'pkg/docs/b.md', 'Nested package doc.');
    await writeFixture(clonePath, 'specs/review-flow.md', 'A spec.');
    await writeFixture(clonePath, 'src/README.md', 'Not under a root — skipped.');
    await writeFixture(clonePath, 'node_modules/docs/x.md', 'Skipped — node_modules.');
    await writeFixture(clonePath, '.hidden/specs/y.md', 'Skipped — dot-directory.');
    await writeFixture(clonePath, 'docs/binary.md', 'binary\u0000stuff');
  });

  afterAll(async () => {
    if (clonePath) await rm(clonePath, { recursive: true, force: true });
  });

  it('cloneDirExists is true for a real directory, false for a missing one', async () => {
    expect(await cloneDirExists(clonePath)).toBe(true);
    expect(await cloneDirExists(join(clonePath, 'nope'))).toBe(false);
  });

  it('finds .md files under any configured root at any depth, sorted by path', async () => {
    const docs = await scanContextDocs(clonePath, ROOTS);
    const paths = docs.map((d) => d.path);
    expect(paths).toContain('docs/a.md');
    expect(paths).toContain('pkg/docs/b.md');
    expect(paths).toContain('specs/review-flow.md');
    expect(paths).toEqual([...paths].sort((a, b) => a.localeCompare(b)));
  });

  it('skips files outside a configured root, inside node_modules, and inside a dot-directory', async () => {
    const docs = await scanContextDocs(clonePath, ROOTS);
    const paths = docs.map((d) => d.path);
    expect(paths).not.toContain('src/README.md');
    expect(paths.some((p) => p.includes('node_modules'))).toBe(false);
    expect(paths.some((p) => p.startsWith('.hidden'))).toBe(false);
  });

  it('skips a file containing a NUL byte (binary-ish)', async () => {
    const docs = await scanContextDocs(clonePath, ROOTS);
    expect(docs.some((d) => d.path === 'docs/binary.md')).toBe(false);
  });

  it('uses forward slashes in repo-relative paths (matters on Windows)', async () => {
    const docs = await scanContextDocs(clonePath, ROOTS);
    const nested = docs.find((d) => d.path.endsWith('b.md'));
    expect(nested?.path).toBe('pkg/docs/b.md');
    expect(nested?.path.includes('\\')).toBe(false);
  });

  it('sets `root` to the first matching directory segment', async () => {
    const docs = await scanContextDocs(clonePath, ROOTS);
    const nested = docs.find((d) => d.path === 'pkg/docs/b.md');
    expect(nested?.root).toBe('docs');
  });

  it('readContextDoc reads a real file and returns null for one escaping the clone', async () => {
    expect(await readContextDoc(clonePath, 'docs/a.md')).toBe('A doc.');
    expect(await readContextDoc(clonePath, '../outside.md')).toBeNull();
  });

  it('statContextDoc returns size/updatedAt without content, and null for a missing file', async () => {
    const meta = await statContextDoc(clonePath, 'docs/a.md');
    expect(meta).not.toBeNull();
    expect(meta!.size).toBeGreaterThan(0);
    expect(await statContextDoc(clonePath, 'docs/does-not-exist.md')).toBeNull();
  });

  it('statContextDoc returns null for a path that escapes the clone (same guard as readContextDoc)', async () => {
    expect(await statContextDoc(clonePath, '../outside.md')).toBeNull();
  });

  it('finds an uppercase .MD extension (case-insensitive), matching isAttachablePath', async () => {
    await writeFixture(clonePath, 'docs/UPPER.MD', 'Shouting doc.');
    const docs = await scanContextDocs(clonePath, ROOTS);
    expect(docs.some((d) => d.path === 'docs/UPPER.MD')).toBe(true);
  });
});

describe('context scanner — depth bound (CONTEXT_WALK_MAX_DEPTH)', () => {
  let clonePath: string;

  beforeAll(async () => {
    clonePath = await mkdtemp(join(tmpdir(), 'devdigest-context-depth-'));
    // `docs` itself is depth 1; each nested `lvlN` adds one more. A directory
    // chain of (CONTEXT_WALK_MAX_DEPTH - 1) `lvl` segments under `docs` lands
    // the deepest one at depth == CONTEXT_WALK_MAX_DEPTH (walked, found), and
    // one level beyond that at depth == CONTEXT_WALK_MAX_DEPTH + 1 (NOT walked).
    const levels = Array.from({ length: CONTEXT_WALK_MAX_DEPTH - 1 }, (_, i) => `lvl${i + 1}`);
    const deepDir = ['docs', ...levels].join('/');
    await writeFixture(clonePath, `${deepDir}/within-depth.md`, 'Found — at the depth limit.');
    await writeFixture(clonePath, `${deepDir}/lvl${CONTEXT_WALK_MAX_DEPTH}/beyond-depth.md`, 'Not found — one level too deep.');
  });

  afterAll(async () => {
    if (clonePath) await rm(clonePath, { recursive: true, force: true });
  });

  it('walks exactly to CONTEXT_WALK_MAX_DEPTH and no further', async () => {
    const docs = await scanContextDocs(clonePath, ROOTS);
    const paths = docs.map((d) => d.path);
    expect(paths.some((p) => p.endsWith('within-depth.md'))).toBe(true);
    expect(paths.some((p) => p.endsWith('beyond-depth.md'))).toBe(false);
  });
});

describe('context scanner — file-count bound (CONTEXT_WALK_MAX_FILES)', () => {
  let clonePath: string;

  beforeAll(async () => {
    clonePath = await mkdtemp(join(tmpdir(), 'devdigest-context-filecount-'));
    await mkdir(join(clonePath, 'docs'), { recursive: true });
    // More files than the cap, so the walk must stop at exactly the cap
    // rather than silently returning everything it finds.
    const extra = 10;
    await Promise.all(
      Array.from({ length: CONTEXT_WALK_MAX_FILES + extra }, (_, i) =>
        writeFile(join(clonePath, 'docs', `f${i}.md`), `doc ${i}`, 'utf8'),
      ),
    );
  });

  afterAll(async () => {
    if (clonePath) await rm(clonePath, { recursive: true, force: true });
  });

  it('stops at CONTEXT_WALK_MAX_FILES even when more documents exist on disk', async () => {
    const docs = await scanContextDocs(clonePath, ROOTS);
    expect(docs.length).toBe(CONTEXT_WALK_MAX_FILES);
  });
});
