# Agents

Subagents invoked via the `Agent` tool. Canonical location is `.claude/agents/`. Each is a self-contained context — it does not see the caller's conversation history, prior skill invocations, or files already read — so every agent below is designed to be fully briefed by its input (a prompt, a plan file path) rather than by shared state.

## Catalog

| Agent | Role | Tools | Model |
|-------|------|-------|-------|
| [planner](planner.md) | Writes a file-by-file implementation plan before any code exists | `Read, Grep, Glob, Write, Skill` | opus |
| [implementer](implementer.md) | Executes an approved plan — backend and frontend, verified before hand-back | `Read, Write, Edit, Grep, Glob, Bash, Skill, TodoWrite` | inherit |
| [researcher](researcher.md) | Read-only research, from this project or the web, with a locator per claim | `Read, Grep, Glob, WebSearch, WebFetch` | sonnet |

The intended flow is `planner → implementer`, with `researcher` used ad hoc by either a human or another agent to settle a factual question before deciding or writing code.

## planner

Turns a request into a plan another agent (`implementer`) can execute without guessing. Writes exactly one file, under `docs/plans/<date>-<slug>.md`, and no product code — it has no `Edit` and no `Bash`, deliberately. It inventories this repo's packages, modules and the full skills catalog, and assigns skills per plan step rather than leaving that judgment to whoever implements it later.

**Design choices and their sources:**

- **The plan file is the entire hand-off; the hand-back message is a short pointer to it.** A subagent's context is invisible to whatever runs next, so the plan has to be self-contained — this is the documented behavior of Claude Code subagents, not an assumption. *Source: [Create custom subagents](https://code.claude.com/docs/en/sub-agents) — Claude Code Docs (primary).*
- **Tool scoping is intentional, not just "whatever's left over."** `Read, Grep, Glob, Write, Skill` (no `Edit`, no `Bash`) is the documented allowlist mechanism for restricting a subagent to a narrow write surface — one path, never arbitrary edits. *Source: [Create custom subagents](https://code.claude.com/docs/en/sub-agents) — Claude Code Docs (primary); role-based tool scoping example (planner-equivalent role gets read-heavy tools, implementer-equivalent gets `Edit`/`Write`/`Bash`) — [Best practices for Claude Code subagents](https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/) — PubNub (secondary).*
- **Every plan carries an explicit status flag** (`READY FOR IMPLEMENTER` / `BLOCKED` / `NO PLAN NEEDED`) that the next stage checks before acting, rather than an implicit "looks done." *Source: status-flag hand-off pattern (e.g. `READY_FOR_ARCH`) — [PubNub](https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/) (secondary).*
- **The planner is a deliberate complexity add, justified by the task shape.** Anthropic's own guidance is to add multi-agent structure only when it demonstrably beats a single prompt — a two-stage plan/execute split is explicitly called out for coding tasks that touch multiple files, which is the case this planner exists for. *Source: [Building Effective AI Agents](https://www.anthropic.com/research/building-effective-agents) — Anthropic Research (primary).*
- **All 14 project skills are preloaded via the `skills:` frontmatter field**, not discovered per-call — a documented alternative to on-demand `Skill`-tool invocation, chosen here so the planner has full skill content (not just descriptions) available when assigning skills to steps. *Source: `skills:` frontmatter preload mechanism — [Skills documentation](https://code.claude.com/docs/en/skills) — Claude Code Docs (primary).*
- **Skills are named from what's actually on disk (`Glob .claude/skills/*/SKILL.md`), never from `skills-lock.json`.** This is a project-specific finding, not a vendor source: `skills-lock.json` pins skills that no longer have folders and misses several that exist — see root [INSIGHTS.md](../../INSIGHTS.md).

## implementer

Executes a plan — it does not redesign it. Applies this repo's backend skills (Fastify, Drizzle, Postgres) to `server/`, frontend skills (Next.js, React, TanStack Query) to `client/`, enforces onion-architecture layering, and verifies with typecheck/tests/`pnpm arch` before handing back.

**Design choices and their sources:**

- **"Execute, don't redesign" plus explicit stop-and-report instead of silent substitution.** If a step is impossible, the implementer records the conflict and hands back `PARTIAL` rather than inventing a different design — this mirrors a documented anti-pattern pair (implementer scope-creeping past its guardrails, or redesigning instead of executing), mitigated by requiring an explicit halt. *Source: ADR-guardrail / "STOP and ask" pattern — [PubNub](https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/) (secondary).*
- **`Status: COMPLETE` is gated on every applicable verification command actually passing**, not on "the code looks right." *Source: "Only mark DONE if all tests pass" — [PubNub](https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/) (secondary).*
- **Full write/execute tool access (`Edit`, `Write`, `Bash`) is the counterpart to the planner's read-mostly scope** — the documented allowlist mechanism, applied to the opposite end of the pipeline. *Source: [Create custom subagents](https://code.claude.com/docs/en/sub-agents) — Claude Code Docs (primary).*
- **All 14 skills are preloaded via frontmatter `skills:`**, so the implementer never spends a `Skill` tool call fetching one mid-task — "invoke it before touching X" in this file means *consult what's already loaded*, not fetch it. This was a deliberate move away from an earlier on-demand design (`Glob` the catalog, call `Skill` per file) once the project decided guaranteed availability was worth the fixed context cost of loading all 14 regardless of whether a given run needs the frontend or backend half. *Source: `skills:` frontmatter preload vs. on-demand discovery via the `Skill` tool during execution — [Skills documentation](https://code.claude.com/docs/en/skills) — Claude Code Docs (primary).*
- **Onion-architecture layering is checked, not advisory** — `pnpm arch` (dependency-cruiser) enforces the same dependency rule the preloaded `onion-architecture` skill describes; a failing check gets the placement fixed, never the config relaxed. This is a project convention, not sourced externally — see [.claude/skills/onion-architecture/SKILL.md](../skills/onion-architecture/SKILL.md).

## researcher

Read-only. Answers a question from this project's own code/docs or from the web, and returns a fixed report with a locator (file:line, or URL) for every claim. Has no `Write`, `Edit` or `Bash`.

**Design choices and their sources:**

- **Strict read-only tool scoping** — the documented mechanism for a subagent that must never take an action, only report findings. *Source: [Create custom subagents](https://code.claude.com/docs/en/sub-agents) — Claude Code Docs (primary).*
- **One mode per run (`PROJECT` or `WEB`), never blended**, and a hard tool-call budget (8 for project, 6 for web) — a project-specific discipline for keeping a research subagent cheap and predictable, not itself sourced from a vendor doc.
- **"Ask rather than guess," but asking means finishing the run with `Status: NEEDS INPUT`, not waiting interactively.** A subagent has no interactive tool and gets one shot — this constraint is a direct consequence of the documented isolated-context behavior common to all three agents here. *Source: [Create custom subagents](https://code.claude.com/docs/en/sub-agents) — Claude Code Docs (primary).*

This agent (in `WEB` mode) is also what produced the sourced findings cited throughout this README — see **Sources** below for the full trail.

## Sources

| Source | Publisher | Tier | Used for |
|---|---|---|---|
| [Create custom subagents](https://code.claude.com/docs/en/sub-agents) | Claude Code Docs (Anthropic) | Primary | Context isolation, tool allowlists, description-based delegation |
| [Skills documentation](https://code.claude.com/docs/en/skills) | Claude Code Docs (Anthropic) | Primary | `skills:` frontmatter preload vs. on-demand `Skill` tool invocation, `context: fork` + `agent:` routing |
| [Building Effective AI Agents](https://www.anthropic.com/research/building-effective-agents) | Anthropic Research | Primary | When multi-agent structure is justified; orchestrator-worker framing for multi-file coding tasks |
| [Best practices for Claude Code subagents](https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/) | PubNub (engineering blog) | Secondary | Role-based tool scoping example, status-flag hand-off pattern, scope-creep / redesign-instead-of-execute anti-patterns |

Retrieved 2026-09-27 by a `researcher` agent run in `WEB` mode. No official Anthropic document names "planner"/"implementer" as a vendor-defined role pair — Claude Code's own built-in read-only planning agent is called `Plan`, and there is no built-in "implementer." The naming and split here is a project convention layered on top of the documented Claude Code primitives above, not a copy of a named external pattern.
