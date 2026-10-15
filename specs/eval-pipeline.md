# Spec: Eval Pipeline (regression protection for the review agent) — L06
Spec ID: SPEC-04
Status: approved (all open questions resolved; see "Resolved decisions")
Supersedes: none
Design sources: six PNG mockups read this run (`1.png` PR page with the "Turn into eval case" button; `2.png` Eval Dashboard, all agents; `3.png` Eval Dashboard, one agent; `4.png` "Compare runs · v6 → v7" modal; `5.png` AgentEditor > Evals tab; `6.png` Eval case editor modal), plus the repo code/docs listed under "Grounding in the repo". Only what is visible in those images is treated as UI requirement; everything else they imply is in "Out of scope" or "Resolved decisions".

> Filename note: filed as `specs/eval-pipeline.md` as requested by the course deliverable checklist. It carries a `SPEC-04` ID (next free ID after SPEC-01..03) so it stays in the global numbering; it is a requirements spec, not one of `doc-writer`'s post-implementation invariant docs.
> Not to be confused with the top-level `evals/` package (`@devdigest/evals`): that is the Claude-Code *harness* eval suite (skills/subagents/workflow). This spec is the *product* feature that evaluates the DevDigest review agent.

## Problem statement and user
A DevDigest user who edits an agent's system prompt, model or attached skills has no way to tell whether the agent got better or worse. The user's own accept/dismiss decisions on findings (L01–L05) are a ready-made labelled dataset: an accepted finding is something the agent *must find*; a dismissed finding is something it *must not flag*. This feature turns those decisions into frozen eval cases stored in Postgres, runs the agent over them, scores the result **in code with no LLM call** (recall / precision / citation_accuracy), keeps run history, and compares two runs side by side ("old prompt vs new prompt").

User: the prompt/skill author who owns reviewer agents in the studio.

## Goals / Non-goals
**Goals:**
- One-click creation of an eval case from a decided finding (accepted -> `must_find`, dismissed -> `must_not_flag`).
- Per-agent eval set (>= 8 cases available out of the box), list/edit/delete cases.
- Run an agent on all its cases against frozen inputs; persist per-case results and a per-run aggregate.
- Deterministic, LLM-free scoring with precisely defined metrics.
- Run history, a dashboard of latest runs, and a two-run comparison with metric deltas and system-prompt diff.
- Make "prompt change visibly moves the metrics" and "deliberately broken prompt drops precision" demonstrable and testable.
- A `pnpm verify:l06` gate.

**Non-goals (see also Out of scope):**
- LLM-as-judge scoring or any model call inside scoring.
- Variance reduction (repeated runs, temperature control, confidence intervals).
- Skill-owned eval sets (`owner_kind: 'skill'` exists in the schema; this lesson uses `'agent'` only).
- CI export / CI runs / Stats tab (other lessons).

## Grounding in the repo (verified this run)
- **Tables exist (scaffolding, unused):** `eval_cases` (`workspace_id`, `owner_kind` skill|agent, `owner_id`, `name`, `input_diff` text, `input_files` jsonb, `input_meta` jsonb, `expected_output` jsonb, `notes`) and `eval_runs` (`case_id` FK cascade, `ran_at`, `actual_output` jsonb, `pass`, `recall`, `precision`, `citation_accuracy`, `duration_ms`, `cost_usd`) in `server/src/db/schema/eval.ts`. Gaps: no run-batch grouping, no agent version on a run, no created-at / source-finding link on a case.
- **Contracts exist in `@devdigest/shared`:** `EvalPerTrace`, `EvalRun` (aggregate: recall/precision/citation_accuracy in [0,1], `traces_passed`, `traces_total`, `duration_ms`, `cost_usd`, `per_trace`), `EvalOwnerKind`, `EvalCase` in `contracts/knowledge.ts`; `EvalCaseInput`, `EvalRunRecord`, `EvalRunResult`, `EvalTrendPoint`, `EvalDashboard` (cases_total, current, delta, trend, recent_runs, `alert`) in `contracts/eval-ci.ts`. The eval-related definitions in the server and client copies read identical; the copies **have drifted elsewhere** in `eval-ci.ts` (server has `AgentManifest`, `Provider`/`CiFailOn` imports and `openrouter` in `ConformanceInput`; client lacks them). I could not byte-diff (no shell) — parity of the eval part must be checked, not assumed.
- **i18n namespace exists:** `client/messages/en/eval.json` with `dashboard`, `caseEditor` (tabs: diff, prMeta — **no "Files" tab**), `evalsTab`, `page` keys.
- **Sidebar:** `NAV` in `client/src/vendor/ui/nav.ts` has SKILLS LAB = Agents, Skills, Conventions (no Eval Dashboard yet); `activeKeyFor` in the app shell already maps any pathname starting `/eval` to nav key `eval`.
- **AgentEditor** has Config / Skills / Context tabs; its own header comment says Evals/Stats/CI come in later lessons. Client INSIGHTS: a new tab must be added to **both** the tab list and the `?tab=` allowlist in `useAgentTab`, or it silently never renders.
- **Review execution:** `reviewPullRequest` (reviewer-core) = assemble -> LLM -> reduce -> **grounding gate** -> score; returns `ReviewOutcome` with `review.findings` (survivors), `dropped` (with reasons), `costUsd`, token counts. The server's run executor adds repo-intel digests, skills, project context and PR intent around it.
- **Grounding gate** (`reviewer-core/src/grounding.ts`): a finding survives iff its file is in the diff and `[start_line,end_line]` intersects a hunk's new-side line set; full-file kinds (`secret_leak`, `lethal_trifecta`, `phantom`, `hook`) only need the file present. Invariants G1–G3 in `specs/review-flow.md`.
- **Finding accept/dismiss:** `POST /findings/:id/(accept|dismiss)`; findings carry `accepted_at` / `dismissed_at`; `FindingCard` renders Accept / Dismiss (+ learn/reply kinds exist in `FindingActionKind`).
- **Agent versions:** `agents.version` is bumped on any config-affecting change and each version is snapshotted immutably in `agent_versions.config_json` (provider, model, `system_prompt`, strategy, ci_fail_on, repo_intel, skill ids); `GET /agents/:id/versions` and `/versions/:version` exist. Run traces already record `config.version`. So "vN" in the mockups is **real and already stored per agent**; but a version does not capture skill *body* edits (skills version separately) and there is no "promote" concept.
- **Seed:** demo repo `acme/payments-api`, PR #482, two seeded findings (`src/config.ts:12` CRITICAL security "Hardcoded Stripe secret key in commit"; `src/api/users.ts:45-52` WARNING perf), five agents incl. **Security Reviewer**. Per server INSIGHTS the seeded PR files have no stored patches and the seed has no `agent_runs`, so **no real diff exists in the seed to freeze**.
- **`verify:l06` does not exist** in any `package.json` (root has none; client/server/evals checked) nor in `scripts/` (`dev.sh`, `e2e.sh` only). `server/package.json` is `skip-worktree` (TESTING.md), so a script added there would not be committed.

## User stories
- As a prompt author, I click "Turn into eval case" on a finding I already accepted/dismissed so that the agent is regression-tested on exactly that decision.
- As a prompt author, I change the system prompt, click "Run all evals", and see whether recall/precision moved.
- As a prompt author, I pick two runs and see metric deltas next to the prompt diff to decide which prompt is better.

## Acceptance criteria (EARS)

### Cases
- AC-1: WHEN the user clicks "Turn into eval case" on an **accepted** finding, the system shall create an eval case owned by the agent that produced the finding, containing the frozen diff fragment for the finding's file and one expectation `must_find` at the finding's `file` and `start_line..end_line`.
- AC-2: WHEN the user clicks "Turn into eval case" on a **dismissed** finding, the system shall create an eval case owned by the producing agent, with the frozen diff fragment and one expectation `must_not_flag` at the finding's `file` and `start_line..end_line`.
- AC-3: The system shall create the case from a finding in a single user action (one click, no intermediate form), then confirm with a toast that links to the agent's Evals tab.
- AC-4: IF the finding is neither accepted nor dismissed (or its review has no producing agent), THEN the system shall not create a case and shall return a 409 with a message stating which precondition failed.
- AC-5: IF a case already exists for the same source finding, THEN the system shall not create a duplicate and shall return the existing case.
- AC-6: The system shall store, with each case created from a finding, a reference to the source finding/PR and the decision it was born from, so the case remains traceable.
- AC-7: WHEN the user lists an agent's eval cases, the system shall return all cases owned by that agent with name, expectation summary (item count, severity·category when present, or "empty []"), and last-run status (passed / failed / never run).
- AC-8: The system shall allow create, edit and delete of eval cases by the user (name, diff, PR meta, expected output); IF `expected_output` does not validate against the expectation schema, THEN the system shall reject the request with 422 before persisting.
- AC-9: The system shall ship an agent eval set of at least 8 cases after `pnpm db:seed` (see "Seeding story"), containing at least one `must_find`, at least one `must_not_flag` and at least one empty-expectation case.

### Run
- AC-10: WHEN `POST /agents/:id/eval-runs` is called, the system shall create the run record and return its id **before** any LLM call, executing the cases in the background (same lifecycle idea as R1).
- AC-11: WHEN an eval run executes, the system shall run the agent's **current** config (provider, model, system prompt, strategy, enabled linked skills) on each case's **frozen** input only, through `reviewPullRequest`, and shall record the agent `version` the run used.
- AC-12: The system shall not feed live, mutable context (repo-intel digests, project-context documents, derived PR intent, the live PR body) into an eval run; the case's stored diff and stored PR meta are the only task inputs. The agent's enabled linked skills are the only non-frozen input that is allowed (D7).
- AC-13: WHEN an eval run executes, the system shall persist per case: `actual_output` (kept findings and dropped findings with reasons), `pass`, `recall`, `precision`, `citation_accuracy`, `duration_ms`, `cost_usd`; and shall persist one run aggregate matching the `EvalRun` contract (including `per_trace` with expected vs actual).
- AC-14: IF one case's execution throws (provider error, missing key, schema failure), THEN the system shall record that case as errored (error text in `actual_output`), continue with the remaining cases, and exclude the errored case from metric denominators while reporting the errored count.
- AC-15: IF the agent's provider key is missing, THEN the system shall fail the run with the same user-visible error semantics as a review run (K3: the app still boots; only the run fails).
- AC-16: IF an agent has zero eval cases, THEN `POST /agents/:id/eval-runs` shall return 422 and create no run.
- AC-17: WHEN the body of `POST /agents/:id/eval-runs` carries an explicit `case_ids` subset, the system shall run only those cases (used by the per-row "run" and "Run case" actions) and label the run as partial so it is not mixed into full-set trend/compare by default.
- AC-18: IF a run is already in progress for the same agent, THEN the system shall reject a second start with 409 (one active eval run per agent).

### Scoring (definitions in "Scoring algorithm")
- AC-19: The system shall compute recall, precision, citation_accuracy and pass entirely in deterministic code that has no LLM provider in its signature; a test shall prove zero LLM calls occur during scoring.
- AC-20: WHEN scoring a case, the system shall treat a produced finding as matching an expectation iff the normalized file paths are equal and the inclusive line ranges overlap.
- AC-21: The system shall compute recall and precision from the findings that **survived** the grounding gate, and citation_accuracy from survivors vs. all candidates the gate saw, using the engine's own gate result (never a second re-implementation).
- AC-22: IF a metric's denominator is zero for a case, THEN the system shall store `null` for that case metric and exclude it from the aggregate; IF it is zero for the whole run, THEN the aggregate shall use the documented vacuous value and `per_trace` shall make "not applicable" distinguishable.
- AC-23: Scoring the same stored outputs twice shall produce identical numbers (pure function of expectation + findings + dropped count).

### UI
- AC-24: The `FindingCard` shall show a "Turn into eval case" action next to Accept / Dismiss / Learn / Reply (per mockup 1); WHILE the finding is undecided the action shall be disabled with an explanatory tooltip. (D3)
- AC-25: The AgentEditor shall have an "Evals" tab (reachable via `?tab=evals`) showing four metric tiles (recall, precision, citation accuracy, traces passed N/M) with deltas vs the previous run, a "View full dashboard" link, an "Eval cases  N/M passing" list, "Run all evals" and "New eval case" (per mockup 5).
- AC-26: Each case row shall show a pass/fail/never-run indicator, name, "expected N finding(s), got M" (or "never run"), a severity·category chip or `empty []`, and run / edit / delete controls (mockup 5).
- AC-27: WHEN the user opens the case editor, the system shall show Name, Input tabs **Diff** and **PR meta**, an Expected-output JSON editor with a valid/invalid-JSON badge and a "Finding skeleton" button, the last-run status line, and Cancel / Run case / Save (mockup 6).
- AC-28: WHILE the Expected-output JSON is invalid, the system shall show the invalid badge and disable Save and Run case.
- AC-29: The left sidebar shall list "Eval Dashboard" under SKILLS LAB after Conventions, route it under `/eval`, and highlight it on any `/eval*` path.
- AC-30: The Eval Dashboard page shall list one card per agent that owns eval cases (name, model chip, last run version/date, pass x/y, metric sparkline, RECALL/PREC/CITE) and a "RECENT EVAL RUNS · ALL AGENTS" table (agent, date, version, recall/precision/cite bars, pass x/y), ordered newest first (mockup 2); WHILE no runs exist it shall show the existing `dashboard.noRuns` empty state.
- AC-31: The per-agent dashboard shall show three metric tiles with deltas and sparklines, a METRIC TREND chart (recall, precision, citation over runs), and a RECENT RUNS table (ran at, version, recall, precision, citation, pass, cost) with a checkbox per row (mockup 3).
- AC-32: WHILE exactly two runs are selected, the "Compare" button shall be enabled; otherwise disabled.
- AC-33: WHEN the user compares two runs, the system shall order them old -> new by `ran_at` (not by click order) and show a modal with recall, precision, citation and cost, each as `old -> new` with a signed delta (percentage points for rates, USD for cost), and a SYSTEM PROMPT DIFF between the two runs' agent-version snapshots (mockup 4).
- AC-34: IF the two compared runs used the same agent version, THEN the modal shall state "no prompt change" instead of an empty diff; IF the runs covered different case sets, THEN it shall warn that the deltas are not like-for-like.
- AC-35: WHILE an eval run is in progress, the UI shall show "Running…" on the triggering control and the in-progress state shall be server-sourced so it survives reload (client convention for runs).
- AC-36: IF the latest full run regresses any metric versus the previous full run by 0.02 or more (2 percentage points), THEN the dashboard shall populate `EvalDashboard.alert` and show a warning banner naming the metric, the size of the drop and the run version (mockup 3). (D8)

### Contracts, data, process
- AC-37: The system shall add any new contract (expectation item, run batch, turn-into-case request, compare response) in **new** `@devdigest/shared` files in **both** vendored copies, leaving existing contract files untouched, and shall keep the eval-related definitions of the two copies identical.
- AC-38: The system shall add any schema change (run grouping, agent version on a run, source link) through a new migration generated by `pnpm db:generate`, never by editing an applied migration or `meta/_journal.json`.
- AC-39: The system shall expose no secret from `SecretsProvider`/env through any eval endpoint or stored `actual_output`.
- AC-40: WHEN `pnpm verify:l06` runs, it shall exit 0 only if every check in "The `verify:l06` gate" passes, and non-zero on the first failure.

## Data model & contract usage
Reuse, do not redesign:
- **Case** = one `eval_cases` row, `owner_kind='agent'`, `owner_id=<agent id>`. `input_diff` = frozen unified-diff fragment; `input_meta` = frozen PR meta (`title`, `body`) plus provenance (`source_finding_id`, `source_pr_id`, `decision`: accepted|dismissed, or `origin: 'seed'`); `input_files` unused this lesson (null); `expected_output` = the expectation array; `notes` free text. API shape: `EvalCase` / `EvalCaseInput`.
- **Expectation schema** (new contract; stored in `expected_output`): an array of items `{ kind: 'must_find' | 'must_not_flag', file, start_line, end_line?, severity?, category?, title? }`. `end_line` defaults to `start_line`. `severity`/`category`/`title` are descriptive (used by the list chip and the editor skeleton) and are **not** part of matching. An empty array means "no findings expected" (mockup 5 `empty []`). Mockup 6 shows the array form with `severity`, `category`, `title`, `file`, `start_line`. (D2)
- **Per-case run result** = one `eval_runs` row (`EvalRunRecord`).
- **Run (batch) aggregate**: `eval_runs` has no grouping and no version. A run must be groupable and carry `agent_id`, `agent_version`, started/finished time, partial flag, status (running|done|failed), the `EvalRun` aggregate and total cost. Decided: a new batch table plus a nullable batch reference on `eval_runs`, both generated via `pnpm db:generate` (D1).
- **Dashboard** = `EvalDashboard` (owner agent, or `owner_*` null for workspace-wide), `EvalTrendPoint`, `EvalRunRecord`.
- **Version/prompt source for compare** = `agent_versions.config_json.system_prompt` of the two versions (existing `GET /agents/:id/versions/:version`).

## API
All routes are workspace-scoped, Zod-validated before the handler (422 on invalid input), errors in the standard envelope.
| Route | Purpose |
|---|---|
| `POST /agents/:id/eval-runs` | Start a run on all the agent's cases (optional `case_ids`). Returns run id + status immediately (async). |
| `GET /agents/:id/eval-runs` | Run history for the agent, newest first (aggregate per run). |
| `GET /eval-runs/:id` | One run: aggregate + per-case results (`per_trace`, per-case `EvalRunRecord`). |
| `GET /agents/:id/eval-cases` / `POST /agents/:id/eval-cases` | List / create (manual, `EvalCaseInput`). |
| `GET|PUT|DELETE /eval-cases/:id` | Read / edit / delete one case. |
| `POST /findings/:id/eval-case` | Turn a decided finding into a case (AC-1..6). |
| `GET /agents/:id/eval-dashboard` and `GET /eval-dashboard` | `EvalDashboard` for one agent / workspace-wide (cards + recent runs). |
Compare needs no dedicated endpoint: the client fetches two runs (`GET /eval-runs/:id`) and the two version snapshots; a server compare endpoint is optional. Route names are proposals (the plan may adjust) except `POST /agents/:id/eval-runs`, which is required by the course.

## Scoring algorithm
Inputs per case: expectation items `E = E_find ∪ E_not` (by `kind`); `K` = findings that survived the grounding gate; `D` = candidates dropped by the gate (`ReviewOutcome.dropped`).
- **Path normalization:** strip a leading `a/`, `b/` or `./`; compare as exact, case-sensitive strings. Lines are new-side line numbers (the same space the grounding gate uses).
- **Range normalization:** a range is `[min(start,end), max(start,end)]`; an item with no `end_line` is `[start,start]`.
- **Match:** finding `f` matches item `i` iff `file(f) = file(i)` and the inclusive ranges overlap: `max(lo_f, lo_i) <= min(hi_f, hi_i)`. Severity, category and title are ignored.
- **found** = number of items in `E_find` matched by at least one finding in `K` (an item counts once however many findings hit it).
- **noise** = number of findings in `K` that match at least one item in `E_not`.
- **recall (case)** = `found / |E_find|`; `null` if `|E_find| = 0`.
- **precision (case)** = `(|K| − noise) / |K|`; `null` if `|K| = 0`. A finding matching no item at all is **not** noise (it is "unexpected", not "known-bad"); only `must_not_flag` hits are penalized. (D5)
- **citation_accuracy (case)** = `|K| / (|K| + |D|)`; `null` if `|K|+|D| = 0`. "Survived the grounding gate" is read straight from the engine result.
- **pass (case)** = `found = |E_find|` AND `noise = 0` AND (if `E` is empty: `|K| = 0`).
- **Aggregate (run)**, micro-averaged over non-errored cases: `recall = Σfound / Σ|E_find|`; `precision = Σ(|K|−noise) / Σ|K|`; `citation_accuracy = Σ|K| / Σ(|K|+|D|)`; `traces_passed` = passing cases; `traces_total` = non-errored cases; `cost_usd` = sum of case costs, `null` if any case cost is `null` (unpriced model, per the engine's costUsd rule); `duration_ms` = wall time. If a run-level denominator is 0, the `EvalRun` contract (non-null number in [0,1]) is filled with `1` (vacuously true) and the UI renders "n/a" using `per_trace`/null case values. (D5)
- **Why survivors only:** a finding dropped by the gate is never shown to the user, so it can neither satisfy recall nor count as noise; it only lowers citation_accuracy.
- **No LLM:** the scoring function takes plain data (expectation items, findings, dropped count) — no provider, no I/O.

## Determinism / frozen inputs
- A case freezes everything that varies between PR revisions: diff fragment and PR meta are copied into the case at creation; later PR pushes, force-pushes or deleted clones never change it.
- Run-to-run differences must come only from the agent **config** (prompt, model, strategy, skills) — hence AC-11/AC-12 and recording `agent_version` per run.
- Editing a case changes its meaning: each per-case result stores the expectation it was scored against (`EvalPerTrace.expected`/`actual`) so history stays self-explanatory; compare warns on differing case sets (AC-34). Deleting a case cascades its `eval_runs` rows (existing FK) — confirm with the user in the UI before delete.
- Attached **skill body** edits do not bump the agent version; the run records which skills were attached, but a compare between two runs of the same version will show "no prompt change" even if a skill body changed. Documented, accepted limitation (D7).
- The model itself is non-deterministic; runs are comparable by input, not bit-reproducible. Deltas smaller than run-to-run noise are not claims. Reducing variance is a non-goal.

## UI (what is in scope, per mockups)
- **FindingCard (mockup 1):** "Turn into eval case" button after Learn, before Reply to author; calls the turn-into-case endpoint; success toast with link to the Evals tab.
- **Evals tab (mockup 5):** as AC-25/26. Not in scope: the Stats and CI tabs visible in the mockup's tab bar.
- **Case editor (mockup 6):** modal as AC-27/28. "Finding skeleton" inserts an expectation item template.
- **Eval Dashboard (mockups 2, 3):** all-agents page and per-agent page with breadcrumb Skills Lab > Eval Dashboard > <Agent>, "All agents" back link, agent switcher, "Run eval" for the current agent.
- **Compare (mockup 4):** modal as AC-33/34; Close only (see Out of scope for "Promote").
- Use existing i18n namespace `eval` (add keys, do not restructure); UI primitives only through the `@devdigest/ui` barrel; the `Eval Dashboard` nav item is added to the `NAV` data registry (precedent: Agents/Skills/Conventions). Server state in TanStack Query; tab state in `?tab=`.

## Seeding story (>= 8 cases)
- The seeded demo repo has no stored patches and only two seeded findings, so cases cannot be derived from seed data automatically. The seed therefore ships a **curated, hand-authored, idempotent set of >= 8 cases for the seeded Security Reviewer agent**, each with a small synthetic unified diff, marked `origin: 'seed'` in `input_meta`.
- Mix (minimum): >= 3 `must_find` (e.g. the Stripe-key leak at `src/config.ts:12` matching the seeded finding, an SSRF-shaped webhook forwarder, a service-role key in client code), >= 3 `must_not_flag` (benign code that a naive prompt over-flags), >= 1 empty-expectation clean refactor, remainder mixed. Names in mockup 5 (`stripe-key-leak`, `ssrf-webhook`, `missing-retry-after`, `clean-refactor-no-flags`, `service-role-in-client`) are examples, not a mandated list.
- Secret-looking strings in seed diffs must be obviously fake (mockup 6 shows a realistic-looking `sk_live_…` key; do not copy it).
- Re-running the seed must not duplicate cases (match on owner + name).
- Cases created through the UI from real decisions are additive to the seeded set. Only the Security Reviewer is seeded; the seed is authored in the seed path and is idempotent by owner + name (D6).

## Experiment / sensitivity scenario (non-code deliverable + testable core)
1. Run all evals on the Security Reviewer (baseline, version vN). Record metrics.
2. Edit the system prompt meaningfully (version bumps to vN+1), run again: at least one of recall/precision must visibly differ; open Compare (vN -> vN+1) and capture the screenshot with the prompt diff.
3. Deliberately break the prompt (e.g. "report every changed line as CRITICAL, regardless of context"), run again: **precision must drop** versus the baseline because the agent now trips `must_not_flag` cases (sensitivity test). A second variant ("never report secrets") must drop **recall**.
4. The live version of this needs a real model key and is manual. The **hermetic** equivalent — in `verify:l06` — drives the same pipeline with scripted mock LLM outputs standing for "good", "changed" and "broken" prompts (the mock layer already exists: `MockLLMProvider` in `server/src/adapters/mocks.ts`) and asserts the metric movement deterministically.

## Edge cases
- Zero cases / zero findings / zero expectations: see AC-16, AC-22 and the pass rule (empty expectation passes only with zero survivors).
- A finding that hits both a `must_find` and a `must_not_flag` item (contradictory case): counts as found **and** as noise; the editor should warn on overlapping contradictory items.
- Several findings overlapping one `must_find` item: recall counts it once; all of them count in the precision denominator.
- Dropped-by-gate finding that would have matched a `must_find` item: does not count as found.
- A frozen diff that no longer parses, or an expectation pointing at a file not in the case diff: reject at save (422) / flag in the editor; a case that can never be satisfied must not be silent.
- Finding whose diff fragment cannot be obtained (clone missing, no patch stored): the turn-into-case request fails with a clear error; no half-built case is persisted.
- Large diffs: a frozen fragment is capped to the finding's file (and context hunks), not the whole PR; map-reduce vs single-pass follows the agent's strategy.
- Concurrent starts: AC-18. Process restart during a run: the run is reaped as failed on boot like `agent_runs` (R6) and partial case rows are kept.
- Agent deleted: its cases and runs cascade with it (confirm UI wording); agent disabled: eval can still run (explicit user action).
- Unpriced model: cost `null`, shown as "—", not `$0` (matches the existing run-cost convention).
- Compare with a selected run that has been deleted in the meantime: 404 -> modal error state.
- Compare of 3+ selections: the third click replaces the oldest selection (recommended default).

## Non-functional requirements
- **Performance:** run start returns in well under a second; execution is backgrounded on the existing job/run mechanism, never inside the request handler. Case execution may be sequential; bounded concurrency is allowed.
- **Cost control:** an eval run costs one LLM review per case; show the run's total cost and (before start) the case count so the user sees what "Run all evals" will spend.
- **Observability:** each run records per-case duration/cost and the agent version; failures keep their error text so they survive reload (R3 analogue).
- **Security:** see Untrusted inputs; no keys in DB (K1).
- **Accessibility:** icon-only run/edit/delete controls have accessible names; pass/fail is not conveyed by color alone (icon + text).
- **i18n:** all user-visible strings in `messages/en/eval.json`.

## Inputs and provenance
- Diff fragment: for case-from-finding, the stored/loaded PR diff for the finding's file at the time of the click (via the same diff loader reviews use); for manual and seeded cases, user/author text.
- Expectation: derived from the finding's decision and location (AC-1/2) or typed by the user.
- Agent config: read at run start from the agent row; the version used is stored with the run.
- Metrics: computed only from the stored case + the engine's `ReviewOutcome`; never from any model's self-report (consistent with S1).

## Untrusted inputs
- Case diff text and PR meta (title/body): user- or PR-author-controlled; must reach the model only through the engine's existing delimiter wrapping (P1–P3); never interpolated into the system prompt.
- `expected_output` JSON: user-typed; validated by Zod server-side (client "valid JSON" badge is UX only); file paths are used only for string comparison, never for filesystem access.
- System-prompt diff in Compare: render as plain text (no HTML/markdown interpretation).
- Stored diffs may contain real secrets copied from a PR; they sit in Postgres like existing PR patches do; no redaction is applied to user-created cases (D9).

## Testing expectations
- **reviewer-core (hermetic, no I/O):** pure scoring unit tests — file match (incl. `a/`/`b/` prefix), range overlap boundaries (touching ends, reversed ranges, single-line), recall/precision/citation per case and aggregate, every zero-denominator path, empty-expectation pass rule, contradictory items, duplicate hits; a test that scoring accepts no LLM and a call-counting mock LLM sees zero calls.
- **server unit (hermetic, `*.test.ts`):** contract tests for the new `@devdigest/shared` schemas (add beside the existing `EvalRun` assertion in `server/test/contracts.test.ts`); route validation (422 cases, 409 undecided finding, 422 zero cases); seed-set shape (>= 8, kind mix) without a DB where possible.
- **server integration (`*.it.test.ts`, Docker/testcontainers, injected mock LLM with `secrets: new MockSecretsProvider({})` per the existing it-test convention):** create case from accepted and from dismissed finding; idempotent re-create; run on all cases persists batch + per-case rows + aggregate; version recorded; history listing; get run; dashboard shape (delta, trend, alert); "good vs broken prompt" scripted-LLM experiment shows precision drop and recall change; seed produces >= 8 cases and is idempotent.
- **client (vitest + jsdom, fetch mocked):** `FindingCard` button enabled/disabled by decision and calling the endpoint; Evals tab list/tiles/states (loading, empty, never-run, running); case editor JSON validity gating; dashboard cards/table; Compare enable-on-exactly-two and modal deltas/diff; nav item + `activeKeyFor('/eval…')`; `?tab=evals` reachable.
- **e2e (optional, non-gating):** a deterministic flow over seeded cases (list + dashboard render) — no LLM in the loop, per repo e2e rules. Flows `02/04/05` assumptions about the seeded demo repo being the only repo still apply.

## The `verify:l06` gate
Acceptance gate: **`pnpm verify:l06` exits 0.** Findings: no such script exists today. It must be created by the implementing plan (not by this spec). Because the repo is not a monorepo (no root `package.json`) and `server/package.json` is `skip-worktree`, its home is a new minimal root `package.json` (scripts only, no dependencies, no workspace, no lockfile) whose `verify:l06` script delegates to a cross-platform Node script that runs the checks below in order and stops on the first failure (D4). It must run offline with **no API keys and no network LLM**, and must cover, in order:
1. Typecheck: `server`, `client`, `reviewer-core`.
2. `reviewer-core` tests (scoring unit tests + zero-LLM proof).
3. `server` unit lane (`vitest run --exclude '**/*.it.test.ts'`): contracts, route validation, seed shape.
4. `server` integration lane (`vitest run .it.test`, needs Docker): case-from-finding (both kinds), run/persist/history/dashboard, scripted good-vs-broken-prompt experiment, seed >= 8 and idempotent.
5. `client` tests (+ lint, optionally): FindingCard, Evals tab, dashboard, compare, nav.
6. Vendored-contract parity: the eval-related contract files are identical (CRLF-normalized) in `server/src/vendor/shared` and `client/src/vendor/shared`.
7. Migration hygiene: schema and migrations are in sync (`pnpm db:generate` yields no new diff) and no pre-existing migration/journal entry was modified.
8. Cheap structural assertions: this spec file exists; `eval` nav entry present.
It must not run the top-level `evals/` harness suite (that needs a Claude subscription / proxy) and must not call any real model.

## Out of scope (mockup-implied, not in the course requirements)
Each is deferred; recommended default in parentheses.
- **"Promote vN"** button/endpoint and any prompt-promotion/rollback flow (omit the button; Compare modal has Close only).
- **"Run all agents"** on the all-agents dashboard (omit; per-agent run only).
- **"Run on save"** toggle in the case editor (omit; Save and Run case are separate).
- **"Files" input tab** (omit: engine consumes diff + PR meta only; `eval.json` also lacks it).
- **30-day range selector** (omit; show most recent N runs).
- **Sidebar items** Memory, Multi-Agent Review, Agent Performance, CI Runs; Agents-list stats (142 runs / 78% accept); Stats and CI tabs.
- **Skill-owned eval sets.**
- **Provider-specific "gpt-4.1" model chips** from the mockups: render the agent's real `model`.

## Non-code deliverables (outside code scope; listed only)
- `specs/eval-pipeline.md` (this file).
- Screenshot comparing two runs with different system prompts (the Compare modal).
- Screencast video of the end-to-end scenario (finding -> case -> run -> compare -> deliberate break).
- Green `pnpm verify:l06` output.

## Open questions
None. All nine questions raised in the draft were answered by the requester (all recommended defaults approved) and are recorded below as resolved decisions D1-D9.

## Resolved decisions
- **D1 Run grouping and versioning.** A new batch table (agent_id, agent_version, status, partial flag, `EvalRun` aggregate, total cost, timestamps) plus a nullable batch reference on `eval_runs`, both via `pnpm db:generate`. Rationale: `eval_runs` is per case and has no batch or version; additive columns/tables keep applied migrations untouched (AC-38) and make history/compare queries simple.
- **D2 Expectation encoding.** `expected_output` is an array of `{kind, file, start_line, end_line?, severity?, category?, title?}` items; an empty array means "expect no findings" and passes only with zero surviving findings. Rationale: matches the array form visible in mockup 6 and `empty []` in mockup 5, and needs no schema change to the jsonb column.
- **D3 Undecided findings.** The "Turn into eval case" button is visible but disabled (with tooltip) until the finding is accepted or dismissed; the server also rejects with 409 (AC-4). Rationale: the course derives the expectation type from the decision, so an undecided finding has no defined expectation.
- **D4 Home of `verify:l06`.** A new minimal root `package.json` (scripts only, no dependencies, no workspace) delegating to a cross-platform Node script that runs the gate checks in order. Not `server/package.json`. Rationale: there is no root package.json today, the repo is deliberately not a monorepo, `server/package.json` is `skip-worktree` so a script there would not be committed, and Windows needs a non-shell script.
- **D5 Precision and zero-denominator conventions.** Findings matching no expectation are NOT noise (only `must_not_flag` hits are); per-case metrics are `null` when undefined and excluded from aggregates; run-level undefined values fill the non-null `EvalRun` contract with 1 and the UI shows "n/a". Rationale: matches the course definition (noise = must_not_flag/dismissed), avoids penalizing legitimate new findings, and fits the existing non-null `EvalRun` contract.
- **D6 Seeded set.** Security Reviewer only, at least 8 hand-authored cases with synthetic diffs, authored in the seed path, idempotent by owner + name, `origin: 'seed'`. Rationale: the seeded PR has no stored patches, so nothing real can be frozen; Security Reviewer is the agent in all mockups.
- **D7 Run context.** Frozen diff + frozen PR meta + the agent's enabled linked skills only; repo-intel digests, project-context documents and derived intent are excluded; skill-body edits are not captured by the agent version (accepted limitation). Rationale: those exclusions vary with clone/index state and would break comparability, while skills must stay in because the course requires a skill change to move the metrics.
- **D8 Regression banner.** `EvalDashboard.alert` is set when any metric of the latest full run is 0.02 or more below the previous full run (AC-36). Rationale: mirrors the 2-point example in mockup 3 and uses the existing `alert` field of the contract.
- **D9 Secrets in stored diffs.** No redaction for user-created cases; seed data uses obviously fake keys only. Rationale: the same exposure already exists for stored PR patches, and redaction would alter the frozen input the agent is evaluated on.
