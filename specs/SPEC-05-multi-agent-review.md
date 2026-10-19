# Spec: Multi-Agent Review
Spec ID: SPEC-05
Status: draft
Supersedes: none
Design sources: five mockup images read this run (referred to below as M1-M5):
M1 = PR #482 overview with the "Run Review" dropdown open;
M2 = Configure run, empty state;
M3 = Configure run with PR #482 chosen;
M4 = Results, Columns mode;
M5 = Results, Tabs + detail mode.
All five were opened from `C:\Users\OLEKSA~1\AppData\Local\Temp\emdash-drop-*-paste.png` (the five files named in the request). Also read: `server/src/db/schema/runs.ts`, `server/src/vendor/shared/contracts/observability.ts`, `review-api.ts`, `findings.ts`, `platform.ts` (`RunRequest`), `server/src/modules/reviews/{routes,service,findings}.ts`, `server/src/modules/eval/routes.ts`, `reviewer-core/src/eval/score.ts`, `client/.../RunReviewDropdown.tsx`, `client/src/components/app-shell/helpers.ts`, `specs/review-flow.md`.

Filed at the root `specs/` because it spans `server` (grouping, API) and `client` (picker, Configure run, results) by design. Requirements below incorporate the requester's answers to the first draft's open questions; see "Decisions".

## Problem statement and user
One PR can contain security risks, performance problems and domain-rule violations at the same time. Running several specialised reviewer agents gives wider coverage, but only if the product (a) lets the reviewer choose which agents run, (b) groups the agents' findings so overlapping ones are not shown as noise without losing who said what, (c) shows where agents disagree, and (d) shows time and cost up front instead of hiding them. The user is the local, single-user DevDigest reviewer.

## Goals / Non-goals
**Goals:**
- Pick a set of agents on the PR page or on a Configure run screen and start one multi-agent review.
- Persist the agent runs of one such review under one parent run.
- Present results per agent (Columns) and per finding (Tabs + detail), with a "Where agents disagree" block.
- Show an estimated time and cost before the run, derived from past runs.

**Non-goals:**
- No change to `ci/` or `agent-runner/` (worktree A boundary; neither directory exists in this worktree, so this is a no-touch rule only).
- No change to reviewer-core or to how a single agent reviews (grounding, scoring stay as in `specs/review-flow.md`).
- No new endpoint for starting a run and no new parallel-execution mechanism: `POST /pulls/:id/review` is extended.
- "Learn" and "Reply to author" actions (shown in M5) are out of scope.
- Single-agent and "Run all enabled" runs do not get a parent run; existing `agent_runs` rows stay parentless.

## Decisions (resolved from the requester's answers and agreed defaults)
- D1 Grouping rule: two findings group when their normalized file paths are equal and their inclusive line ranges overlap. Reuse the logic of `normalizeEvalPath` and `rangesOverlap` in `reviewer-core/src/eval/score.ts` (the server reaches it through the existing reviewer-core source import, or mirrors it; reviewer-core itself is not changed). Severity, category and title do not affect grouping.
- D2 Start API: `POST /pulls/:id/review` is extended with a list of agent ids; the response also carries the parent run id. No new endpoint. The existing `agentId` and `all` forms keep working unchanged.
- D3 "Did not flag" reason: deterministic generalized text derived from the agent's scope/category (e.g. "Not a security concern."). No extra LLM call.
- D4 Finding actions shown: Accept, Dismiss, Turn into eval case. Learn and Reply to author are hidden.
- D5 Accept/Dismiss on a grouped finding applies to all underlying original findings.
- D6 Only runs started from the new picker or Configure run screen get a `multi_agent_runs` parent.
- D7 Sidebar "Multi-Agent Review": opens the results of the user's latest multi-agent run (latest in the workspace) if one exists, otherwise opens Configure run. Configure run stays reachable from the "Configure run" button on the results page and from "Configure agents...".
- D8 Header label is neutral ("N agents · parallel · <total time> · <total cost>"); the mockups' "fan-out via worktrees" wording is not used.
- D9 The disagreement block lists only agents that were part of the run.
- D10 Totals: time is wall-clock, taken as the maximum of the agents' persisted durations; cost is the sum.
- D11 Score is each agent's own persisted review score; no combined score.
- D12 Confidence is shown as a rounded percentage of `confidence` (0..1); "Suggested fix" is shown only when `suggestion` is non-null.
- D13 Column/run statuses: queued, running, done, failed, cancelled.
- D14 New contract goes in a new `@devdigest/shared` file (both vendored copies); `observability.ts` is not edited.
- D15 Agents offered: all enabled agents, none pre-ticked, in the picker and on Configure run. Agent names are shown as stored (the mockups' "Security Reviewer" vs "Security" difference is mockup copy).
- D16 Estimate: per agent, the mean duration and mean cost of its most recent 10 `done` runs across the workspace (any PR). An agent with no such run, or no known cost, shows "unavailable" for that value. The PR-page dropdown shows time only (as M1); Configure run shows time and cost (as M3). Footer: time = max, cost = sum of known costs, marked incomplete when any is unknown.
- D17 The one-line description under each agent on Configure run (M3) is the agent's own stored description when it has one, and omitted otherwise. It is not a past review summary.
- D18 No cap on the number of agents beyond the enabled agents; the existing 10/min limit on `POST /pulls/:id/review` stays and a rejected start is reported to the user. No cost confirmation step; cost is visible via the estimate.
- D19 "Show only conflicts" OFF lists every grouped location flagged by at least one agent in the run (conflicts and agreements); ON lists only conflicts. The block is hidden when there is nothing to list.
- D20 A run is reachable by URL using its parent run id; the sidebar opens the latest (D7). No history list is required in this spec.
- D21 Results open in Columns mode by default; the mode is kept in the URL query (per client convention).
- D22 The existing merged/closed-PR warning of the dropdown carries over to the new picker.

## Acceptance criteria (EARS)

Agent picker (PR page, M1)
- AC-1: WHEN the user opens "Run Review" on the PR page, the system shall show a "PICK AGENTS TO RUN" panel with a per-agent checkbox, a per-agent estimated time, a "Clear" link, a "Run multi-agent review (N)" button and a "Configure agents..." link (M1), listing enabled agents (D15).
- AC-2: WHEN the user ticks or unticks an agent, the system shall update N in the button label to the number of ticked agents.
- AC-3: WHEN the user activates "Clear", the system shall untick every agent.
- AC-4: IF no agent is ticked, THEN the system shall disable the run button.
- AC-5: WHEN the user activates "Configure agents...", the system shall navigate to the Configure run screen.
- AC-5a: WHEN the PR is merged or closed, the system shall show the existing warning in the picker but still allow a run (D22).

Configure run screen (M2, M3)
- AC-6: The system shall provide a "Configure run" screen with step 1 "Pull request" (a selector) and step 2 "Agents to run" (M2, M3).
- AC-7: WHILE no pull request is selected, the system shall show the "Pick a pull request first" placeholder in place of the agent list and keep the run button disabled (M2).
- AC-8: WHEN a pull request is selected, the system shall list enabled agents with a checkbox, name, description (D17), estimated time and estimated cost, and a "Select all" link (M3); none shall be pre-ticked.
- AC-9: WHILE agents are ticked, the system shall show a footer estimate where time is the maximum of the ticked agents' estimated times and cost is the sum of their estimated costs, labelled "parallel fan-out" (M3: 8.2s = max of 8.2/7.4/6.9/7.1; $0.20 = sum of 0.06+0.05+0.04+0.05).
- AC-10: The system shall derive each agent's estimate as defined in D16.
- AC-11: IF an agent has no usable past runs, or its past runs have no known cost (`cost_usd` is nullable on `agent_runs`), THEN the system shall show that value as unavailable rather than as zero and mark the footer total incomplete.
- AC-12: WHEN the user activates "Run multi-agent review (N)", the system shall start one run per ticked agent in parallel for the selected pull request and navigate to the results page for the new parent run.

Run grouping (server)
- AC-13: WHEN a multi-agent review is started from the picker or Configure run, the system shall create one `multi_agent_runs` row (existing table: workspace, PR, `ran_at`) and associate every `agent_runs` row created for that review with it.
- AC-14: The system shall accept a list of agent ids in the body of `POST /pulls/:id/review` and shall return the parent run id together with the per-agent run ids (D2).
- AC-15: WHEN a multi-agent review is started, the system shall return the run ids before any LLM call, as required by R1 in `specs/review-flow.md`.
- AC-16: IF one agent's run fails, THEN the system shall keep the other agents' runs going and show the failed agent's column as failed with its error text (R3, R4).
- AC-17: WHEN a review is started with `agentId` or `all:true`, the system shall create no `multi_agent_runs` row and shall leave behaviour unchanged (D6).
- AC-17a: IF a submitted agent id list contains an unknown agent, is empty, or contains duplicates, THEN the system shall reject the request with a validation or not-found error and create no runs. [duplicates: de-duplicated is also acceptable; planner to pick one and document it]

Findings grouping
- AC-18: WHEN results are built, the system shall group findings from different agents whose normalized file paths are equal and whose inclusive line ranges overlap (D1).
- AC-19: The system shall retain every original finding row, with its producing agent, after grouping; grouping shall never delete or rewrite a finding.
- AC-20: WHEN a grouped item is shown, the system shall show which agents contributed to it.

Where agents disagree (M4, M5)
- AC-21: The system shall show a "Where agents disagree" block listing, per grouped code location (`file:line` and a title), each participating agent's take: its severity, or "did not flag" with the generalized reason line of D3 (M4, M5).
- AC-22: The system shall treat a location as a conflict when at least one agent flagged it and at least one other agent in the run that completed did not, or when agents assigned divergent severities (definition documented on the `Conflict` contract in `observability.ts`).
- AC-23: WHEN "Show only conflicts" is on, the system shall list only conflicts; WHEN it is off, the system shall list all grouped locations (D19).
- AC-24: The system shall derive the reason line without an additional LLM call (D3).
- AC-24a: IF an agent run failed or was cancelled, THEN the system shall not count that agent as "did not flag" and shall omit it from takes.

Results page (M4, M5)
- AC-25: The system shall show a results page per parent run with header (PR number and title, "N selected agents · parallel", neutral summary with total time and cost per D8/D10), a "Configure run" button, and a "Columns | Tabs" mode switch (M4, M5), defaulting to Columns (D21).
- AC-26: In Columns mode, the system shall show one column per agent with agent name, time, cost, score ring, finding cards (severity icon, title, `file:line`), a "View trace" link and a "N findings" count (M4).
- AC-27: WHILE an agent's run is queued or running, the system shall show that column's live status fed by the run event stream; WHEN the run ends, the system shall replace it with the result, or with the failure or cancelled state (D13).
- AC-28: In Tabs + detail mode, the system shall show one tab per agent with its score, a summary card (score, summary, "View trace", time, cost), and the agent's findings as collapsible rows with severity, title, category, `file:line` and confidence as a rounded percentage (M5, D12).
- AC-29: WHEN a finding row is expanded, the system shall show its rationale, its suggested fix only when the finding has one, and the actions Accept, Dismiss and Turn into eval case; the system shall not show Learn or Reply to author (D4).
- AC-30: WHEN the user chooses Accept or Dismiss on a finding that belongs to a group, the system shall record the action on every underlying original finding of that group (D5), using the existing finding actions.
- AC-31: WHEN the user chooses "Turn into eval case", the system shall create an eval case from that finding through the existing `POST /findings/:id/eval-case`.
- AC-32: WHEN the user chooses "View trace", the system shall open the existing `RunTraceDrawer` for that agent's run, and the live log shall use the existing `LiveLogStream`; neither shall be re-implemented.
- AC-33: The system shall display cost and time totals from the persisted runs; IF any run's cost is unknown, THEN the cost total shall be shown as incomplete rather than as a sum that silently omits it.
- AC-34: WHEN the user opens "Multi-Agent Review" in the sidebar, the system shall open the results of the latest multi-agent run if one exists, otherwise the Configure run screen (D7).
- AC-35: The system shall serve the results for a parent run by its id after a reload, with in-flight state taken from the server rather than from component state.

## Edge cases
- Zero agents exist or none are enabled: the picker and Configure run show an empty state (the current dropdown shows "No agents yet - create one").
- Only one agent ticked: runs as a multi-agent review of size 1 with a parent run; the disagreement block has no counterpart to disagree with and is hidden (D19).
- An agent run is cancelled: its column shows cancelled and it is not counted as "did not flag" (AC-24a).
- Reload or navigation while running: in-flight state is server-sourced and survives (AC-35).
- Re-running on the same PR creates a new parent run; older parent runs remain and are reachable by id (D20).
- Many findings per agent: no cap; columns scroll within the page.
- The 10/min rate limit on `POST /pulls/:id/review` rejects the start: the user is told, no partial runs are created (D18).
- Zero findings from all agents: columns show empty state with score; disagreement block hidden.
- Findings whose ranges chain (A overlaps B, B overlaps C, A does not overlap C): grouping is by overlap with the group; exact chaining behaviour is a planner decision and must be deterministic and documented.

## Non-functional requirements
- Accessibility: checkboxes, mode switch and toggle are keyboard operable and have accessible names. Severity is conveyed by text or icon, not colour alone.
- Observability: each agent's run keeps its own trace (R8); grouping and reason lines add no LLM calls.
- Strings go in a `client/messages/en/` namespace; UI imports from the `@devdigest/ui` barrel.
- Contract changes go in a new file in both vendored `@devdigest/shared` copies (server first, then mirror).
- Schema change for linking `agent_runs` to `multi_agent_runs` is a new generated migration; applied migrations are not edited.

## Inputs and provenance
- Agents, past runs (`agent_runs`: duration, cost, status, score), PRs: existing server data.
- Findings and verdict/score per agent: persisted reviews (`GET /pulls/:id/reviews`).
- The `multi_agent_runs` table exists in `server/src/db/schema/runs.ts` but `agent_runs` has no column linking to it; `MultiAgentRun`, `AgentColumn` and `Conflict` contracts exist in `observability.ts` but lack grouped findings, confidence, suggestion and action state, and their documented routes are not implemented. The new contract (D14) carries what is missing.
- Conflicts and groups are computed from persisted findings, not stored.

## Untrusted inputs
- Finding titles, rationales, suggestions are LLM output derived from untrusted PR content (P2/P3 in `specs/review-flow.md`); render as text/markdown with the same safety as the existing findings UI, never as HTML.
- File paths and line numbers are model output, grounded by the existing gate before persistence; grouping operates only on persisted, grounded findings.
- The agent id list in the request is client input and is validated server-side (AC-17a).

## Open questions
- none
