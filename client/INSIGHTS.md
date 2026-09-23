# client — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it rather than editing it away.

Sections are fixed. Add to the one that fits; never invent a new heading.

## What Works

- **2026-09-16** — Treating in-flight runs as server state (`/pulls/:id/runs/active`) rather than component state is what makes a running review survive reload, navigation, and a second tab; SSE only supplies the live log on top of it. Evidence: `client/src/lib/hooks/reviews.ts:28-34`.

- **2026-09-22** — The `@devdigest/ui` root barrel re-exports `./charts` and therefore recharts, and 53 non-vendor files import from that barrel, which looks like it must drag recharts into every route — but a production build ships recharts in zero client chunks, because the barrel is local ESM source under `src/vendor/ui` rather than a node_modules package and webpack tree-shakes the unused re-exports. The "always import from the barrel" rule costs dev-server and `tsc` graph size only, so don't trade it away for sub-path imports or `optimizePackageImports` on the strength of bundle fears; measure the chunks first. Evidence: `client/src/vendor/ui/index.ts:7`.

## What Doesn't Work

- **2026-09-16** — The "all-longhand" border trick in `FindingCard` does not fully silence React's style warning: `borderColor` is itself a shorthand for the four `border-*-color` longhands, so a rerender that changes it while `borderLeftColor` is set still logs a conflicting-property warning and any test that rerenders the card emits that stderr noise. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts:7`.

- **2026-09-16** — Sending `content-type: application/json` on a body-less POST/PUT makes Fastify reject the request with "Body cannot be empty when content-type is application/json", which is why `apiFetch` sets the header only when a body is actually present — adding it unconditionally breaks every no-body mutation (refresh, resync, cancel). Evidence: `client/src/lib/api.ts:27-30`.

- **2026-09-17** — All seven cells in `PRRow` are inert, so nothing in the file demonstrates the constraint that the entire row carries an `onClick` routing to the PR detail page: the first interactive control added to any PR-list cell must `stopPropagation` on both its trigger and any panel it opens, or clicking it navigates away instead of acting. Evidence: `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:25`.
  - **2026-09-18** — Confirmed: the FINDINGS cell's popover was the first such control and needed exactly this. Portalling the panel adds a second, less obvious reason rather than removing the first — React portals propagate events through the component tree, not the DOM tree, so a panel rendered into `document.body` still bubbles into the row's handler exactly as an inline child would. Evidence: `client/src/vendor/ui/kit/Popover.tsx:154`.

- **2026-09-18** — An anchored panel opened from a PR-list row cannot use `Dropdown`'s absolute-positioning pattern: the card wrapping the rows sets `overflow: hidden` to clip its own rounded corners, so an absolutely-positioned panel inside a row is cut off at the card's edge rather than overflowing it. Such a panel has to be portalled to `document.body` with `position: fixed` and placed from the trigger's `getBoundingClientRect()`, which is also what makes a flip above the trigger and a viewport-bounded `maxHeight` possible. Evidence: `client/src/app/repos/[repoId]/pulls/styles.ts:91-97`, `client/src/vendor/ui/kit/Popover.tsx:149-156`.

- **2026-09-22** — `src/components/showcase/` reads as dead code to any name-based search: `Showcase.tsx` exports a function called `Gallery`, so grepping for the component or folder name turns up no consumer anywhere in `src/`. It is imported as `Gallery` by the smoke test and rendered in both themes, and it is also the only app-side consumer of the chart primitives — deleting it as unused takes the smoke test with it. Evidence: `client/src/components/showcase/Showcase.tsx:59`, `client/src/test/smoke.test.tsx:4`.

- **2026-09-22** — Adding a new tab to `AgentEditor`'s `TABS` array is not sufficient to make it reachable: `useAgentTab`'s `?tab=` reader keeps its own separate `VALID_TABS` allowlist and silently falls back to `"config"` for anything not on it, with no error either way — the new tab simply never renders no matter what the URL says. Any future tab (Evals/Stats/CI) must be added to both `AgentEditor/constants.ts`'s `TABS` and this hook's `VALID_TABS`. Evidence: `client/src/app/agents/[id]/_hooks/useAgentTab.ts:7`, `client/src/app/agents/[id]/_components/AgentEditor/constants.ts:11-14`.

## Codebase Patterns

- **2026-09-16** — Routes are keyed by PR *number* while every PR API is keyed by the row uuid, so the detail page resolves number → id through the cached pulls list before fetching anything; a component that fetches straight from the route param will 404. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:32-36`.

- **2026-09-17** — `VerdictBanner` is not a page-level PR summary — it's rendered once per run, inside `ReviewRunAccordion` (one per `ReviewRecord`), so what reads as a single "PR brief" panel is just the newest (`defaultOpen`) accordion's banner. A per-run datum `VerdictBanner` needs beyond what `ReviewRecord` already carries must be resolved by the caller and threaded down through `ReviewRunAccordion` — e.g. `FindingsTab` builds a `run_id → RunSummary` map from the `prRuns` it already has, rather than either component fetching anything itself. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx:140-149`, `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx:66-71`.

- **2026-09-22** — The client imports only *types* from `@devdigest/shared`, so zod is absent from every built chunk; importing a schema *value* — `Provider.options` to derive a dropdown from the contract, say — would pull the whole zod runtime into that route's bundle to save three literals. Restate such lists as `as const satisfies readonly Provider[]`, which keeps them checked against the contract with no runtime import. Evidence: `client/src/app/agents/constants.ts:16`.

- **2026-09-22** — Severity → colour already has an upstream source of truth in the vendored design system, which is invisible from feature code: `tokens.ts` maps `SUGGESTION` to `var(--sugg)`. Four separate local severity maps had accumulated and one had already drifted to `var(--accent)` for suggestions. Ordering and colour now live once in `src/lib/severity.ts` — extend that, and check `tokens.ts` before inventing a mapping. Evidence: `client/src/vendor/ui/primitives/tokens.ts:12`, `client/src/lib/severity.ts:30`.

- **2026-09-22** — `src/vendor/ui/nav.ts`'s sidebar `NAV` registry sits under the vendored `src/vendor/ui/**` tree that `CLAUDE.md` marks "do not restructure", but it is plain per-lesson data (one object per top-level route) meant to be extended, not layer code — the pre-existing `"agents"` entry is the precedent, and L02 added a `"skills"` entry the same way. A future lesson adding its own top-level route should add its `NavItemDef` here rather than assuming the file is off-limits or inventing a second registry elsewhere. Evidence: `client/src/vendor/ui/nav.ts:25-27`.

## Tool & Library Notes

- **2026-09-16** — Path aliases are declared twice and neither file reads the other: adding one to `tsconfig.json` without also adding it to `vitest.config.ts` type-checks and builds fine but fails at test time with an unresolved import. Evidence: `client/vitest.config.ts:8-12` vs `client/tsconfig.json:22`.

- **2026-09-16** — Vitest only collects `src/**/*.test.{ts,tsx}`, so a test file placed outside `src/` is silently never run rather than reported as missing. Evidence: `client/vitest.config.ts:18`.

- **2026-09-16** — `SeverityBadge` renders its label as `Critical`/`Warning`/`Suggestion` and only uppercases via CSS `textTransform`, so an RTL assertion on text content such as `getByText("CRITICAL")` fails even though the UI shows "CRITICAL". Evidence: `client/src/vendor/ui/primitives/tokens.ts:10-12`, `client/src/vendor/ui/primitives/Badge.tsx:75`.

- **2026-09-18** — There is no `@testing-library/user-event` dependency here (only `react` and `jest-dom`), so interaction tests drive `fireEvent` directly — and `fireEvent.click` will never dismiss anything whose outside-click handler listens on `mousedown`, which is what both `Dropdown` and `Popover` do; a "closes on outside click" test written with `click` asserts a close that cannot happen and has to use `fireEvent.mouseDown`. Evidence: `client/package.json:27-28`, `client/src/vendor/ui/kit/Popover.tsx:111`.

## Recurring Errors & Fixes

- **2026-09-22** — `error TS2742: The inferred type of 's' cannot be named without a reference to '.pnpm/csstype@…'` from a `styles.ts` means the style object spreads a `CSSProperties`-annotated constant (a shared `ellipsis` helper, for instance): `declaration: true` forces TS to name the resulting type and it cannot reach csstype from there. The per-key `… satisfies CSSProperties` pattern the other style files use is unaffected, so inline the shared properties instead of spreading an annotated const — annotating the whole object as `Record<string, CSSProperties>` would fix the error but throw away per-key checking. Evidence: `client/tsconfig.json:15`, `client/src/components/diff-viewer/styles.ts:6`.

## Session Notes

## Open Questions
