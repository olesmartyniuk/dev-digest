# CLAUDE.md — `@devdigest/mcp`

A stdio MCP server that exposes DevDigest's agents, PR reviews, findings and conventions as 5 tools for MCP clients (Claude Code, Claude Desktop). It is a pure HTTP client of the Fastify API on `:3001` — it never imports `server/` code.

Package overview → [README.md](README.md) · tool reference → [docs/tools.md](docs/tools.md) · invariants → [specs/tool-contract.md](specs/tool-contract.md) · hard-won findings → [INSIGHTS.md](INSIGHTS.md)

## Stack

TypeScript (ESM) · `@modelcontextprotocol/sdk` (stdio transport) · Zod (schema validation + JSON Schema for tool inputs) · `tsx` (no build step) · vitest.

## Commands

```sh
pnpm install
pnpm start       # tsx src/index.ts — stdio server; stdout is protocol-only, use --silent
pnpm dev         # tsx watch
pnpm test        # hermetic — fake clock, fake DevDigestApi, no network
pnpm typecheck
pnpm build       # type-check only; this package never emits JS
pnpm inspect     # npx @modelcontextprotocol/inspector tsx src/index.ts
```

## Env

| Var | Default | Rule |
|---|---|---|
| `DEVDIGEST_API_BASE` | `http://localhost:3001` | Must be a valid `http:`/`https:` URL; trailing slash stripped |
| `DEVDIGEST_MCP_REQUEST_TIMEOUT_MS` | `15000` | int, clamped 1000–120000 |
| `DEVDIGEST_MCP_POLL_INTERVAL_MS` | `3000` | int, clamped 500–30000 |
| `DEVDIGEST_MCP_RUN_TIMEOUT_MS` | `300000` | int, clamped 30000–900000 |

No secrets here: the API needs no key, and provider keys stay server-side (`~/.devdigest/secrets.json`).

## Where things live

| Path | What |
|------|------|
| `src/config.ts` | env → `McpConfig` |
| `src/api/client.ts` | the only file that calls `fetch`; error envelope parsing |
| `src/api/endpoints.ts` | one typed function per DevDigest route |
| `src/tools/enums.ts` | local re-declarations of shared enum literals, with a compile-time drift guard |
| `src/tools/result.ts` | `ok`/`toolError`/`fromApiError`/`paginate`/`ID_HINTS` — shared across every tool |
| `src/tools/types.ts` | `ToolDeps` — the dependency bag every handler receives |
| `src/tools/list-agents.ts` | `list_agents` |
| `src/tools/get-findings.ts` | `get_findings` + the finding projection/selection helpers `run_agent_on_pr` reuses |
| `src/tools/wait-for-runs.ts` | the trigger→poll loop `run_agent_on_pr` drives |
| `src/tools/run-agent-on-pr.ts` | `run_agent_on_pr` |
| `src/tools/get-conventions.ts` | `get_conventions` |
| `src/tools/get-blast-radius.ts` | `get_blast_radius` |
| `src/server.ts` | `createServer`/`defaultDeps` — the composition root |
| `src/index.ts` | the stdio entry point |
| `test/` | hermetic unit tests, one file per tool/module above |

## Non-default conventions

- **HTTP only.** This package never imports `server/` source; every DevDigest call goes through `src/api/client.ts`.
- **`@devdigest/shared` is `import type` only, never a runtime import** — avoids a second zod instance next to the one the MCP SDK converts to JSON Schema (see Gotchas).
- **Tool errors are `isError` results, never throws** — every handler returns a `CallToolResult`; `fromApiError`/`toolError` are the only two ways to signal failure.
- **Four design principles bind every tool** (`specs/tool-contract.md` M4, M9–M11):
  1. Result, not operation — `run_agent_on_pr` triggers, waits, and collects findings in one call (M4).
  2. Flat arguments — every tool input is a scalar or an array of scalars; no nested objects (M9).
  3. Concise structured response — `concise` is the default and carries only fields a caller acts on (M10).
  4. Errors lead onward — every `isError` text and empty-result note names a concrete next tool call or action (M11).
- `response_format: "concise"` is the default for every tool.
- stdout is protocol-only. All logging goes to `console.error` (stderr).

## Gotchas

- `console.log` anywhere corrupts the stdio JSON-RPC stream — only `console.error` is safe.
- Plain `pnpm start` prints a `pnpm` banner to stdout; clients must invoke `pnpm --silent start`, or the `tsx` binary directly (see README client setup).
- PR/repo/agent ids are DevDigest uuids. A GitHub PR number is not a valid `pr_id` — there is no tool that resolves one to the other (see Risks in the plan this package was built from).
- This package's own runtime schemas import `zod/v4` (not the top-level `zod` v3 classic export) — see `INSIGHTS.md` Tool & Library Notes for why.

## Do not touch

- `get_blast_radius` is a thin pass-through of `GET /pulls/:id/blast` — no analysis here.
- `@devdigest/shared` (either vendored copy) — read-only here, through `import type` via the tsconfig `paths` alias to the server copy.
