---
name: run-plan
description: "Runs this repo's spec-driven-development implementation pipeline end-to-end from an existing plan file under docs/plans/ — implementer -> architecture-reviewer -> plan-verifier -> test-writer, each as a separate Agent call, stopping and surfacing the result the moment any gating stage reports BLOCKED, PARTIAL or FAIL. Never commits, stages, pushes, or opens a PR -- hands back only the set of changed files on disk and each stage's verdict, for the user to review and commit themselves. Use once a spec (spec-creator) and a plan (implementation-planner) already exist, when the user asks to run/execute/implement a plan, or invokes /run-plan."
---

# Run Plan

Takes one finished implementation plan and drives it through the part of this repo's spec-driven-development pipeline that starts once a plan exists: `implementer -> architecture-reviewer -> plan-verifier -> test-writer`. It does not write a spec and does not write a plan — those are `spec-creator`'s and `implementation-planner`'s jobs, and must already be done before this skill starts.

This skill is pure orchestration. It launches other agents (via the `Agent` tool), checks each one's status before moving to the next, and reports. It never implements anything itself and never touches git state beyond reading it.

---

## Hard rules

1. **Never commit.** No `git add`, `git commit`, `git push`, `gh pr create`, or any other state-changing git/GitHub action, at any point, no matter how clean the result is. The deliverable is changed files on disk, not a commit. If asked to also commit, say that's outside this skill — point to the `pr-self-review` skill and a manual commit instead.
2. **One plan, one run.** Input is exactly one plan path. No plan path → stop and point to `implementation-planner`. A plan whose own `Status` is `BLOCKED` or `NO PLAN NEEDED` → stop immediately; there is nothing ready to execute.
3. **Sequential, never parallel.** Each stage depends on files the previous stage left on disk, so stages run one at a time in order. Launch each `Agent` call in the foreground (`run_in_background: false`) — the next action always depends on this stage's result, so there is nothing to usefully do while waiting.
4. **Stop on a gating red, don't push through it.** `implementer: PARTIAL` or `BLOCKED`, and `plan-verifier: FAIL` or `BLOCKED`, each end the run at that stage. `architecture-reviewer` never stops the run — it is advisory by its own design (it "never blocks anything itself") — so always continue past it regardless of its status, folding its findings into the final report.
5. **Every stage gets the plan path**, plus whichever earlier hand-backs its own input contract accepts — never a paraphrase you wrote in place of the real hand-back text.
6. **This skill never edits code.** Every file change comes from one of the four agents. Anything that looks like it needs a manual fix is a report item, not something to do directly.

---

## Input contract

You need a plan path under `docs/plans/`. If the request names a spec or a feature instead of a plan path, `Glob docs/plans/*.md` and match on each plan's `Spec:` header; if none matches, stop and say the `implementation-planner` agent needs to run first — this skill does not plan.

Before launching Stage 1, `Read` the plan and confirm its `Status` is `READY FOR IMPLEMENTER`. Any other status is itself a reason to stop (see rule 2) — report which status it actually has.

---

## Order of work

### Stage 1 — `implementer`

Launch the `implementer` agent, passing the plan path.

- `Status: COMPLETE` → continue to Stage 2.
- `Status: PARTIAL` → stop. Report the hand-back's **Not done** and **Deviations** sections verbatim — this is the implementer telling you a step genuinely didn't fit, not a crash to hide.
- `Status: BLOCKED` → stop. Report the blocking reason verbatim.

### Stage 2 — `architecture-reviewer`

Launch the `architecture-reviewer` agent, passing the plan path. Always continue to Stage 3 afterward, whatever its `Status` (`CLEAN` / `VIOLATIONS` / `PARTIAL`) — carry its findings into the final report, but never let them halt the run.

### Stage 3 — `plan-verifier`

Launch the `plan-verifier` agent, passing the plan path, the Stage 1 hand-back, and the Stage 2 report. `plan-verifier` only reads the latter two after deriving its own verdicts independently — they cost nothing to pass and give it pointers.

- `Status: PASS` → continue to Stage 4.
- `Status: FAIL` → stop. Report the **Checklist**'s NOT MET rows and **Unplanned changes** in full — running `test-writer` against an implementation that doesn't match its own plan is wasted work.
- `Status: BLOCKED` → stop. Report why.

### Stage 4 — `test-writer`

Launch the `test-writer` agent, passing the plan path. This is the last stage; its result is reported as-is:

- `Status: COMPLETE` → clean run, done.
- `Status: BUGS FOUND` → done — report every bug with its file:line and failing output. This is a legitimate, informative pipeline outcome, not a reason to loop back on your own initiative.
- `Status: BLOCKED` → report why; there is no further stage to fall back to.

---

## Final report

Only your final message matters — no stage's intermediate back-and-forth belongs in it.

```markdown
# 🚀 RUN PLAN — <plan title>
**Plan:** `docs/plans/<file>.md`
**Stages run:** implementer -> architecture-reviewer -> plan-verifier -> test-writer   (or: "stopped after <stage>")

## Stage results
| Stage | Status | Summary |
|---|---|---|
| implementer | COMPLETE | 5/5 steps done |
| architecture-reviewer | CLEAN | no findings |
| plan-verifier | PASS | 18/18 rows MET |
| test-writer | COMPLETE | 6 tests added |

## Changed files
<union of `git status --porcelain` and `git diff --name-status <merge-base>...HEAD`, deduplicated>
- `server/src/modules/foo/service.ts` (new)
- `client/src/app/foo/page.tsx` (edit)

## Not committed
Nothing was staged, committed, or pushed — these changes exist on disk only. Review with `git diff`, then commit yourself (consider running `pr-self-review` first).
```

If the run stopped early, **Stages run** says exactly where, and **Changed files** still lists whatever Stage 1 (and, if reached, Stage 2) actually produced — partial progress is still reported, never discarded or hidden.
