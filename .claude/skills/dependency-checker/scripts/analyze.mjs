#!/usr/bin/env node
// Dependency analyzer for the DevDigest repo (not a monorepo: every package owns its manifest + lockfile).
// Zero dependencies. Reads package.json + pnpm-lock.yaml (v9) / package-lock.json (v3), measures sizes from
// node_modules (or the npm registry with --online) and prints a Markdown report (or JSON with --json).
//
// Usage: node analyze.mjs [--root <repo>] [--package <dir>] [--top 15] [--online] [--json <file>] [--no-graph]
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  if (i < 0) return d;
  return args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
};
// Default root: nearest ancestor of cwd that has 2+ child directories with a package.json (this repo's layout).
function findRoot(start) {
  for (let d = start; ; d = path.dirname(d)) {
    let n = 0;
    try { n = fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== 'node_modules' && fs.existsSync(path.join(d, e.name, 'package.json'))).length; } catch { /* unreadable */ }
    if (n >= 2) return d;
    if (path.dirname(d) === d) return start;
  }
}
const ROOT = path.resolve(opt('root', findRoot(process.cwd())));
const ONLY = opt('package', null);
const TOP = Number(opt('top', 15));
const ONLINE = !!opt('online', false);
const JSON_OUT = opt('json', null);
const GRAPH = !opt('no-graph', false);
const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', 'docs', 'specs', 'scripts', 'dist', '.next']);
const MB = 1048576;

// ---------- helpers ----------
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const fmt = (b) => (b == null ? '?' : b < 1024 ? `${b} B` : b < MB ? `${(b / 1024).toFixed(0)} KB` : `${(b / MB).toFixed(1)} MB`);
const unq = (s) => s.trim().replace(/^['"]|['"]$/g, '');
const keyOf = (t) => unq(t.replace(/:\s*\{\}$/, '').replace(/:$/, ''));
const baseVer = (v) => String(v).split('(')[0];
const splitKey = (key) => {
  // "name@1.2.3(peer@1)" -> [name, "1.2.3"]
  const b = baseVer(key);
  const i = b.lastIndexOf('@');
  return [b.slice(0, i), b.slice(i + 1)];
};
// Dev-only tooling that should not sit under `dependencies`.
const DEV_TOOLS = /^(typescript|vitest|jest|eslint|prettier|dependency-cruiser|drizzle-kit|@types\/.+|@testcontainers\/.+|testcontainers|@vitest\/.+|@testing-library\/.+|jsdom|happy-dom)$/;

const dirSizeCache = new Map();
function dirSize(dir, skipNested) {
  if (dirSizeCache.has(dir)) return dirSizeCache.get(dir);
  let total = null;
  if (fs.existsSync(dir)) {
    total = 0;
    const walk = (d) => {
      let ents;
      try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        const p = path.join(d, e.name);
        if (e.isSymbolicLink()) continue;
        if (e.isDirectory()) {
          if (skipNested && e.name === 'node_modules') continue;
          walk(p);
        } else if (e.isFile()) {
          try { total += fs.statSync(p).size; } catch { /* vanished */ }
        }
      }
    };
    walk(dir);
  }
  dirSizeCache.set(dir, total);
  return total;
}

// ---------- lockfile parsers -> { direct, nodes: Map<"name@ver", node>, manager } ----------
function parsePnpm(file, pkgDir) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const direct = {};
  const meta = new Map();
  const nodes = new Map();
  let section = '', imp = '', sub = '', cur = null, curId = '', dName = '';
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith('#')) continue;
    const ind = raw.length - raw.trimStart().length;
    if (ind === 0) { section = t.replace(':', ''); continue; }
    if (section === 'importers') {
      if (ind === 2) { imp = unq(t.replace(/:$/, '')); continue; }
      if (imp !== '.') continue;
      if (ind === 4) { sub = t.replace(':', ''); continue; }
      if (ind === 6) { dName = unq(t.replace(/:$/, '')); direct[dName] = { kind: sub }; continue; }
      if (ind === 8) {
        const [k, ...v] = t.split(':');
        direct[dName][k === 'specifier' ? 'spec' : 'ver'] = unq(v.join(':'));
      }
    } else if (section === 'packages') {
      if (ind === 2) { cur = keyOf(t); meta.set(cur, { peers: new Set() }); continue; }
      if (ind === 4 && cur) { const [k, ...v] = t.split(':'); sub = k; meta.get(cur)[k] = unq(v.join(':')); }
      if (ind === 6 && cur && sub === 'peerDependencies') meta.get(cur).peers.add(unq(t.split(':')[0]));
    } else if (section === 'snapshots') {
      if (ind === 2) {
        const [name, version] = splitKey(keyOf(t));
        curId = `${name}@${version}`;
        if (!nodes.has(curId)) nodes.set(curId, { name, version, deps: new Set(), optional: false });
        continue;
      }
      const n = nodes.get(curId);
      if (!n) continue;
      if (ind === 4) {
        if (t.startsWith('optional:')) n.optional = t.includes('true');
        else sub = t.replace(':', '');
        continue;
      }
      if (ind === 6 && (sub === 'dependencies' || sub === 'optionalDependencies')) {
        const [k, ...v] = t.split(':');
        const dn = unq(k);
        const dv = baseVer(unq(v.join(':')));
        if (dv.startsWith('link:') || dv.startsWith('file:')) continue;
        n.deps.add(/^\d/.test(dv) ? `${dn}@${dv}` : dv); // aliases already look like "name@ver"
      }
    }
  }
  for (const [key, m] of meta) {
    const [name, version] = splitKey(key);
    const n = nodes.get(`${name}@${version}`);
    if (n) { n.build = m.requiresBuild === 'true'; n.deprecated = m.deprecated || null; n.peers = m.peers; }
  }
  // peer deps are supplied by the consumer, not owned by this package: drop those edges so sizes are not double-counted
  for (const n of nodes.values()) if (n.peers?.size) for (const d of [...n.deps]) if (n.peers.has(splitKey(d)[0])) n.deps.delete(d);
  // map "name@ver" -> directory inside node_modules/.pnpm
  const store = path.join(pkgDir, 'node_modules', '.pnpm');
  const idx = new Map();
  if (fs.existsSync(store)) {
    for (const d of fs.readdirSync(store)) {
      const i = d.indexOf('@', 1);
      if (i < 0) continue;
      const name = d.slice(0, i).replace('+', '/');
      const ver = d.slice(i + 1).split('_')[0];
      const k = `${name}@${ver}`;
      if (!idx.has(k)) idx.set(k, path.join(store, d, 'node_modules', name));
    }
  }
  for (const [id, n] of nodes) n.dir = idx.get(id) || null;
  for (const [name, d] of Object.entries(direct)) d.id = d.ver && !d.ver.startsWith('link:') ? `${name}@${baseVer(d.ver)}` : null;
  return { direct, nodes, manager: 'pnpm' };
}

function parseNpm(file, pkgDir) {
  const P = readJson(file).packages || {};
  const nodes = new Map();
  const pathToId = new Map();
  for (const [p, v] of Object.entries(P)) {
    if (!p) continue;
    const name = v.name || p.split('node_modules/').pop();
    const id = `${name}@${v.version}`;
    pathToId.set(p, id);
    if (!nodes.has(id)) {
      nodes.set(id, { name, version: v.version, deps: new Set(), optional: !!v.optional, build: !!v.hasInstallScript, deprecated: v.deprecated || null, dir: path.join(pkgDir, p) });
    }
  }
  const resolve = (from, dep) => {
    let base = from;
    for (;;) {
      const cand = (base ? base + '/' : '') + 'node_modules/' + dep;
      if (pathToId.has(cand)) return pathToId.get(cand);
      if (!base) return null;
      const i = base.lastIndexOf('node_modules/');
      base = i <= 0 ? '' : base.slice(0, i - 1);
    }
  };
  for (const [p, v] of Object.entries(P)) {
    if (!p) continue;
    const n = nodes.get(pathToId.get(p));
    for (const dn of Object.keys({ ...v.dependencies, ...v.optionalDependencies })) {
      const r = resolve(p, dn);
      if (r) n.deps.add(r);
    }
  }
  const root = P[''] || {};
  const direct = {};
  for (const kind of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, spec] of Object.entries(root[kind] || {})) {
      const id = resolve('', name);
      direct[name] = { kind, spec, id, ver: id ? id.split('@').pop() : null };
    }
  }
  return { direct, nodes, manager: 'npm' };
}

// ---------- discover packages ----------
const pkgDirs = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && fs.existsSync(path.join(ROOT, e.name, 'package.json')))
  .map((e) => e.name)
  .filter((n) => !ONLY || n === ONLY);
if (!pkgDirs.length) { console.error(`No packages with package.json found under ${ROOT}`); process.exit(1); }

const pkgs = [];
for (const dir of pkgDirs) {
  const abs = path.join(ROOT, dir);
  const manifest = readJson(path.join(abs, 'package.json'));
  const pnpmLock = path.join(abs, 'pnpm-lock.yaml');
  const npmLock = path.join(abs, 'package-lock.json');
  const p = { dir, abs, name: manifest.name || dir, manifest, warnings: [] };
  if (fs.existsSync(pnpmLock)) Object.assign(p, parsePnpm(pnpmLock, abs));
  else if (fs.existsSync(npmLock)) Object.assign(p, parseNpm(npmLock, abs));
  else {
    Object.assign(p, { direct: {}, nodes: new Map(), manager: 'none' });
    p.warnings.push('No lockfile - versions and graph unavailable, only declared ranges are reported');
  }
  p.installed = fs.existsSync(path.join(abs, 'node_modules'));
  if (!p.installed) p.warnings.push('node_modules missing - sizes unknown (install, or rerun with --online)');
  // internal edges: tsconfig `paths` that point outside the package (cross-package source imports)
  p.internal = new Set();
  try {
    const raw = fs.readFileSync(path.join(abs, 'tsconfig.json'), 'utf8').replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');
    for (const m of raw.matchAll(/"(@devdigest\/[\w-]+)"\s*:\s*\[\s*"([^"]+)"/g)) {
      const target = path.relative(ROOT, path.resolve(abs, m[2])).split(path.sep)[0];
      if (target && target !== dir && !target.startsWith('..')) p.internal.add(`${m[1]} -> ${target}`);
    }
  } catch { /* no tsconfig */ }
  pkgs.push(p);
}

// ---------- sizes ----------
async function registrySize(name, version) {
  try {
    const r = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2f')}/${version}`);
    return r.ok ? (await r.json()).dist?.unpackedSize ?? null : null;
  } catch { return null; }
}
for (const p of pkgs) {
  for (const n of p.nodes.values()) n.size = n.dir ? dirSize(n.dir, p.manager === 'npm') : null;
  if (ONLINE) {
    const todo = [...p.nodes.values()].filter((n) => n.size == null && !n.optional);
    for (let i = 0; i < todo.length; i += 8) {
      await Promise.all(todo.slice(i, i + 8).map(async (n) => { n.size = await registrySize(n.name, n.version); n.sizeSource = 'registry'; }));
    }
  }
}

// ---------- per-package analysis ----------
const closureOf = (nodes, id) => {
  const seen = new Set();
  const st = [id];
  while (st.length) {
    const c = st.pop();
    if (seen.has(c) || !nodes.has(c)) continue;
    seen.add(c);
    for (const d of nodes.get(c).deps) st.push(d);
  }
  return seen;
};
// Optional platform binaries for other OSes have no size on disk; they are not counted as "unknown".
const sum = (nodes, ids) => {
  let s = 0, unk = 0;
  for (const i of ids) {
    const n = nodes.get(i);
    if (n.size == null) { if (!n.optional) unk++; } else s += n.size;
  }
  return { s, unk };
};

for (const p of pkgs) {
  const entries = Object.entries(p.direct).filter(([, d]) => d.id && p.nodes.has(d.id));
  const closures = new Map(entries.map(([name, d]) => [name, closureOf(p.nodes, d.id)]));
  const allInstalled = new Set([...closures.values()].flatMap((s) => [...s]));
  p.totalPkgs = allInstalled.size;
  const tot = sum(p.nodes, allInstalled);
  p.totalSize = tot.s;
  p.unknown = tot.unk;
  p.deps = [];
  for (const [name, d] of Object.entries(p.direct)) {
    const node = d.id ? p.nodes.get(d.id) : null;
    const row = { name, spec: d.spec || p.manifest[d.kind]?.[name], version: d.ver && baseVer(d.ver), kind: d.kind, flags: [] };
    row.tier = d.kind === 'dependencies' ? 'runtime' : d.kind === 'optionalDependencies' ? 'optional' : 'build/test';
    if (node) {
      const cl = closures.get(name);
      const others = new Set();
      for (const [o, s] of closures) if (o !== name) for (const x of s) others.add(x);
      const excl = [...cl].filter((x) => !others.has(x));
      const cs = sum(p.nodes, cl);
      row.ownSize = node.size;
      row.closureSize = cs.s;
      row.unknown = cs.unk;
      row.exclusiveSize = sum(p.nodes, excl).s;
      row.transitive = cl.size - 1;
      row.children = [...node.deps].filter((c) => p.nodes.has(c)).map((c) => ({ id: c, size: sum(p.nodes, closureOf(p.nodes, c)).s }));
      if (node.build) row.flags.push('install-script/native');
      if (node.deprecated) row.flags.push('deprecated');
      if (node.sizeSource) row.flags.push('size:registry');
    } else {
      row.flags.push(d.ver?.startsWith('link:') ? 'linked' : 'not-in-lockfile');
    }
    if (d.kind === 'dependencies' && DEV_TOOLS.test(name)) row.flags.push('dev-tool-in-prod');
    const weight = row.closureSize || 0;
    const risky = row.flags.some((f) => /native|deprecated|dev-tool|not-in-lockfile/.test(f));
    row.attention = row.tier === 'runtime' && (weight >= 10 * MB || risky) ? 'high'
      : (row.tier === 'runtime' && weight >= MB) || (row.tier !== 'runtime' && weight >= 20 * MB) || risky ? 'medium'
      : 'low';
    p.deps.push(row);
  }
  if (p.manager !== 'none') {
    for (const k of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const n of Object.keys(p.manifest[k] || {})) {
        if (!p.direct[n]) p.warnings.push(`${n} is in package.json but not in the lockfile - lockfile out of sync`);
      }
    }
  }
  const byName = new Map();
  for (const id of allInstalled) {
    const n = p.nodes.get(id);
    if (!byName.has(n.name)) byName.set(n.name, []);
    byName.get(n.name).push(n.version);
  }
  p.duplicates = [...byName].filter(([n, v]) => v.length > 1 && !n.startsWith('@esbuild/') && !/-(win32|darwin|linux|freebsd|android)/.test(n)).map(([name, v]) => ({ name, versions: v.sort() }));
  p.deprecatedTransitive = [...allInstalled].map((i) => p.nodes.get(i)).filter((n) => n.deprecated).map((n) => `${n.name}@${n.version}`);
}

// ---------- cross-package ----------
const shared = new Map();
for (const p of pkgs) {
  for (const d of p.deps) {
    if (!shared.has(d.name)) shared.set(d.name, []);
    shared.get(d.name).push({ pkg: p.dir, version: d.version, spec: d.spec, kind: d.kind });
  }
}
const sharedMulti = [...shared].filter(([, v]) => v.length > 1).sort((a, b) => b[1].length - a[1].length);
const drift = sharedMulti.filter(([, v]) => new Set(v.map((x) => x.version)).size > 1);

// ---------- JSON ----------
if (JSON_OUT && JSON_OUT !== true) {
  const json = {
    root: ROOT,
    packages: pkgs.map((p) => ({
      dir: p.dir, name: p.name, manager: p.manager, installed: p.installed, totalPackages: p.totalPkgs, totalSize: p.totalSize,
      unknownSizes: p.unknown, warnings: p.warnings, internal: [...p.internal], duplicates: p.duplicates,
      deps: p.deps.map(({ children, ...r }) => r),
    })),
    drift: drift.map(([name, usages]) => ({ name, usages })),
  };
  fs.writeFileSync(JSON_OUT, JSON.stringify(json, null, 2));
}

// ---------- Markdown ----------
const out = [];
const w = (s = '') => out.push(s);
const mid = (s) => 'n' + [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const esc = (s) => String(s).replace(/"/g, "'");
const bySize = (a, b) => (b.closureSize || 0) - (a.closureSize || 0);
const TIER_ORDER = { runtime: 0, optional: 1, 'build/test': 2 };

w('# Dependency report');
w();
w(`_Root: \`${path.basename(ROOT)}\` · ${pkgs.length} package(s) · sizes from ${ONLINE ? 'node_modules + npm registry fallback' : 'node_modules on disk'} (unpacked files, not gzip, not bundle size)._`);
w();

w('## 1. Overview');
w();
w('| Package | Manager | Direct (prod / dev) | Installed pkgs | Installed size | Notes |');
w('|---|---|---|---|---|---|');
for (const p of pkgs) {
  const prod = p.deps.filter((d) => d.tier === 'runtime').length;
  const notes = [!p.installed && 'not installed', p.unknown && `${p.unknown} sizes unknown`, p.warnings.some((x) => /out of sync/.test(x)) && 'lockfile out of sync'].filter(Boolean).join(', ');
  w(`| \`${p.dir}\` (${p.name}) | ${p.manager} | ${prod} / ${p.deps.length - prod} | ${p.totalPkgs} | ${p.installed || ONLINE ? fmt(p.totalSize) : '?'} | ${notes} |`);
}
w();

const F = []; // [severity 1 = fix first, message]
for (const p of pkgs) {
  for (const d of p.deps) {
    if (d.flags.includes('dev-tool-in-prod')) F.push([1, `**${p.dir}**: \`${d.name}\` is a dev tool declared under \`dependencies\` (${fmt(d.closureSize)}) - move to \`devDependencies\` unless it is needed at runtime.`]);
    if (d.tier === 'runtime' && (d.closureSize || 0) >= 10 * MB) F.push([2, `**${p.dir}**: runtime dep \`${d.name}\` weighs ${fmt(d.closureSize)} (${d.transitive} transitive, ${fmt(d.exclusiveSize)} exclusive to it) - confirm it is justified or look for a lighter alternative.`]);
    if (d.flags.includes('install-script/native')) F.push([3, `**${p.dir}**: \`${d.name}\` runs an install/build script (native or postinstall) - affects install time, CI and supply-chain review.`]);
    if (d.flags.includes('deprecated')) F.push([2, `**${p.dir}**: \`${d.name}\` is deprecated upstream.`]);
    if (d.flags.includes('not-in-lockfile')) F.push([1, `**${p.dir}**: \`${d.name}\` not found in lockfile.`]);
  }
  for (const x of p.deprecatedTransitive) F.push([3, `**${p.dir}**: transitive \`${x}\` is deprecated.`]);
  for (const x of p.warnings.filter((m) => /out of sync|No lockfile/.test(m))) F.push([1, `**${p.dir}**: ${x}.`]);
  if (p.duplicates.length) F.push([4, `**${p.dir}**: ${p.duplicates.length} package(s) installed in several versions, e.g. ${p.duplicates.slice(0, 4).map((d) => `\`${d.name}\` (${d.versions.join(', ')})`).join('; ')}.`]);
}
for (const [name, v] of drift) {
  const groups = [...new Set(v.map((x) => x.version))].map((ver) => `${ver} in ${v.filter((y) => y.version === ver).map((y) => y.pkg).join('/')}`);
  F.push([3, `Version drift: \`${name}\` resolves to ${groups.join(' vs ')}.`]);
}
const mgrs = new Set(pkgs.map((p) => p.manager).filter((m) => m !== 'none'));
if (mgrs.size > 1) F.push([4, `Mixed package managers (${[...mgrs].join(', ')}): npm in ${pkgs.filter((p) => p.manager === 'npm').map((p) => p.dir).join(', ')}, pnpm elsewhere.`]);
F.sort((a, b) => a[0] - b[0]);
w('## 2. Findings (most actionable first)');
w();
if (!F.length) w('No issues detected.');
else F.forEach(([, m], i) => w(`${i + 1}. ${m}`));
w();

if (GRAPH) {
  w('## 3. Cross-package graph');
  w();
  w('Solid arrows: internal source imports (tsconfig `paths`). Dotted: external dependency shared by 2+ packages (label = resolved version).');
  w();
  w('```mermaid');
  w('graph LR');
  for (const p of pkgs) w(`  ${mid(p.dir)}["${p.dir}<br/>${p.installed || ONLINE ? fmt(p.totalSize) : '?'}"]`);
  for (const p of pkgs) {
    for (const e of p.internal) {
      const [alias, target] = e.split(' -> ');
      if (pkgs.some((q) => q.dir === target)) w(`  ${mid(p.dir)} -->|"${esc(alias)}"| ${mid(target)}`);
    }
  }
  for (const [name, v] of sharedMulti.slice(0, 8)) {
    w(`  ${mid('ext:' + name)}(["${esc(name)}"])`);
    for (const u of v) w(`  ${mid(u.pkg)} -.->|"${esc(u.version)}"| ${mid('ext:' + name)}`);
  }
  w('```');
  w();
  if (sharedMulti.length) {
    w(`Shared external dependencies (${sharedMulti.length}): ${sharedMulti.slice(0, 15).map(([n, v]) => `\`${n}\`×${v.length}`).join(', ')}`);
    w();
  }
  const internal = pkgs.flatMap((p) => [...p.internal].map((e) => `\`${p.dir}\`: ${e}`));
  if (internal.length) { w('Internal edges:'); internal.forEach((e) => w(`- ${e}`)); w(); }
}

w('## 4. Per-package detail');
w();
w('**Columns** - *Own*: the package itself · *With deps*: its whole transitive closure · *Exclusive*: bytes that disappear if only this dep is removed (not shared with any other direct dep) · *Tier*: runtime = loaded in production, build/test = dev only, optional · *Attention*: where to look first.');
w();
for (const p of pkgs) {
  w(`### \`${p.dir}\` - ${p.name} (${p.manager}, ${p.totalPkgs} pkgs, ${fmt(p.totalSize)})`);
  w();
  const shown = p.warnings.filter((m) => !/out of sync/.test(m));
  shown.forEach((m) => w(`> ⚠ ${m}`));
  if (shown.length) w();
  const rows = [...p.deps].sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || bySize(a, b));
  w('| # | Dependency | Version | Tier | Own | With deps | Exclusive | Transitive | Attention | Flags |');
  w('|---|---|---|---|---|---|---|---|---|---|');
  rows.slice(0, TOP).forEach((d, i) => w(`| ${i + 1} | \`${d.name}\` | ${d.version || d.spec} | ${d.tier} | ${fmt(d.ownSize)} | ${fmt(d.closureSize)} | ${fmt(d.exclusiveSize)} | ${d.transitive ?? '?'} | ${d.attention} | ${d.flags.join(', ')} |`));
  if (rows.length > TOP) w(`| | _...${rows.length - TOP} more (use \`--top ${rows.length}\`)_ | | | | | | | | |`);
  w();
  if (GRAPH && rows.some((d) => d.closureSize != null)) {
    w('```mermaid');
    w('graph LR');
    w(`  ${mid(p.dir)}(["${p.dir}"])`);
    for (const d of rows.filter((x) => x.closureSize != null).slice(0, 10)) {
      w(`  ${mid(p.dir + d.name)}["${esc(d.name)}<br/>${fmt(d.closureSize)}"]`);
      w(`  ${mid(p.dir)} ${d.tier === 'runtime' ? '-->' : '-.->'} ${mid(p.dir + d.name)}`);
      for (const c of [...d.children].sort((a, b) => (b.size || 0) - (a.size || 0)).slice(0, 3)) {
        const cn = splitKey(c.id)[0];
        w(`  ${mid(p.dir + cn)}["${esc(cn)}<br/>${fmt(c.size)}"]`);
        w(`  ${mid(p.dir + d.name)} --> ${mid(p.dir + cn)}`);
      }
    }
    w('```');
    w('Solid = runtime, dotted = build/test. Top 10 direct deps by weight, each with its 3 heaviest children.');
    w();
  }
}

w('## 5. Install / load priority');
w();
w('What matters first for install time, cold start and bundle weight: **runtime** deps (they ship and load in production), then **build/test**, then **optional**. Within a tier, heavier first.');
w();
for (const tier of ['runtime', 'build/test', 'optional']) {
  const all = pkgs.flatMap((p) => p.deps.filter((d) => d.tier === tier).map((d) => ({ ...d, pkg: p.dir }))).sort(bySize).slice(0, 10);
  if (!all.length) continue;
  w(`**${tier}** - top 10 across packages`);
  w();
  w('| Dependency | Package | With deps | Attention |');
  w('|---|---|---|---|');
  all.forEach((d) => w(`| \`${d.name}\` | ${d.pkg} | ${fmt(d.closureSize)} | ${d.attention} |`));
  w();
}
console.log(out.join('\n'));
