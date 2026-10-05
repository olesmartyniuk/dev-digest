# dev-digest — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it rather than editing it away.

Sections are fixed. Add to the one that fits; never invent a new heading.

Routing: an insight local to one package goes in that package's `INSIGHTS.md`
(`server/`, `client/`, `reviewer-core/`, `e2e/`). Anything crossing a package
boundary — and anything about `@devdigest/shared`, which exists in two copies —
belongs here.

## What Works

- **2026-09-16** — Consuming `reviewer-core` and `@devdigest/shared` as TypeScript source through tsconfig `paths` keeps one Zod definition serving as request validator, response serializer, client type, and LLM JSON Schema, with no build step between packages. Evidence: `server/tsconfig.json` `paths`, `client/tsconfig.json:22`.

- **2026-09-17** — Cost attribution for an LLM call is centralized behind `reviewer-core`'s `ReviewOutcome.costUsd` (summed per call across a map-reduce run, forced to `null` the moment any one call's model is unpriced) — every adapter (OpenAI, Anthropic, and reviewer-core's own OpenRouter provider via the injected `PriceBook`/`estimateCost`) already fills this in per call, so a new consumer of run cost only needs to read `costUsd` off the outcome and never re-derive pricing itself. Evidence: `reviewer-core/src/review/run.ts:110,184,216`, `server/src/adapters/llm/openai.ts:84`, `server/src/platform/price-book.ts:34-39`.

## What Doesn't Work

- **2026-09-16** — `@devdigest/shared` is vendored twice and the copies have already diverged, so editing `client/src/vendor/shared/` alone desyncs it from the API — change the server copy first, then mirror. Evidence: `server/src/vendor/shared/adapters.ts:83` declares `'openai' | 'anthropic' | 'openrouter'` where `client/src/vendor/shared/adapters.ts:77` still has `'openai' | 'anthropic'`.

- **2026-09-16** — `docker compose down -v` to "reset" the database deletes the named volume, not just the container, taking every imported repo and stored review with it; use `scripts/e2e.sh`, which runs its own volume-less Postgres. Evidence: `docker-compose.yml:22-24`.

- **2026-09-16** — `skills-lock.json` is not an inventory of `.claude/skills/`: it still pins `architecture-patterns` and `github-workflow-automation`, neither of which has a folder on disk, while `mermaid-diagram`, `react-best-practices`, `react-testing-library`, and `security` exist but are unpinned — read the directory, never the lock, to learn which skills are actually installed. Evidence: `skills-lock.json:4`, `skills-lock.json:22` vs `.claude/skills/README.md:9-19`.

- **2026-09-16** — The `.cursor/skills/ → ../.claude/skills` symlink that the skills README documents does not exist in the repo, so skills resolve in Claude Code only; a Cursor user who trusts that line gets no skills and no error to explain why. Evidence: `.claude/skills/README.md:3`.

- **2026-10-05** — On this Windows checkout every tracked file under `server/src/vendor/shared/` and `client/src/vendor/shared/` is CRLF, but a tool that writes a brand-new file (rather than editing an existing one) emits plain LF, so a freshly created contract file that is byte-for-byte identical in *content* to its sibling copy still fails a line-ending-sensitive `diff`/`git diff --no-index` check between the two vendored copies. The plan's own "both copies byte-identical" verification step (root `CLAUDE.md`'s "edit both vendored copies" rule) only holds if new files are normalized to CRLF (e.g. `sed -i 's/$/\r/'` on a pure-LF file) before that diff is run — editing an *existing* file with `Edit` preserves its original CRLF automatically and needs no such fix. Evidence: `server/src/vendor/shared/contracts/pr-brief.ts`, `client/src/vendor/shared/contracts/pr-brief.ts`.

## Codebase Patterns

- **2026-09-16** — `reviewer-core`'s raw source is imported by the API at runtime, so its `node_modules` must be installed separately or the API crashes on boot even though nothing references the package directly in `server/package.json`. Evidence: `scripts/dev.sh:78-80`.

- **2026-09-16** — Insight capture is instructed, never hooked, and the absent `.claude/settings.json` is the deliberate state: `Stop` fires at the end of every assistant turn rather than at session end, and `SessionEnd` can run a command but cannot feed anything back to Claude, so no honest "always at session end" trigger exists — the `Session Protocol` in `CLAUDE.md` carries it until L06 introduces the hook. Evidence: `CLAUDE.md:21-26`, `.claude/skills/engineering-insights/SKILL.md:14-21`.

- **2026-09-17** — Severity is keyed UPPERCASE everywhere it crosses a package boundary — the `Severity` Zod enum, the `AgentStats.findings_by_severity` contract, and the client's pre-declared `PrRowView.findings` — with exactly one exception: `rollupSeverities` returns `{critical, warning, suggestion}`. A new severity-tallying contract must use the uppercase keys and convert at that one helper rather than propagating its casing; and the lowercase severity strings a grep does turn up belong to `CiFailOn`, an unrelated gate-policy enum, so matching them is not evidence that lowercase is the convention. Evidence: `server/src/vendor/shared/contracts/findings.ts:11`, `server/src/vendor/shared/contracts/observability.ts:111-115`, `client/src/lib/types.ts:45`, `server/src/modules/pulls/status.ts:16-31`.

- **2026-09-22** — L02's skills feature needed no `@devdigest/shared` contract edits at all: `SkillSource` already had `'imported_url'` alongside `'manual'`/`'extracted'`/`'community'`, so the client's file/paste import (which does no server-side fetch — it's read via `FileReader` in the browser and posted as text) reuses `'imported_url'` rather than adding a new `'imported_file'` literal. This keeps the two vendored copies of `knowledge.ts` in sync with zero edits, at the cost of the source label being one step removed from literally true (no URL was ever fetched) — a future session adding a real server-side URL-fetch import must not assume every `source: 'imported_url'` row was actually fetched server-side. Evidence: `server/src/vendor/shared/contracts/knowledge.ts:118`, `server/src/modules/skills/routes.ts:22-26`.

## Tool & Library Notes

- **2026-09-16** — A DB-backed server test not named `*.it.test.ts` runs in the unit lane and fails there without Docker; the split is by filename, not by content. Evidence: `TESTING.md:79`.

- **2026-10-04** — Claude Code's own session transcripts (`~/.claude/projects/<slug>/<uuid>.jsonl` and its `<uuid>/subagents/agent-*.jsonl` siblings) log one `usage` reading per *content block* within an assistant turn, not once per turn — every block (the thinking block, then each tool_use) gets its own JSONL line, and all lines sharing the same `message.id` repeat the identical usage snapshot for that whole turn. Summing `usage` fields per-line overcounts tokens by roughly the block count per turn; correct accounting dedupes by `message.id` before summing. Evidence: `.claude/skills/workflow-retro/scripts/extract_workflow_metrics.mjs` (`seenMessageIds` guard).

- **2026-10-04** — On Windows, the same project directory is logged under two differently-cased slug folders in `~/.claude/projects/` (confirmed for this repo: both a `C--Users-...` and a `c--Users-...` slug existed side by side), because the drive-letter case in the reported cwd differs between process launches — this session's own environment block toggled between `c:\...` and `C:\...` casing across turns. Any script that locates a session's transcript must search `~/.claude/projects/*/` for the `<uuid>.jsonl` rather than construct the slug from the current cwd string, or it can silently miss the session. Evidence: `.claude/skills/workflow-retro/scripts/extract_workflow_metrics.mjs` (`findSession`).

- **2026-10-04** — On Windows, running `pnpm install`/`pnpm typecheck` in either `client/` or `server/` when a devDependency has a native postinstall script (esbuild, sharp, cpu-features, protobufjs, ssh2, unrs-resolver) fails with `ERR_PNPM_IGNORED_BUILDS`, and on that failure pnpm writes a `pnpm-workspace.yaml` stub (an `allowBuilds:` map) into the package root — even though this repo is explicitly "not a monorepo" and neither package is meant to have one. The install itself still completes (`node_modules` is populated), so the fix is to delete the stray `pnpm-workspace.yaml` afterward, not to run `pnpm approve-builds`. Evidence: `CLAUDE.md:46`.

## Recurring Errors & Fixes

## Session Notes

- **2026-09-16** — Added `CLAUDE.md` maps plus `docs/` and `specs/` to each package, and moved the deep sections out of the package READMEs into `docs/`. Entry points: [CLAUDE.md](CLAUDE.md), [docs/architecture.md](docs/architecture.md), [specs/review-flow.md](specs/review-flow.md).

- **2026-09-22** — L02 Skills feature: added the `server/src/modules/skills/` CRUD module, wired an agent's linked+enabled skills into the prompt via one `buildSkillsDigest` call in the run executor, and added the client's `/skills` Skills Lab page plus the Agent Editor's Skills tab. Most of the supporting scaffolding (DB tables, `@devdigest/shared` contracts, the `reviewer-core` `skills` prompt slot, the agent-side `/agents/:id/skills` link routes, and the client's run-trace Skills prompt block) already existed before this session — this lesson only had to feed it. Entry points: [server/src/modules/skills/routes.ts](server/src/modules/skills/routes.ts), [server/src/modules/reviews/run-executor.ts](server/src/modules/reviews/run-executor.ts), [client/src/app/skills/page.tsx](client/src/app/skills/page.tsx), [docs/agent-prompts/skills/README.md](docs/agent-prompts/skills/README.md).

- **2026-09-23** — Conventions Extractor: added the `server/src/modules/conventions/` module — sampling and evidence verification in code, one cheap-model call between them — plus `POST /repos/:id/conventions/extract`, the accept/reject/edit surface, and a skill-draft → `POST /repos/:id/conventions/skill` promotion path that reuses L02's skills and agent-link machinery through the new `container.skillsService`. The scaffolding that already existed (the `conventions` table, the `conventions` entry in `FEATURE_MODELS`, `client/messages/en/conventions.json`, the `"conventions"` branch in the app-shell's `activeKeyFor`, and `repoIntel.getConventionSamples`) was all consumed rather than replaced; the table needed a reshape (`accepted` boolean → `status`, plus category/line/origin) and the feature's richer DTOs went into a NEW `@devdigest/shared` file, leaving `knowledge.ts`'s older `ConventionCandidate` untouched. Entry points: [server/src/modules/conventions/service.ts](server/src/modules/conventions/service.ts), [server/src/modules/conventions/helpers.ts](server/src/modules/conventions/helpers.ts), [server/src/prompts/conventions.system.md](server/src/prompts/conventions.system.md), [client/src/app/repos/[repoId]/conventions/page.tsx](client/src/app/repos/%5BrepoId%5D/conventions/page.tsx), [server/specs/api-contract.md](server/specs/api-contract.md).

- **2026-10-04** — Project Context (SPEC-01 / L05): added reviewer-core's `capProjectContext`/`renderProjectContextBlock`/`PROJECT_CONTEXT_RULE` (the `specs` slot already existed, unused); the server's `server/src/modules/context/` module (scan a repo's clone for `.md` files under configurable roots, two new join tables `agent_context_docs`/`skill_context_docs`, 8 routes, and `ContextService.resolveForRun` wired into `run-executor.ts` so `specs_read` finally holds real data instead of a hardcoded `[]`); and the client's `/repos/:repoId/context` page plus the shared `ContextPicker` component reused by both the Agent Editor's new Context tab and the Skills Lab's new "Project context to use" section. `ContextService` is a required `Container` singleton (`container.contextService`) because it owns an in-memory per-repo scan cache that both the HTTP routes and the review run executor must share — a `new ContextService(...)` anywhere else would run with a cold, unshared cache. Entry points: [server/src/modules/context/service.ts](server/src/modules/context/service.ts), [server/src/modules/reviews/run-executor.ts](server/src/modules/reviews/run-executor.ts), [reviewer-core/src/prompt.ts](reviewer-core/src/prompt.ts), [client/src/components/context-picker/ContextPicker.tsx](client/src/components/context-picker/ContextPicker.tsx), [client/src/app/repos/[repoId]/context/page.tsx](client/src/app/repos/%5BrepoId%5D/context/page.tsx), [specs/SPEC-01-project-context.md](specs/SPEC-01-project-context.md).

## Open Questions

- **2026-09-16** — Whether the `client`/`server` divergence in `@devdigest/shared` is deliberate (the client may intentionally have no `openrouter`, `commitFiles`, or `sessionId` surface) or drift that should be reconciled; nothing in either tree states the intent.
