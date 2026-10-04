# devdigest-mcp — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it rather than editing it away.

Sections are fixed. Add to the one that fits; never invent a new heading.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

- **2026-09-30** — `McpServer.registerTool()` (and the deprecated `.tool()`) fail `tsc` with `TS2589: Type instantiation is excessively deep and possibly infinite` when the tool's raw input shape is built from the top-level `zod` (v3 classic) export — even a single `z.boolean()` property with no refinements triggers it, and the error disappears entirely when the same call is built from `zod/v4` instead. The installed `@modelcontextprotocol/sdk@1.31.0` is written natively against zod v4's `$ZodType`; it keeps zod v3 (`z3.ZodTypeAny`) only as a compat-union branch, and distributing that union over a raw-shape mapped type is what explodes. Every runtime zod import in this package therefore uses `zod/v4` (the classic-API subpath of the *same* installed `zod@3.25.76` package — no separate zod major version is installed), while `@devdigest/shared`'s own zod v3 schemas are still only ever consumed as `import type`, never as a runtime value (see `specs/tool-contract.md` M7). A future tool file that writes `import { z } from 'zod'` instead of `'zod/v4'` will hit the same depth error the moment it's wired into `registerTool`. Evidence: `devdigest-mcp/src/tools/list-agents.ts:1`, `devdigest-mcp/src/tools/result.ts:1`, `devdigest-mcp/src/config.ts:1`, `devdigest-mcp/package.json:19-20`.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
