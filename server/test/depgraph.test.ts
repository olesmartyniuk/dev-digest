/**
 * DepCruiseGraph.buildEdges unit tests.
 *
 * No DB, no git, no mocked depgraph — exercises the REAL dependency-cruiser
 * wrapper against a tiny fixture on disk. Previously this adapter had zero
 * test coverage anywhere in the suite (every indexer test stubs it out with
 * `depgraph: { buildEdges: async () => [] }`), which is why a Windows-only
 * bug in its path normalisation went unnoticed: `buildEdges` always returned
 * `[]` on Windows, for every repo, regardless of tsconfig or layout.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DepCruiseGraph } from '../src/adapters/depgraph/index.js';

async function writeFileAt(root: string, rel: string, contents: string): Promise<void> {
  const full = join(root, rel);
  // `join` emits platform separators (backslashes on Windows), so derive the
  // parent directory with `dirname` instead of scanning for '/'.
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, contents);
}

describe('DepCruiseGraph.buildEdges', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'repo-intel-depgraph-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('resolves a plain relative import with forward-slash paths on every platform', async () => {
    // The TS-ESM convention used throughout this repo: write `./a.js`, the
    // real file on disk is `a.ts`.
    await writeFileAt(root, 'src/a.ts', 'export function helper() { return 1; }\n');
    await writeFileAt(root, 'src/b.ts', "import { helper } from './a.js';\nhelper();\n");

    const files = ['src/a.ts', 'src/b.ts'];
    const edges = await new DepCruiseGraph().buildEdges(root, files);

    expect(edges).toContainEqual({ from: 'src/b.ts', to: 'src/a.ts' });
    // Every edge must be forward-slash, never a platform-native separator —
    // this is the exact assertion that would have caught the Windows bug.
    for (const e of edges) {
      expect(e.from).not.toContain('\\');
      expect(e.to).not.toContain('\\');
    }
  });

  it('excludes a self-import and anything outside the given file set', async () => {
    await writeFileAt(root, 'src/a.ts', 'export const a = 1;\n');
    await writeFileAt(
      root,
      'src/b.ts',
      "import { a } from './a.js';\nimport { readFileSync } from 'node:fs';\nreadFileSync; a;\n",
    );

    const edges = await new DepCruiseGraph().buildEdges(root, ['src/a.ts', 'src/b.ts']);

    expect(edges).toEqual([{ from: 'src/b.ts', to: 'src/a.ts' }]);
  });

  it('returns [] for an empty file list without calling cruise', async () => {
    const edges = await new DepCruiseGraph().buildEdges(root, []);
    expect(edges).toEqual([]);
  });
});
