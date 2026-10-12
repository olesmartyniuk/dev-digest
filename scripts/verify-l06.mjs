#!/usr/bin/env node
/**
 * verify:l06 — the L06 (eval pipeline, SPEC-04) acceptance gate.
 *
 *   pnpm verify:l06          (from the repo root)
 *
 * Exits 0 only if every check passes; stops at the FIRST failure (AC-40). Runs
 * fully offline: it sets no API keys, never touches the top-level `evals/`
 * harness suite (that needs a Claude subscription / proxy) and calls no model.
 *
 * The repo is not a monorepo (no workspace, no shared lockfile), so this is a
 * plain Node script that shells out per package. Node >= 22, ESM, builtins only.
 *
 * Checks, in order:
 *   1. typecheck: server, client, reviewer-core
 *   2. reviewer-core tests (scoring unit tests + zero-LLM proof)
 *   3. server unit lane (no DB)
 *   4. server integration lane (needs Docker)
 *   5. client tests + lint
 *   6. vendored-contract parity (server vs client copies)
 *   7. migration hygiene (in sync, append-only)
 *   8. structural assertions (spec file, nav entry)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const IS_WIN = process.platform === 'win32';
const TOTAL = 8;
// On Windows `pnpm` is a .cmd shim, which only resolves through a shell.
const SHELL = IS_WIN;

const p = (...parts) => join(ROOT, ...parts);

let current = 0;
let currentLabel = '';

function begin(label) {
  current += 1;
  currentLabel = label;
  console.log(`\n▶ [${current}/${TOTAL}] ${label}`);
}

function fail(message) {
  console.error(`\n✗ [${current}/${TOTAL}] ${currentLabel} failed`);
  if (message) console.error(message);
  process.exit(1);
}

/** Run a command with inherited stdio; the first non-zero exit stops the whole gate. */
function run(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: SHELL });
  if (res.error) fail(`could not run ${cmd}: ${res.error.message}`);
  if (res.status !== 0) fail(`${cmd} ${args.join(' ')} exited with ${res.status} (in ${cwd})`);
}

/** Run a command and capture stdout (for git); returns { status, stdout }. */
function capture(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: false });
  return { status: res.status ?? 1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

const normalize = (s) => s.replace(/\r\n/g, '\n');
const read = (file) => normalize(readFileSync(file, 'utf8'));

/** First differing line (1-based) between two normalized texts, or 0 when equal. */
function firstDiffLine(a, b) {
  const x = a.split('\n');
  const y = b.split('\n');
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return i + 1;
  return 0;
}

// ---- 1. typecheck --------------------------------------------------------------
begin('typecheck: server, client, reviewer-core');
run('pnpm', ['typecheck'], p('server'));
run('pnpm', ['typecheck'], p('client'));
// reviewer-core: call tsc directly — pnpm's pre-script install fails on Windows
// (reviewer-core INSIGHTS 2026-09-18).
run('node', ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.json'], p('reviewer-core'));

// ---- 2. reviewer-core tests ----------------------------------------------------
begin('reviewer-core tests (scoring + zero-LLM proof)');
run('node', ['node_modules/vitest/vitest.mjs', 'run'], p('reviewer-core'));

// ---- 3. server unit lane -------------------------------------------------------
begin('server unit lane (no DB)');
run(
  'pnpm',
  ['exec', 'vitest', 'run', '--exclude', IS_WIN ? '"**/*.it.test.ts"' : '**/*.it.test.ts'],
  p('server'),
);

// ---- 4. server integration lane ------------------------------------------------
begin('server integration lane (Docker)');
{
  // *.it.test.ts self-skip when Docker is unreachable, which would make this gate vacuous.
  const docker = spawnSync('docker', ['info'], { stdio: 'ignore', shell: SHELL });
  if (docker.error || docker.status !== 0) {
    fail(
      'Docker is required for the server integration lane (it-tests self-skip without it, which would make this gate vacuous).',
    );
  }
  run('pnpm', ['exec', 'vitest', 'run', '.it.test'], p('server'));
}

// ---- 5. client tests + lint ----------------------------------------------------
begin('client tests + lint');
run('pnpm', ['test'], p('client'));
run('pnpm', ['lint'], p('client'));

// ---- 6. vendored-contract parity ----------------------------------------------
begin('vendored @devdigest/shared parity (server vs client)');
{
  const server = p('server', 'src', 'vendor', 'shared');
  const client = p('client', 'src', 'vendor', 'shared');

  const compare = (label, a, b) => {
    if (a === b) return;
    const line = firstDiffLine(a, b);
    fail(`${label} differs between server and client vendored copies (first differing line: ${line})`);
  };

  /** Text from `start` up to (not including) `end`; fails loudly if a marker is missing. */
  const slice = (text, start, end, file) => {
    const from = text.indexOf(start);
    const to = text.indexOf(end, from + 1);
    if (from === -1 || to === -1) fail(`marker not found in ${file}: ${from === -1 ? start : end}`);
    return text.slice(from, to);
  };

  // (a) the new contract file is byte-identical (CRLF-normalized)
  compare(
    'contracts/eval-pipeline.ts',
    read(join(server, 'contracts', 'eval-pipeline.ts')),
    read(join(client, 'contracts', 'eval-pipeline.ts')),
  );

  // (b) the Eval slice of knowledge.ts
  const kS = read(join(server, 'contracts', 'knowledge.ts'));
  const kC = read(join(client, 'contracts', 'knowledge.ts'));
  compare(
    'contracts/knowledge.ts (Eval section)',
    slice(kS, '// ---- Eval ----', '// ---- Memory ----', 'server knowledge.ts'),
    slice(kC, '// ---- Eval ----', '// ---- Memory ----', 'client knowledge.ts'),
  );

  // (c) the eval slice of eval-ci.ts (the rest of the file has legitimately drifted)
  const eS = read(join(server, 'contracts', 'eval-ci.ts'));
  const eC = read(join(client, 'contracts', 'eval-ci.ts'));
  const EVAL_START = '// Eval — case input + persisted run record + dashboard';
  compare(
    'contracts/eval-ci.ts (eval section)',
    slice(eS, EVAL_START, '// Compose Review', 'server eval-ci.ts'),
    slice(eC, EVAL_START, '// Compose Review', 'client eval-ci.ts'),
  );

  // (d) both barrels export the new file
  const EXPORT = "export * from './contracts/eval-pipeline.js';";
  for (const [label, dir] of [['server', server], ['client', client]]) {
    if (!read(join(dir, 'index.ts')).includes(EXPORT)) fail(`${label} vendor/shared/index.ts is missing: ${EXPORT}`);
  }
}

// ---- 7. migration hygiene ------------------------------------------------------
begin('migration hygiene (in sync + append-only)');
{
  const migrations = p('server', 'src', 'db', 'migrations');
  const meta = join(migrations, 'meta');
  const snapshot = () => [...readdirSync(migrations), ...readdirSync(meta).map((f) => `meta/${f}`)].sort();

  // (a) schema and migrations are in sync: `db:generate` must not create anything.
  const before = new Set(snapshot());
  run('pnpm', ['db:generate'], p('server'));
  const created = snapshot().filter((f) => !before.has(f));
  if (created.length > 0) {
    // Left on disk on purpose: review them, don't delete blindly.
    fail(`schema and migrations are out of sync: drizzle-kit generated ${created.join(', ')}`);
  }

  // (b) no migration that exists at the base was modified.
  let base = capture('git', ['merge-base', 'HEAD', 'origin/main'], ROOT);
  const baseRef = base.status === 0 && base.stdout.trim() ? base.stdout.trim() : 'HEAD';
  const tree = capture(
    'git',
    ['ls-tree', '--name-only', baseRef, 'server/src/db/migrations/', 'server/src/db/migrations/meta/'],
    ROOT,
  );
  if (tree.status !== 0) fail(`git ls-tree failed: ${tree.stderr}`);
  const tracked = tree.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((f) => f.endsWith('.sql') || f.endsWith('_snapshot.json'));
  for (const file of tracked) {
    const diff = spawnSync('git', ['diff', '--quiet', baseRef, '--', file], { cwd: ROOT });
    if (diff.status !== 0) fail(`an already-applied migration file was modified (append-only): ${file}`);
  }

  // (c) the journal is append-only: every base entry is unchanged at the same index.
  const journalPath = 'server/src/db/migrations/meta/_journal.json';
  const baseJournal = capture('git', ['show', `${baseRef}:${journalPath}`], ROOT);
  if (baseJournal.status !== 0) fail(`could not read ${journalPath} at ${baseRef}: ${baseJournal.stderr}`);
  const baseEntries = JSON.parse(baseJournal.stdout).entries;
  const nowEntries = JSON.parse(readFileSync(p(journalPath), 'utf8')).entries;
  baseEntries.forEach((entry, i) => {
    if (JSON.stringify(entry) !== JSON.stringify(nowEntries[i])) {
      fail(`meta/_journal.json entry #${i} (${entry.tag}) was modified; the journal is append-only`);
    }
  });
}

// ---- 8. structural assertions --------------------------------------------------
begin('structural assertions (spec file, nav entry)');
{
  if (!existsSync(p('specs', 'eval-pipeline.md'))) fail('specs/eval-pipeline.md is missing');
  const nav = read(p('client', 'src', 'vendor', 'ui', 'nav.ts'));
  if (!/key:\s*"eval"[^}]*href:\s*"\/eval"/.test(nav)) {
    fail('client/src/vendor/ui/nav.ts has no NAV item with key "eval" and href "/eval"');
  }
}

console.log(`\n✓ verify:l06 passed (${TOTAL}/${TOTAL})`);
