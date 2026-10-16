# CLAUDE.md — `@devdigest/agent-runner`

The CI runner that exported repositories execute. It validates `.devdigest/agents/<slug>.yaml` against the shared `AgentManifest`, reviews the PR diff with `@devdigest/reviewer-core` through OpenRouter, posts the result, and writes `devdigest-result.json` (the shared `CiRunResult`) for the studio to ingest.

Spec → [../specs/SPEC-05-export-to-ci.md](../specs/SPEC-05-export-to-ci.md) · plan → [../docs/plans/2026-10-15-export-to-ci.md](../docs/plans/2026-10-15-export-to-ci.md)

## Commands

```sh
pnpm install     # also needs server/ and reviewer-core/ deps installed (zod, openai resolve from there)
pnpm typecheck
pnpm test        # hermetic — LLM and GitHub are stubbed
pnpm build       # regenerates dist/agent-runner.cjs
```

## Where things live

| Path | What |
|------|------|
| `src/run.ts` | `runAgent(deps)` — the whole flow; all I/O comes in through `RunnerDeps` |
| `src/main.ts` · `src/github.ts` | the I/O edge: argv, fs, `fetch` against the GitHub API |
| `src/manifest.ts` | `loadManifest` — same `AgentManifest` schema the studio writes with |
| `dist/agent-runner.cjs` | **committed** bundle; the studio copies it verbatim into exported repos |

## Conventions

- **Rebuild and commit `dist/` whenever the runner, reviewer-core, the shared contracts or `diff-parser.ts` change** — `.github/workflows/agent-runner.yml` fails on a stale bundle.
- The bundle is CommonJS on purpose: the bundled `openai` SDK dynamic-requires node builtins, which esbuild's ESM output rejects at runtime.
- Exit codes: `0` ok / skipped fork, `1` failed or the `ci_fail_on` gate tripped, `2` invalid manifest (no LLM call, no result file).
- Never log or write secrets; the OpenRouter key only ever comes from `OPENROUTER_API_KEY`.
