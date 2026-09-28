# e2e — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it rather than editing it away.

Sections are fixed. Add to the one that fits; never invent a new heading.

## What Works

- **2026-09-16** — Using `wait --text` / `wait --url` as the assertion needs no test framework: the command exits non-zero when the condition never holds, so a timeout and a failed assertion are the same failure with the same message. Evidence: `e2e/run.ts:72-76`.

## What Doesn't Work

- **2026-09-16** — agent-browser `scroll` and `screenshot --full` only ever capture the top of the app because the window itself never scrolls — the shell scrolls in an inner `<main style={{ overflow: "auto" }}>`; enlarge the viewport instead of scrolling. Evidence: `client/src/vendor/ui/shell/AppFrame.tsx:29`.

- **2026-09-27** — `npm i -g agent-browser` on Windows installs three shims next to each other — `agent-browser` (an sh script), `.cmd`, and `.ps1` — and `execFile` spawns without a shell, so the CLI is unspawnable by its bare name and every step of every flow dies identically with `spawn agent-browser ENOENT` even though `agent-browser --version` works fine in the terminal. `shell: true` is NOT the escape hatch: Node concatenates argv unescaped under a shell, and flow args routinely contain spaces (`find role button click --name "Agent runs"`), so it trades ENOENT for silently mis-split locators. Resolve past the shims to the native binary instead. Evidence: `e2e/run.ts:41-73`.

- **2026-09-27** — `wait --url` is not a settle point: it resolves the instant the URL matches, which on `{BASE}/` is the home *redirect*, while the PR list is still showing "Loading pull requests…" and skeleton rows. A `find text … click` placed directly after it races the fetch and fails with the row text absent — flows `04` and `05` both had this shape and flipped between pass and fail across consecutive hermetic runs with no code change. Any step that clicks fetched data needs an explicit `wait --text` on that data (or `wait --load networkidle`) in front of it. Evidence: `e2e/specs/04-pr-findings.flow.json:6-8`, `e2e/specs/05-pr-diff.flow.json:6-8`.

## Codebase Patterns

- **2026-09-16** — All flows run against one shared browser session rather than a fresh context each, so a flow inherits whatever page, cookies, and storage the previous flow left behind — flows are order-dependent and a red flow can be caused by the spec before it. Evidence: `e2e/run.ts:103-111`.

- **2026-09-27** — `AGENT_BROWSER_BIN` is the documented override but is no longer needed on Windows: `resolveBin()` walks `PATH` for `agent-browser.exe` and then for the native binary npm's shim dir hides at `node_modules/agent-browser/bin/agent-browser-win32-<arch>.exe`, so `execFile` gets a real executable and args keep passing through unescaped. POSIX still returns the bare name unchanged. Anything reworking the harness must keep spawning a real binary directly — not a shim, not a shell. Evidence: `e2e/run.ts:52-73`.

## Tool & Library Notes

- **2026-09-16** — The failure screenshot is best-effort (`.catch(() => {})`), so an empty `test-results/` after a red run means the screenshot step failed, not that the flow passed. Evidence: `e2e/run.ts:84-86`.

- **2026-09-16** — Each step is bounded by `E2E_STEP_TIMEOUT` (default 60 s) and 32 MB of stdout; exceeding either surfaces as an exec error on the step rather than as an assertion message, which reads like a browser failure but is not one. Evidence: `e2e/run.ts:45-49`.

- **2026-09-27** — `wait --text` matches **rendered** text and is case-sensitive, so a CSS `text-transform: uppercase` defeats a spec written from the i18n string: the PR list column header and the findings popover heading are `"Findings"` / `"{count} findings"` in `messages/en/prReview.json`, but reach the matcher as `FINDINGS` and `2 FINDINGS`, and the flow fails on a header that is plainly visible in the failure screenshot. Spell such assertions the way the pixels read, not the way the locale file does — and note the inverse holds for CSS ellipsis, where the full untruncated string still matches. Evidence: `client/src/app/repos/[repoId]/pulls/styles.ts:109`, `client/src/components/findings-list/FindingsList.tsx:109`, `e2e/specs/08-pr-findings-column.flow.json:8,11`.

- **2026-09-17** — Invoking the `agent-browser` binary directly from a shell (outside `run.ts`'s own flow loop) can take several minutes to return on its FIRST command on a cold machine, since that call has to launch a persistent daemon + Chrome behind the scenes; every later command against that same daemon responds in under a second. `E2E_STEP_TIMEOUT`'s 60s default (`e2e/run.ts:41`) is tuned for those later, warm calls — a manual first invocation hitting it looks like a hang, not slowness. Evidence: `e2e/run.ts:40-41`.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
