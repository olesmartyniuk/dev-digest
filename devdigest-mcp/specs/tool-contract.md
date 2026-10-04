# Tool contract — invariants

These invariants bind every tool this server exposes. A change that breaks one of them is a breaking change to the contract, not an implementation detail.

- **M1** — Exactly these 5 tool names exist: `list_agents`, `run_agent_on_pr`, `get_findings`, `get_conventions`, `get_blast_radius`.
- **M2** — `concise` is the default `response_format`. It omits `system_prompt`/`output_schema`/`rationale`/`suggestion`/`evidence`/`summary`, finding and convention `id`s, `origin`, the echoed `offset`, and `run_agent_on_pr`'s `runs[]` run bookkeeping.
- **M3** — Errors are `isError: true` tool results, never thrown exceptions from a handler.
- **M4** — `run_agent_on_pr` returns only findings from the runs it triggered. It performs create → wait → collect in one call (principle 1, "result, not operation"). There is no separate start or status tool.
- **M5** — Terminal statuses are `done | failed | cancelled`, and any non-`done` makes the result `isError`.
- **M6** — A timeout never cancels server-side runs.
- **M7** — No runtime import of `@devdigest/shared` — `import type` only (decision: avoids a second zod instance alongside the one the MCP SDK converts to JSON Schema).
- **M8** — `get_blast_radius` calls `GET /pulls/:id/blast` only (read-only, no analysis in the MCP) and surfaces `degraded`/`degraded_reason` unchanged.
- **M9** (principle 2) — **Flat scalar arguments only.** Every tool input property is a string, number, integer, boolean, enum, or an array of those. No input is an object or an array of objects. Ids are separate named scalars (`pr_id`, `agent_id`, `run_id`, `repo_id`). Enforced by the M9 guard test in `test/server.test.ts`.
- **M10** (principle 3) — **Concise defaults to verdict + findings, not a full dump.** `run_agent_on_pr` concise is `{ pr_id, agent_name, verdict, score, findings }` for `agent_id`, and `{ pr_id, results: [{ agent_name, verdict, score, findings_count }], findings }` for `all_agents`. The shape is keyed by input mode, never by run count, and there is never an aggregate verdict across agents. `truncated`/`total_findings`/`next` appear only when findings were cut. Every other tool's concise projection carries only fields a caller acts on.
- **M11** (principle 4) — **Every not-found/invalid error names a concrete next tool or fix.** Every `isError` text and every empty-result `note` has the form `"<what failed> — <next step>"`, and the next step is a tool call (`list_agents`, `run_agent_on_pr`, `get_findings`), a changed argument, or a concrete user action (start the API, ask the user for the uuid, add an API key). A bare status code or "not found" with no next step violates the contract.
