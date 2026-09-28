---
name: pr-self-review
description: "Local self-review gate for this repo's pending changes, run before any GitHub-facing action (git push, gh pr create, gh pr comment/edit, opening or updating a PR) or manually on request ('review my changes', 'self-review', 'is this ready for a PR'). Diffs the working tree against the base branch, routes each changed file to the frontend/backend/full-stack skills that apply to it (react-best-practices, react-frontend-best-practices, next-best-practices, react-testing-library, fastify-best-practices, drizzle-orm-patterns, postgresql-table-design, onion-architecture, security, zod, typescript-expert), runs those skills' checks against the diff, and blocks the GitHub action if any CRITICAL finding survives. Use this instead of pushing or opening a PR straight away."
---

# PR Self-Review

Runs this repo's own skills — the same ones used for feature work — against the *diff*, before it leaves the machine. It is a gate, not a report: a surviving **CRITICAL** finding means the GitHub action does not happen until it's fixed.

This skill only reads and evaluates. It never pushes, creates, or edits anything on GitHub — that stays with whatever command triggered the review.

---

## When to run this

- **Before any GitHub-facing action**: `git push` (to a branch that feeds a PR), `gh pr create`, `gh pr edit`, `gh pr comment`, re-pushing after new commits to an open PR.
- **Manually**, whenever the user asks for a self-review, a sanity check before opening a PR, or "is this ready."
- Not needed for purely local commits that aren't about to be pushed — re-run it right before the push/PR step instead of on every commit.

---

## Step 1 — Scope the diff

Diff everything that would leave the machine, not just the working tree:

```sh
git fetch origin main --quiet
git merge-base HEAD origin/main       # base for the comparison
git diff --name-status $(git merge-base HEAD origin/main)...HEAD   # committed, not yet on origin
git status --porcelain                # staged + unstaged, not yet committed
```

Union of both = the review scope. If either command shows nothing, say so and stop — there's nothing to review.

Read the *content* of each changed file's diff (`git diff <base>...HEAD -- <path>` / `git diff -- <path>`), not just the filename — routing in Step 2 depends on what changed, not only where.

---

## Step 2 — Route changed files to skills

Every changed path maps to one or more package roles from the root [CLAUDE.md](../../../CLAUDE.md) repo map, and each role pulls in specific skills from the [skills catalog](../README.md). A file can match more than one row — apply every skill that matches.

| Changed path | Role | Skills to apply |
|---|---|---|
| `client/src/app/**/page.tsx`, `layout.tsx`, `loading.tsx`, `route.ts`, `metadata` exports | Next.js routing | `next-best-practices`, `react-best-practices` |
| `client/src/app/**/_components/**`, `client/src/components/**` | UI components | `react-best-practices`, `react-frontend-best-practices` |
| `client/src/app/**/_hooks/**`, `client/src/lib/hooks/**` | Data/orchestration hooks | `react-best-practices`, `react-frontend-best-practices` |
| `client/src/lib/api.ts`, anything calling `fetch` in `client/` | Network boundary | `security` (input handling, error surfacing), `react-frontend-best-practices` |
| `client/**/*.test.tsx`, `client/**/*.test.ts` | Client tests | `react-testing-library` |
| `client/src/vendor/ui/**` | Vendored design system | **CRITICAL by default** — this tree is a "do not touch" per `client/CLAUDE.md`; flag any direct edit unless it goes through the barrel |
| `client/src/vendor/shared/**` | Vendored contracts (client copy) | `zod`; cross-check against `server/src/vendor/shared` for drift (see Step 3 note) |
| `server/src/modules/**/routes.ts`, `server/src/app.ts` | Fastify presentation layer | `fastify-best-practices`, `security`, `onion-architecture` |
| `server/src/modules/**/service.ts`, `**/run-executor.ts` | Application/use-case layer | `onion-architecture`, `typescript-expert` |
| `server/src/modules/**/repository.ts` | Persistence layer | `drizzle-orm-patterns`, `postgresql-table-design`, `onion-architecture` |
| `server/src/db/schema/**` | Table definitions | `postgresql-table-design`, `drizzle-orm-patterns` |
| `server/src/db/migrations/**` | Migrations | `postgresql-table-design` + **CRITICAL by default** — this folder is append-only per root `CLAUDE.md`; flag any edit to an existing migration file or `meta/_journal.json` |
| `server/src/adapters/**`, `server/src/platform/**` | Infra / composition root | `onion-architecture`, `security` (secrets, auth, external calls) |
| `server/src/vendor/shared/**` | Vendored contracts (server copy) | `zod`; cross-check against `client/src/vendor/shared` |
| `reviewer-core/**` | Pure review engine | `typescript-expert`, `onion-architecture` (domain ring — flag any `node:fs`, `node:child_process`, DB client, or non-injected network call per `reviewer-core/CLAUDE.md`'s purity rule) |
| `e2e/specs/**`, `e2e/run.ts`, `e2e/lib/**` | E2E flows | `typescript-expert`; flag any `chat` command, LLM call, or non-deterministic locator per `e2e/CLAUDE.md`'s determinism rules |
| Any `*.ts` / `*.tsx` file, either package | — | `typescript-expert` |
| Any file defining or extending a `z.object` / Zod schema | Contracts | `zod` |
| Any route handler, auth check, file upload, secret, or user-input handling, either package | — | `security` |
| `.claude/skills/**`, `skills-lock.json` | Skills infra | **CRITICAL by default** if `skills-lock.json` hashes are hand-edited — regenerated by tooling only |

If a changed path doesn't match any row (docs, config, `specs/`, `docs/agent-prompts/`), skip skill review for it but still check it isn't one of the other "Do not touch" paths from root `CLAUDE.md` (`server/clones/**`, `client/.next/**`, `**/test-results/**`).

---

## Step 3 — Apply each matched skill

For each skill matched in Step 2, load it (`Skill` tool) if not already loaded this session, and hold its checklist against the *actual diff content* of the files that matched it — not the whole file, and not generic advice disconnected from what changed.

Two cross-cutting checks that no single skill owns, run them directly:

- **Shared-contract drift** — if a Zod contract in `server/src/vendor/shared` changed, confirm the matching file in `client/src/vendor/shared` was updated too (and vice versa). Root `CLAUDE.md` already flags these two copies as drifted; a one-sided edit that a UI page or route now depends on is a CRITICAL finding, not a HIGH one.
- **Architecture boundary** — if `server/**` changed, treat `pnpm arch` as informative: dependency-cruiser catches layer violations (`no-domain-outward`, `no-http-outside-presentation`, `no-sql-outside-persistence`, `no-service-imports-adapters-directly`, `no-cross-module-reach`, `no-circular`) mechanically. Run it and fold any new violation (not one already in `.dependency-cruiser-known-violations.json`) into the findings.

---

## Step 4 — Severity and the gate

Use each skill's own severity scale where it defines one (`security` and `onion-architecture` both define CRITICAL/HIGH/MEDIUM[/LOW]). For skills that don't define a scale, apply this floor:

| Severity | Bar |
|---|---|
| **CRITICAL** | Breaks the build, breaks tests, is a real security vulnerability, violates a "Do not touch" rule, causes a cross-package contract mismatch, or breaks the onion-architecture dependency rule. |
| **HIGH** | A real bug or design flaw likely to cause defects in normal use, but not immediately destructive. |
| **MEDIUM** | Best-practice deviation with limited blast radius (naming, structure, missed convention). |
| **LOW** | Style / polish. Worth mentioning, never worth blocking. |

**Gate:** if any finding across any skill is CRITICAL, the review **fails**. Do not run the GitHub action (no push, no `gh pr create`, no comment/edit) — report the CRITICAL findings and stop. HIGH/MEDIUM/LOW findings are reported but advisory; the user decides whether to fix them before proceeding.

---

## Step 5 — Report

Report per finding: file:line, the skill that flagged it, severity, a one-sentence statement of the problem, and the fix. Group by severity, CRITICAL first. End with a one-line verdict: **blocked** (≥1 CRITICAL) or **clear to proceed** (none).

If the review is clear, proceed with whatever GitHub action triggered it (or tell the user it's clear, if run manually). If blocked, fix the CRITICAL findings and re-run this skill before attempting the GitHub action again — don't push past the gate with `--no-verify`-style shortcuts.
