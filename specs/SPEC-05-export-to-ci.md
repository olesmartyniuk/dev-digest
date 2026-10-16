# Spec: Export to CI (agent as a versioned manifest, run through GitHub Actions)
Spec ID: SPEC-05
Status: draft (open questions resolved; see "Resolved decisions")
Supersedes: none
Design sources: five PNG mockups read this run (1 Export Wizard step 1 Target; 2 Agent page CI tab; 3 step 2 Preview; 4 step 3 Configure; 5 step 4 Install), plus the repo files named under "Grounding in the repo". Only what is visible in those images or stated in the request is treated as UI requirement; the CI Runs page has no mockup and is specified textually.

> Placement: filed at the root `specs/` because the feature spans `server` (module, routes, result collection), `client` (wizard, CI tab, CI Runs page), the vendored `@devdigest/shared` contracts (both copies) and a new bundled agent-runner, by design. Scope fence from the request ("worktree B"): changes the `ci/` module, its routes, the CI Runs page and the agent's CI tab. It does NOT touch the multi-run service or the PR feed.

## Problem statement and user
An agent tuned on one developer's machine cannot be relied on for every PR. Export to CI moves the agent's configuration (model, system prompt, attached skills, parameters) into the repository as a versioned manifest and runs the review in GitHub Actions on every PR, then shows those runs back in the studio. User: the agent/prompt author who owns reviewer agents and a team that wants the same review on every PR.

## Goals / Non-goals
**Goals:**
- Serialize an agent to `.devdigest/agents/<slug>.yaml`, validated by the SAME Zod schema in the studio and in the agent-runner.
- A four-step Export Wizard (Target -> Preview -> Configure -> Install) that opens a PR on a dedicated `devdigest/ci` branch, or offers a zip download.
- A bundled agent-runner invoked by the generated workflow.
- CI results collected through one verified channel and stored in `agent_runs` with `source='ci'`.
- A global CI Runs page and a per-agent CI tab (installations, workflow version, history, "Fail CI on").
- A trace that records manifest version, model, dependencies and commit SHA.

**Non-goals / Out of scope (explicit cuts):**
- Byte-identical review output. Identical manifest guarantees identical configuration only; model variance and CI tool versions can change output.
- CircleCI, Jenkins and Generic CLI generators (cards shown disabled only).
- Publishing a real `devdigest/review-action@v1` action.
- A GitHub App; an inbound ingest HTTP endpoint on the studio; real-time (push) delivery of CI results.
- Uninstall / removal of CI from a repo (files, branch, PR) and any automated cleanup.
- Agents whose provider is not OpenRouter (export is blocked with a message; no provider mapping).
- Populating `.devdigest/memory.jsonl` with real memory (see decision 12), `pull_request_target`, fork-PR reviews.
- Renaming files when an agent or skill is renamed after export.
- Fine-grained PAT-scope diagnostics beyond a generic error.
- Changes to the multi-run service or the PR feed.

## Grounding in the repo (verified this run)
- Scaffolding already exists and must be consumed, not reinvented. Server contracts `server/src/vendor/shared/contracts/eval-ci.ts` declare `CiTarget` (`gha|circle|jenkins|cli`), `CiFile` (path, contents, editable), `AgentManifest` (name, provider default `openrouter`, model, system_prompt, skills as slugs, strategy, `ci_fail_on`), `CiExportInput` (repo, target, action `open_pr|files`, `post_as` `github_review|pr_comment|none`, triggers, base default `main`), `CiInstallation`, `CiExport`, `CiRunStatus` (`succeeded|failed|no_findings|running`), `CiRun`, and `CiResultArtifact` (`devdigest-result.json`: findings_count, severity counts, cost_usd, duration_ms, agent, version, pr_number). Its comment names `POST /agents/:id/export-ci` and a `CiService.agentYaml` writer; neither exists yet (no `ci` module under `server/src/modules/`; `server/src/modules/index.ts` registers none).
- The client copy of `eval-ci.ts` lacks `AgentManifest` (vendored copies have drifted; server is ahead). Both copies must carry the manifest schema.
- Tables `ci_installations` (agent_id, repo, target_type, installed_at) and `ci_runs` exist in `server/src/db/schema/ci.ts`. `agent_runs` already has `source` enum `local|ci`, `status`, `duration_ms`, `cost_usd`, `findings_count`, `blockers`, `score`; `RunTrace.config.source` is also `local|ci`. `agent_runs` has no repository, job-link or verdict column.
- `CiFailOn` is `never|critical|warning|any` (`knowledge.ts`); `Agent.ci_fail_on` defaults to `critical`. Lowercase here is the gate-policy enum, not the severity convention (root INSIGHTS).
- Client: `client/messages/en/ci.json` already holds `runs`, `exportWizard`, `ciTab`, `publishDialog` strings (the old "Publish to CI" dialog and the `blockMergeDesc` text "Requires a GitHub App" are superseded by this spec and the mockups); the AgentEditor header comment says Stats/CI tabs come in later lessons; client INSIGHTS requires a new tab be added to both the tab list and the `?tab=` allowlist. The sidebar `NAV` in `client/src/vendor/ui/nav.ts` has no "CI Runs" entry (mockup shows one under GLOBAL).
- The server shows no inbound-auth scheme on routes (hence the choice in decision 4 to avoid an inbound endpoint). Secrets come only from `SecretsProvider`, never from config or DB (server CLAUDE.md).

## Design (per mockups)
- **CI tab** (agent page, tab row Config / Skills / Context / Evals / Stats / CI): heading "CI deployment" with chip "Active in N repos"; buttons "Update CI config" and "Add to CI"; one row per installation: repo, target chip ("GitHub Actions"), status chip ("succeeded"), relative time; a dashed "Add repository" row.
- **Wizard modal** "Export to CI", subtitle "Run <agent> automatically on pull requests", four-step stepper (completed steps show a check), Back / Continue, final "Install".
  - Step 1 Target: four cards - GitHub Actions ("recommended", preselected, "Runs on pull_request events"), CircleCI ("config.yml job"), Jenkins ("Pipeline stage"), Generic CLI ("devdigest review --pr"). Per decision 2, the last three render disabled.
  - Step 2 Preview: left list "FILES TO CREATE" (manifest, skill files, `.devdigest/memory.jsonl`, workflow); right pane shows the selected file; the workflow has an "editable" badge.
  - Step 3 Configure: Trigger chips `pull_request:opened` and `pull_request:synchronize` checked, `pull_request:reopened` optional; "Secrets expected": `OPENROUTER_API_KEY` (badge "not set"/"ready"), `GITHUB_TOKEN` ("Auto-provided by Actions", "ready"); "Post results as": GitHub review (recommended, default) / PR comment / None (exit code only); info note on "Fail CI on" + required status check, "No GitHub App needed".
  - Step 4 Install: card "Open a PR with these files" (recommended, preselected; titled "Add DevDigest CI review") vs a zip card; help link "GitHub Action setup docs"; "Install" button.
- **CI Runs page** (no mockup; minimal layout defined here): page title "CI Runs", a table with columns Timestamp, Repository, Pull request, Agent, Verdict, Findings, Cost, Duration, Job (link "View"); filter selects (last 7 days, all agents, all repos, all statuses), a Refresh button, and empty/loading/error states. Uses the existing `ci.json` `runs` keys where they fit.
- **CI tab additions** (no mockup; minimal layout defined here): below the installation list, a "Workflow version" value per installation, a "Fail CI on" select (never / critical / warning / any) that saves on change, and a "History" list of the agent's recent CI runs (same fields as CI Runs, no filters).

## Resolved decisions
Decisions marked (user) were given by the requester; those marked (default) were chosen by the spec author under the "simplest default, cut the rest" rule and are open to review.
1. (user) The LLM key secret is `OPENROUTER_API_KEY` everywhere; the workflow input is `openrouter-key`. The mockup's Preview snippet (`openai-key` / `OPENAI_API_KEY`) is a mockup error and is corrected.
2. (user) CircleCI, Jenkins and Generic CLI cards are shown disabled; no generators will exist (out of scope).
3. (default; user: "propose") The workflow does NOT use `uses: devdigest/review-action@v1`. It has a `run:` step executing the bundled agent-runner, which is a single bundled script committed into the repo with the export files (so the export contains one more file than the mockup's "5"; the install card count is computed from the actual file list). `devdigest/review-action@v1` may appear only as a commented-out placeholder in the workflow. Reason: `npx` of a pinned package needs a published package, which does not exist; a committed bundle needs nothing external.
4. (default) Result channel: no inbound endpoint on the studio (it runs on localhost, unreachable from GitHub-hosted runners). The runner uploads `devdigest-result.json` as a GitHub Actions workflow artifact. The studio pulls and ingests these artifacts from GitHub, using its stored GitHub credential, when the user opens/refreshes CI Runs or the CI tab (and via the existing auto-refresh behavior, if any). Trust comes from fetching through the GitHub API for the installed repo and the workflow run itself, not from any caller-supplied request. Limitation: not real-time; artifacts expire per GitHub retention, so results older than that and never ingested are lost.
5. (default) CI Runs reads `agent_runs WHERE source='ci'`. The `ci_runs` table is left unused. Repository and job link must be persisted so the list can show them (additive columns or trace fields - a design choice for the plan, not this spec).
6. (default) "Verdict" on CI Runs = the CI status (`CiRunStatus`: succeeded / failed / no_findings / running) plus a "blocking" marker when `blockers > 0`.
7. (default) Fork PRs: the workflow uses `pull_request` only and skips the review with a clear log message when the PR head repo differs from the base repo (secrets unavailable). The runner reads the manifest and skills from the checked-out PR head of same-repo PRs.
8. (default) Existing branch `devdigest/ci`: update that same branch and its open PR (no second PR). Base branch is the repo's default branch (not hard-coded `main`). Existing target files are overwritten; Preview marks files that already exist in the repo as "will be overwritten" (a best-effort check; if it fails the warning is omitted). "Update CI config" regenerates the workflow, overwriting repo-side edits to it.
9. (default) The studio uses the GitHub credential already stored in its local secrets (a PAT; no GitHub App). A missing/insufficient credential produces a generic error (AC-16); scope diagnostics are out of scope. Result collection needs the same credential to read Actions artifacts.
10. (default) Repository choice: the wizard has no repo input; both "Add to CI" and "Add repository" target the currently selected workspace repo (switch repo in the sidebar to add another). If that repo already has an installation for this agent, the flow acts as an update.
11. (default) Agent slug = lowercase kebab-case of the name (non-alphanumerics to `-`), suffixed to stay unique among the agent's skills/agents. Skill file slugs likewise.
12. (default) `.devdigest/memory.jsonl` is generated (so the file list matches the mockup) but is empty in this release; the runner reads it if present and tolerates empty. Sourcing real memory is out of scope.
13. (default) Trace fields: manifest version = the agent `version` at export time, recorded in the manifest; dependencies = skill slugs with content hashes, runner version, reviewer-core version; commit SHA = the commit the run executed against. These are additive optional fields on the run trace `config`.
14. (default) "Fail CI on" lives in the committed manifest, so a change takes effect only after re-export; the studio marks installations "out of date" until "Update CI config" is run. "Workflow version" = the agent version the installed files were generated from; "history" = CI runs for the agent.
15. (default) The installation row status chip and time = the latest CI run for that repo+agent; before any run it shows "no runs yet" (no chip).
16. (default) `OPENROUTER_API_KEY` badge = whether the studio has an OpenRouter key stored locally (the repo's Actions secrets cannot be read); `GITHUB_TOKEN` is always "ready". The caption states that repo secrets are not verified.
17. (default) The zip option is labelled "Download files as a zip" (a browser download), replacing the mockup's "Copy files as a zip". The "no GitHub App needed" note in the mockup is authoritative; the old `blockMergeDesc` string is replaced. In GitHub-review mode a threshold hit posts REQUEST_CHANGES and the job exits non-zero.
18. (default) Export requires only that the agent is saved and its provider is OpenRouter. CI-reported cost is trusted as reported (null stays null). Run identity for de-duplication = GitHub run id + run attempt, carried in the result artifact.

## Acceptance criteria (EARS)

### Manifest
- AC-1: The system shall define the agent manifest schema once in `@devdigest/shared` (both vendored copies) and shall use that same schema in the studio to produce `.devdigest/agents/<slug>.yaml` and in the agent-runner to validate it.
- AC-2: IF the agent-runner reads a manifest that fails the shared schema, THEN the system shall exit non-zero before any LLM call and report the validation error in the job log.
- AC-3: IF the agent's provider is not OpenRouter, THEN the system shall not allow export and shall tell the user why.

### Wizard
- AC-4: WHEN the user clicks "Add to CI", "Add repository" or "Update CI config" on the agent's CI tab, the system shall open the Export Wizard at step 1 for the currently selected repo, with GitHub Actions preselected and marked recommended.
- AC-5: The system shall render CircleCI, Jenkins and Generic CLI as disabled, non-selectable cards.
- AC-6: WHEN the user clicks Continue on step 1, the system shall generate the file set and show step 2 (Preview).
- AC-7: The system shall list on Preview the manifest, every attached skill file, `.devdigest/memory.jsonl`, the bundled runner, and the workflow file, and shall show the selected file's full contents.
- AC-8: The system shall allow editing of the workflow file contents only; all other previewed files shall be read-only.
- AC-9: WHILE a previewed file already exists in the target repo, the system shall mark it "will be overwritten" in the file list.
- AC-10: WHEN the user returns to a previous step with Back, the system shall keep choices and edits made so far until the wizard is closed.
- AC-11: WHEN the user changes the trigger selection on Configure, the system shall regenerate the workflow's `pull_request` types to match (`opened` and `synchronize` on by default, `reopened` optional).
- AC-12: WHEN the user picks a "Post results as" option (GitHub review default, PR comment, none), the system shall generate the workflow and runner configuration for that mode.
- AC-13: The system shall show `OPENROUTER_API_KEY` as "ready" only when the studio holds an OpenRouter key locally and "not set" otherwise, and shall state that repository secrets are not verified; `GITHUB_TOKEN` shall be shown as "ready".

### Install
- AC-14: WHEN the user selects "open a PR" and clicks Install, the system shall create (or update) branch `devdigest/ci` in the target repo, based on the repo's default branch, and open a PR titled "Add DevDigest CI review" (or update the existing one).
- AC-15: The system shall never write to the repository's default branch directly.
- AC-16: IF the PR cannot be created or updated (no/insufficient GitHub credential, network failure), THEN the system shall keep the wizard on step 4, show the error, offer the zip option, and persist no installation.
- AC-17: WHEN the user selects the zip option and clicks Install, the system shall download a zip containing exactly the previewed files, including workflow edits made in the wizard.
- AC-18: WHEN an install succeeds, the system shall persist a CI installation for (agent, repo, target) and show the PR link (or confirm the zip download).

### Runner
- AC-19: WHEN the generated workflow runs on a `pull_request` event from the same repository, the system shall run the bundled agent-runner, which reads the manifest, resolves the skills listed in it, and reviews the PR diff.
- AC-20: IF the PR comes from a fork, THEN the workflow shall skip the review and log why, without failing the check.
- AC-21: WHERE `post_as` is `github_review`, the runner shall publish a GitHub review; WHERE `pr_comment`, a PR comment; WHERE `none`, nothing, communicating only through the exit code.
- AC-22: WHEN findings reach the manifest's `ci_fail_on` threshold, the runner shall exit non-zero; WHERE `ci_fail_on` is `never`, it shall exit zero on a completed review.
- AC-23: IF the OpenRouter secret is missing or the LLM call fails, THEN the runner shall exit non-zero, record a failed result, and still upload it as an artifact.
- AC-24: The runner shall write `devdigest-result.json` (extending `CiResultArtifact` with repository, job URL, GitHub run id and attempt, model, manifest version, dependencies and commit SHA) and upload it as a workflow artifact.

### Result collection
- AC-25: WHEN the user opens or refreshes CI Runs or the CI tab, the system shall fetch new result artifacts for the agent's installations from GitHub using the stored GitHub credential and ingest each as an `agent_runs` row with `source='ci'` and a trace with `config.source='ci'`.
- AC-26: The system shall accept CI results only through the GitHub fetch in AC-25 and shall expose no unauthenticated endpoint that writes CI runs.
- AC-27: IF an artifact fails schema validation, THEN the system shall skip it, write nothing, and log the rejection.
- AC-28: WHEN an artifact for an already-ingested (GitHub run id, attempt) is seen again, the system shall not create a duplicate row.
- AC-29: IF fetching from GitHub fails (credential, network, rate limit), THEN the system shall show a non-blocking error on the page and keep already-ingested runs visible.
- AC-30: The system shall record in each CI run's trace the manifest version, model, dependencies and commit SHA.

### CI Runs page
- AC-31: The system shall provide a global "CI Runs" page, reachable from the GLOBAL group of the sidebar, listing `source='ci'` runs with repository, PR, agent, verdict, findings, cost, duration and a link to the job.
- AC-32: WHILE there are no CI runs, the system shall show an empty state; WHILE loading, a loading state; IF loading fails, THEN an error state with retry.
- AC-33: The system shall order runs newest first and shall not list `source='local'` runs.
- AC-34: IF a run's cost is unknown, THEN the system shall show it as unknown, not zero.

### Agent CI tab
- AC-35: The system shall add a CI tab to the agent page (reachable via `?tab=`), showing installations (repo, target chip, latest-run status chip and time, or "no runs yet"), the workflow version per installation, run history, and a "Fail CI on" select.
- AC-36: WHEN the user changes "Fail CI on", the system shall persist it on the agent and mark installations whose files predate the change as "out of date".
- AC-37: WHEN the user clicks "Update CI config", the system shall regenerate the files from the current agent configuration and run the wizard from step 2.

## Edge cases
- Agent with no skills: manifest `skills` empty/null still validates; no skill files are listed.
- Existing `.devdigest/` or workflow file in the repo: overwritten with a Preview warning (decision 8).
- Branch `devdigest/ci` exists: same branch and PR updated.
- Partial failure on install (branch created, PR failed): no installation persisted; retry is safe and reuses the branch.
- Large system prompt or many skills: files must be complete and untruncated; Preview pane scrolls.
- Concurrent pushes to one PR: each run is a separate row keyed by run id + attempt; none overwrites another.
- Artifact expired before ingest: that run is not shown (decision 4 limitation).
- Installation or agent deleted later (`ci_installation_id`/`agent_id` nullable): runs remain listed with unknown names.
- Slug collision: suffix per decision 11.
- Manifest schema version skew between an older repo copy and the studio: runner validates against its own bundled schema; mismatch fails per AC-2.

## Non-functional requirements
- Security: no secret in the manifest, generated files, DB or git; the OpenRouter key lives only in the repo's Actions secrets; no inbound studio endpoint accepts CI results.
- Reproducibility: generated files are deterministic for a given agent version and wizard selections.
- Contracts: one Zod schema per contract; new surface in new files where possible; both vendored copies edited together and kept identical (CRLF caveat in root INSIGHTS 2026-10-05).
- Observability: skipped/rejected artifacts and runner validation failures are logged.
- Accessibility: wizard operable by keyboard; step changes announced (baseline, not in mockups).
- Tests: server follows the `*.it.test.ts` vs hermetic split; client tests mock fetch.

## Inputs and provenance
- Agent config comes from the stored agent (model, system prompt, strategy, `ci_fail_on`, linked skills); skill bodies from the skills store.
- CI run data comes only from `devdigest-result.json` artifacts fetched from GitHub for installed repos.
- Trace provenance: manifest version, model, dependencies, commit SHA (AC-30).

## Untrusted inputs
- Artifact contents (counts, cost, agent, PR number, URLs) are untrusted until schema-validated; anyone with write access to the repo can alter the workflow and thus the artifact, so CI-reported cost and findings are as-reported, not studio-verified.
- Manifest and skill files in the repo are editable by anyone with repo write access; the runner schema-validates the manifest and treats skill text as prompt content.
- PR diff, title and body are untrusted prompt input (existing reviewer-core grounding gate applies).
- User-edited workflow YAML is stored/forwarded only, never interpreted by the studio.
- The target `owner/name` must be validated before use in any GitHub call or generated file.

## Open questions
- none
