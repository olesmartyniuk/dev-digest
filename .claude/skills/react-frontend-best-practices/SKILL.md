---
name: react-frontend-best-practices
description: "Where React source code should physically live: folder layout, feature-based vs type-based structure, where to place components (shared vs local), constants, utils/helpers/services, and business logic (hooks vs components vs services), plus barrel-file and cross-module import pitfalls. Use whenever the user asks how to organize, restructure, or scaffold a React project or feature, where a new file/component/constant/util should go, whether to create a new folder, or how to split a growing file — even if they don't say 'architecture' explicitly. Complements the react-best-practices skill (which covers component/hook/state/perf patterns, not file placement)."
---

# React Frontend Best Practices — Project Layout

Decides *where things go*, not how a component renders. For component/hook/state/perf patterns, see the `react-best-practices` skill instead — the two are meant to be used together. Sources for every claim below are in [references/sources.md](references/sources.md); a full example tree is in [examples.md](examples.md).

## Severity Levels

- **CRITICAL** — Causes real scaling pain (import cycles, unbounded god-files, broken tree-shaking)
- **HIGH** — Slows a team down as the app grows
- **MEDIUM** — Consistency / DX preference, worth a house rule

---

## Core Principle: Colocation Over Category (CRITICAL)

Kent C. Dodds' rule: **things that change together should live together.** A test, its component, its styles, and its one-off hook belong in the same folder — not scattered into parallel `components/`, `styles/`, `hooks/` trees that force you to jump directories for every change. This is the principle underneath every recommendation below; when a rule here seems to conflict with it, colocation wins for anything used by *one* feature.

## Top-Level Layout: Feature-Based, Not Type-Based (HIGH)

- Group by **feature/domain** (`features/checkout/`, `features/user-profile/`), not by technical type (`components/`, `reducers/`, `sagas/` at the top level). Type-based structure scales fine for a small app but forces you to touch 4+ distant folders for one feature change as it grows.
- Each feature folder owns its own `components/`, `hooks/`, `api/` (or `services/`), `types/`, `constants/` — whatever it needs, only what it needs. Don't scaffold empty subfolders "just in case."
- Reserve a top-level `components/` (or `ui/`) for genuinely cross-feature, reusable primitives (Button, Input, Modal) — nothing feature-specific belongs there.
- Reserve a top-level `hooks/`, `utils/`, `lib/` only for things truly shared by 2+ features. When in doubt, start a feature with just `components/`, `hooks/`, and one of `utils/`/`lib/`, and add more structure only once the codebase actually asks for it — don't pre-build a deep tree for a feature that's one file.
- If you need a stricter, enforceable version of this with explicit dependency direction between layers, look at **Feature-Sliced Design** (layers: app → pages → widgets → features → entities → shared, each layer may only import from layers below it). It's a heavier commitment — reach for it on larger, multi-team apps, not by default.
- Cross-feature imports should go through a feature's public surface (its top-level export), never reach into `features/checkout/components/InternalRow.tsx` from another feature. That coupling is exactly what makes features hard to delete or move later.

## Where Components Go (HIGH)

- **Local to one feature/route** → lives inside that feature's own `components/` folder, not the shared one. If it's only ever rendered by one parent, colocate it next to that parent instead of creating a subfolder.
- **Shared across 2+ features** → promote it to the top-level `components/`/`ui/` folder *at the point you actually reuse it*, not preemptively.
- Don't adopt a rigid Atomic Design (atoms/molecules/organisms/templates) layout by default — in practice it produces duplicate near-identical atoms/molecules, unclear promotion rules for when something graduates a layer, and folders that don't map to how people think about the UI. It's a legitimate choice for a dedicated design-system package, not for typical feature code.
- One component per file; colocate its test and stylesheet next to it, not in a parallel tree.

## Where Constants Go (MEDIUM)

- A constant used by exactly one component/hook → module-level `const` at the top of that same file (outside the component body — see `react-best-practices`), or a colocated `constants.ts` if there are many.
- A constant shared across one feature only → that feature's own `constants.ts`.
- A constant shared across the whole app (route paths, feature flags, global config, enum-like domain values referenced app-wide) → a top-level `constants/` (or `config/`).
- Don't create a single catch-all root `constants.ts` that accumulates unrelated values from every feature — that's a magnet for merge conflicts and hides which constants are actually related.

## Utils vs. Helpers vs. Services (HIGH)

These three words get used inconsistently across teams — pick one convention per project and document it, but the useful distinction is by **what the code touches**:

- **`utils/`** — pure, stateless, no I/O functions with no domain knowledge (date formatting, string parsing, array grouping). Should be usable in any project unchanged. If it imports your API client or reads app state, it isn't a util.
- **`services/`** (or `api/`) — code that does real work against the outside world: HTTP calls, localStorage/IndexedDB access, analytics dispatch, websockets. This is where your API client instances and fetch wrappers live, one per external system/domain.
- **`helpers/`** — the vaguest of the three and the most likely to become a junk drawer; many teams drop it entirely and fold its contents into `utils/` (if pure) or a feature's own file (if feature-specific). If you keep it, scope it to "glue code that adapts data for a specific feature/view," not a second generic bucket next to `utils/`.
- A growing `utils.ts` with 30 unrelated exports is a smell — split it by topic (`date.ts`, `currency.ts`, `array.ts`) the moment it's doing more than one job.

## Where Business Logic Goes (CRITICAL)

There's no framework-enforced answer here, which is exactly why teams let logic leak into components by default — make the call explicit:

- **Components** should stay about *rendering*: taking data/handlers as props or from hooks, returning JSX. No fetches, no data transforms, no branching business rules inline in the component body.
- **Custom hooks** own local business logic: derived calculations, orchestrating multiple pieces of state, calling services and shaping their results for a component to consume. If you can describe what a piece of code does without mentioning JSX, it likely belongs in a hook, not the component.
- **Services** own logic that talks to the outside world or encodes domain rules independent of any UI (pricing rules, validation shared across forms, API request/response shaping). This is what makes business logic unit-testable without rendering anything.
- A useful smell test: if removing all JSX from a component would still leave meaningful logic behind, that logic should move to a hook or service.

## Barrel Files (`index.ts` re-exports) — Use Sparingly (CRITICAL)

Convenient re-export files are a common default, but they carry real, measured costs:

- Importing one thing from a barrel can force the bundler/dev-server to load and transform *everything* the barrel re-exports — one reported case was a 552 kB chunk for a single hook import, down to 64 kB once the barrel was removed.
- They're a leading cause of `Cannot access 'X' before initialization` circular-dependency bugs, and they measurably slow down `tsc` and Vite/webpack dev builds as a project grows.
- Guideline: avoid deep, app-wide barrels. A *thin* barrel (pure re-exports, no logic) at a feature's boundary to define its public API is fine; a root `index.ts` re-exporting dozens of components/utils across the whole app is not. If a barrel exceeds ~20 re-exports, split it or drop it — import the concrete module path instead (`import { slash } from './utils/slash'`, not `from './utils'`).

## When to Split a File/Component (MEDIUM)

- Split when a component does more than one distinct thing, when a piece of it would be reusable elsewhere, or when you can't describe what it does in one short phrase without "and."
- Prefer extracting a **custom hook** over a **child component** when the bloat is state/effects/data-transformation logic rather than markup — splitting UI you don't actually need to reuse just adds prop-drilling and indirection without benefit.
- After extracting, evaluate: if the split makes the parent clearer and the extracted piece is clear on its own, keep it; if it just creates awkward prop passing, merge it back. Don't split preemptively for code that's only used once.

## Quick Reference

| Question | Answer |
|---|---|
| New component used by one feature only | Inside that feature's `components/` (or colocated with its parent) |
| New component used by 2+ features | Top-level `components/`/`ui/` |
| New constant used by one file | Module-level `const` in that file |
| New constant used by one feature | That feature's `constants.ts` |
| New constant used app-wide | Top-level `constants/` |
| Pure, no-I/O function | `utils/` |
| HTTP/storage/analytics call | `services/` (or `api/`) |
| "Business logic" out of a component | Custom hook (UI-adjacent) or service (UI-independent) |
| Re-exporting a whole feature's public API | OK as a thin barrel |
| Re-exporting the whole app's components/utils from root | Don't — import concrete paths |
