# `@devdigest/mcp` — DevDigest MCP server

A local **stdio** MCP server that lets MCP clients (Claude Code, Claude Desktop) list DevDigest's review agents, run one on a PR, read its findings, read a repo's conventions, and read a PR's blast radius — all over the DevDigest API running on `:3001`. It never imports `server/` source; it is a plain HTTP client.

## Prerequisites

- The DevDigest API must be running: `./scripts/dev.sh` from the repo root (seeds demo data and starts Postgres + API `:3001` + web `:3000`).
- `pnpm install` inside this folder.

## Quick start

```sh
pnpm install
pnpm --silent start   # stdio server; --silent avoids a pnpm banner on stdout
```

## Client setup

### Claude Code

```sh
claude mcp add devdigest -e DEVDIGEST_API_BASE=http://localhost:3001 -- <abs>/devdigest-mcp/node_modules/.bin/tsx <abs>/devdigest-mcp/src/index.ts
```

On Windows, use `...\node_modules\.bin\tsx.cmd` instead of the Unix path.

Reviews can run for several minutes; raise `MCP_TOOL_TIMEOUT` if Claude Code gives up on `run_agent_on_pr` before it returns (see `specs/tool-contract.md` and the plan's Risks note).

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "devdigest": {
      "command": "<abs>/devdigest-mcp/node_modules/.bin/tsx",
      "args": ["<abs>/devdigest-mcp/src/index.ts"],
      "env": { "DEVDIGEST_API_BASE": "http://localhost:3001" }
    }
  }
}
```

### MCP Inspector

```sh
pnpm inspect
```

Opens the Inspector UI against this server over stdio — good for exercising each tool by hand before wiring a real client.

## Tools

5 tools: `list_agents`, `run_agent_on_pr`, `get_findings`, `get_conventions`, `get_blast_radius`. Full parameter tables, example outputs and error cases → [docs/tools.md](docs/tools.md).

## Where to read next

| Topic | Document |
|-------|----------|
| File map, conventions, gotchas, do-not-touch zones | [CLAUDE.md](CLAUDE.md) |
| Non-obvious findings recorded while working here | [INSIGHTS.md](INSIGHTS.md) |
| Every tool's parameters, example output, error cases | [docs/tools.md](docs/tools.md) |
| The invariants (M1–M11) every tool must hold | [specs/tool-contract.md](specs/tool-contract.md) |
| Test strategy across all packages | [../TESTING.md](../TESTING.md) |
