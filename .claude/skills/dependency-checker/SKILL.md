---
name: dependency-checker
description: "Analyzes every package's dependencies in this repo (server, client, reviewer-core, e2e, devdigest-mcp, evals — each has its own manifest and lockfile), builds the dependency graph (package-level + per-package Mermaid), measures package sizes (own / with transitive deps / exclusive), and ranks dependencies by install/load priority, producing a structured report a developer can act on. Use whenever the user asks about dependencies, dependency graph/tree/schema, package or node_modules size, bundle/install weight, heavy or unused or duplicate packages, version drift between packages, deprecated packages, what can be removed or replaced, 'dependency checker', or mentions залежності / залежностей / розмір пакетів / схема залежностей / пріоритети завантаження — even if they don't say 'dependency checker'."
---

# Dependency Checker

Turns the six independent dependency trees of this repo into one decision-ready report. The repo is **not a monorepo** — each package has its own `package.json` and lockfile (pnpm v9 for `server`, `client`, `devdigest-mcp`, `evals`; npm v3 for `reviewer-core`, `e2e`), so no single tool (`pnpm list`, `npm ls`) sees the whole picture. The bundled script reads the lockfiles directly and normalizes both formats.

## Workflow

1. **Run the analyzer** from anywhere inside the repo (it locates the root itself):

   ```sh
   node .claude/skills/dependency-checker/scripts/analyze.mjs [options]
   ```

   | Option | Effect |
   |---|---|
   | `--package <dir>` | Only one package (`server`, `client`, …) |
   | `--top <n>` | Rows per package table (default 15) |
   | `--online` | Fill sizes missing on disk (e.g. `e2e` not installed) from the npm registry's `unpackedSize` |
   | `--json <file>` | Also write the full data as JSON (for diffing or further processing) |
   | `--no-graph` | Skip Mermaid blocks |

   Zero dependencies, read-only, ~1 s. It never installs or modifies anything. Don't pass `--online` by default: it makes network calls and is only needed when `node_modules` is absent.

2. **Present the report** (it is Markdown with Mermaid). Don't paste 300 lines at the user: lead with a short synthesis in the user's language (the user writes Ukrainian — answer in Ukrainian), then the sections they need. The report has five sections:
   1. **Overview** — per package: manager, direct prod/dev count, installed package count, installed size.
   2. **Findings** — ranked by how actionable they are (dev tool in `dependencies`, lockfile out of sync, heavy runtime deps, deprecated, install scripts, version drift, duplicates, mixed package managers).
   3. **Cross-package graph** — internal source imports (tsconfig `paths`, e.g. `@devdigest/shared → server`) and external deps shared by several packages.
   4. **Per-package detail** — table + Mermaid graph of the heaviest direct deps and their heaviest children.
   5. **Install / load priority** — runtime → build/test → optional, heaviest first.

3. **Interpret, don't just relay.** The script reports facts; the value is the judgement. For each high-attention item say what to do and what it would buy (e.g. "moving `dependency-cruiser` to devDependencies removes 4.4 MB from the production install"). Check suspicious findings before recommending action — grep the source for actual imports to confirm a "heavy runtime dep" is really used at runtime, since a dep in `dependencies` may only be used by a script. Offer concrete next steps, but don't edit `package.json` or lockfiles unless asked.

## How to read the numbers

- **Own** — files of the package itself. **With deps** — its whole transitive closure. **Exclusive** — bytes that vanish if *only* this dep is removed (the part not shared with any other direct dep). Exclusive is the honest "what do I save" number; With deps overstates it when deps are shared (e.g. `next` and `next-intl`).
- **Tier / load priority** — `runtime` (`dependencies`: installed and loaded in production), `build/test` (`devDependencies`), `optional`. Priority = tier first, then weight. Runtime weight drives production install time, container size and cold start; build/test weight only affects dev/CI installs.
- **Attention** — `high`: runtime and (≥ 10 MB, or native/install script, deprecated, dev tool in prod, missing from lockfile); `medium`: runtime ≥ 1 MB, dev ≥ 20 MB, or any flag; else `low`.
- Sizes are **unpacked bytes on this machine's disk**, not gzip and not what a bundler ships. They include the host-platform native binaries (e.g. `@next/swc-win32-x64-msvc` is ~140 MB here and a different one on Linux). For client bundle weight, point the user to `next build` output instead — say so explicitly rather than implying these are bundle sizes.
- "N sizes unknown" = non-optional nodes with no directory on disk (package not installed). Platform-specific optional binaries for other OSes are ignored on purpose.
- pnpm peer dependencies are not counted as owned by the package that declares them.

## Limits worth stating when relevant

- Without `node_modules` (currently `e2e`), sizes are `?` unless `--online`.
- "Used vs unused" is not detected — the script reads manifests and lockfiles, not imports. Suggest `depcheck`/`knip` or a grep if the user asks about unused deps.
- Only dependencies / devDependencies / optionalDependencies of the root importer are analyzed; peer-only requirements and `pnpm.overrides` are not modelled.
- `server/src/vendor/shared` and `client/src/vendor/shared` are vendored source, not dependencies; they appear only as internal edges.

## Saving the report

Print to chat by default. If the user wants it kept, write it outside tracked source unless told otherwise (e.g. the session scratchpad), or `--json` for machine-readable output; don't add generated reports to the repo uninvited.
