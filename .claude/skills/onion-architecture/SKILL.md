---
name: onion-architecture
description: "Onion/ports-and-adapters layering for the backend (server/): the dependency rule (inner layers never import outer layers), how it maps onto this repo's routes → service → repository → adapters shape, where a new business rule / use case / external integration / endpoint belongs, and how the layering is enforced with dependency-cruiser (`pnpm arch`). Use whenever the user asks about onion/clean/hexagonal architecture, layered architecture, domain vs application vs infrastructure vs presentation layers, where new server code should live, adding a new module/adapter/port, dependency direction between layers, or why an `arch`/dependency-cruiser check is failing. Complements fastify-best-practices (route/plugin mechanics) and drizzle-orm-patterns (query mechanics) — this skill governs which layer code is allowed to live in, not how to write the code inside it."
---

# Onion Architecture (Backend)

Governs *which layer server code belongs in and which way dependencies point* — not how to write a Fastify route or a Drizzle query (see `fastify-best-practices` / `drizzle-orm-patterns` for that). Sources in [references/sources.md](references/sources.md); good/bad code pulled from real files in [examples.md](examples.md).

## Severity Levels

- **CRITICAL** — Breaks the dependency rule (inner imports outer). Untestable domain/application logic, hard-to-swap infrastructure.
- **HIGH** — Layer discipline drift that will compound (SQL/HTTP leaking outside its layer, a module reaching into another module's internals).
- **MEDIUM** — Naming/placement consistency within a layer.

---

## The One Invariant: The Dependency Rule (CRITICAL)

Onion, Clean, and Hexagonal architecture are the same idea with different names for the rings. The only thing that actually matters across all of them:

**Inner layers never import outer layers. Outer layers implement interfaces the inner layers define.**

Everything below is that rule applied to this codebase's actual file layout — not a prescription to rename folders or adopt new jargon.

## Layers, Mapped Onto This Repo

| Ring (inner → outer) | Devdigest equivalent | Rule |
|---|---|---|
| **Domain** | `reviewer-core/` (whole package — no I/O deps in its `package.json` by design); a module's `helpers.ts` / `constants.ts` / `types.ts` | Pure functions/types/literals. No Fastify, no Drizzle/postgres, no `adapters/`, no `Container`. |
| **Ports** | `server/src/vendor/shared/adapters.ts` — `LLMProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `Embedder`, `AuthProvider`, `SecretsProvider` | Interfaces only. This file already **is** the ports layer — read it before adding a new external integration; extend it, don't bypass it. |
| **Application** | `modules/<name>/service.ts` (+ `run-executor.ts` where a module splits execution out) | Use-case orchestration. Depends on `Container` and the port interfaces, never on a concrete adapter class or `fastify`. |
| **Infrastructure** | `modules/<name>/repository.ts`, `adapters/*`, `db/schema/*`, `platform/container.ts` | Implements the ports. Only place `drizzle-orm`/`postgres` and vendor SDK imports (Octokit, Anthropic/OpenAI SDKs, simple-git) belong. `container.ts` is the composition root that wires infra into the ports. |
| **Presentation** | `modules/<name>/routes.ts`, `app.ts`, `modules/_shared/context.ts` | HTTP + Zod boundary only (`fastify-best-practices` covers this in depth). No SQL, no business branching. |

This is not a new structure to adopt — it's the naming for what `server/CLAUDE.md`'s "Layer discipline" section already asks for ("no SQL outside `repository.ts`, no HTTP outside `routes.ts`, no literals outside `constants.ts`"). The addition here is the **direction** — services depend on ports, not on the concrete class that implements them — and a way to check it mechanically instead of by convention alone.

## Ports Already Exist — Use Them, Don't Reinvent Them

Before writing `if (isTestEnv) use mock else use real client` anywhere, check `@devdigest/shared`'s `adapters.ts`: services already resolve everything external through `Container` (`container.git`, `container.llm(id)`, `container.github()`, …), which returns the *interface* type. Tests inject a mock via `ContainerOverrides` — never construct a client inline in a service (`AGENTS`-style code review will flag `new SomeSdkClient(...)` inside a `service.ts`).

**New external system** (a new LLM provider, a new source-control host, …):
1. Add the interface to `server/src/vendor/shared/adapters.ts` (and the client copy in `client/src/vendor/shared` if the frontend needs the type — see the repo's vendoring gotcha).
2. Implement it under `server/src/adapters/<name>/`.
3. Wire it into `platform/container.ts` as a lazily-constructed getter, with an `overrides` slot for tests.
4. Consume it from `service.ts` via `this.container.<name>` — never `import` the adapter class into a service.

## Where New Code Goes

| Question | Answer |
|---|---|
| A pure business rule / calculation | `helpers.ts` (or `reviewer-core/` if it's part of the review-generation pipeline itself) |
| A new use case / orchestration step | `service.ts` |
| A DB query | `repository.ts` — never inline in `service.ts` or `routes.ts` |
| A new external system call | An interface in `adapters.ts` (shared) + an implementation in `adapters/<name>/` + a `Container` getter |
| A new HTTP endpoint | `routes.ts` — thin: parse via Zod schema, call one `service` method, return |
| A literal/magic string used once | Inline; used across a module → `constants.ts` |
| Data needed by a different module | `container.<x>Repo` / `container.<x>` (composition root), **not** `import ... from '../other-module/...'` |

## Enforcement: `pnpm arch`

Layer discipline is checked mechanically with `dependency-cruiser` (`server/.dependency-cruiser.cjs`), run via `pnpm arch` (and wired into the `server-unit` CI workflow). This is a **separate config** from `src/adapters/depgraph` — that one cruises a cloned *target* repo at runtime for the `repo-intel` indexer; `.dependency-cruiser.cjs` polices devdigest's own source.

Rules enforced:
- `no-domain-outward` — `helpers.ts`/`constants.ts`/`types.ts` can't import Fastify/Drizzle/adapters/Container/db.
- `no-http-outside-presentation` — only `routes.ts`, `app.ts`, the module registry, and the shared request-context helper may import `fastify`.
- `no-sql-outside-persistence` — only `repository.ts` files and `db/` may import `drizzle-orm`/`postgres`.
- `no-service-imports-adapters-directly` — `service.ts`/`run-executor.ts` can't import from `adapters/` (go through `Container`).
- `no-cross-module-reach` — a module can't import another module's folder directly (except the shared `_shared/` folder); cross-module access goes through `Container`.
- `no-circular` — no import cycles.

**Pre-existing drift is frozen, not required to be fixed to add this skill.** `.dependency-cruiser-known-violations.json` (generated with `pnpm arch:baseline`) holds the violations that existed when the rules were introduced (e.g. a few routes doing an inline `eq()` query, `repo-intel/service.ts` calling two adapters directly) — `pnpm arch` only fails on **new** violations. If you touch a file with a baselined violation, prefer fixing it over leaving it; don't let the baseline grow.

**Adding a genuinely justified exception:** don't loosen a rule's regex to make one call site pass. Either fix the placement, or if the exception is real (rare), add a narrowly-scoped `pathNot`/exemption to the specific rule with a `comment` explaining why — reviewed like any other architecture decision.
