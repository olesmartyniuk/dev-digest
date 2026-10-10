---
name: workflow-retro
description: "Produces a one-off retrospective on a multi-agent run that just happened in this session — token usage per agent, launch order and parallelism, timing, difficulties, duplicated work, and gaps — by parsing this session's own Claude Code transcript and subagent logs. Reports to chat only, never writes a file. Use when asked for a retro, postmortem, or performance review of a workflow/pipeline/set of agents that just ran (run-plan, the spec-creator -> implementation-planner -> run-plan pipeline, an ad-hoc set of Agent calls, or a Workflow tool run), or when the user invokes /workflow-retro. Manual only — nothing in this repo auto-triggers it."
---

# Workflow Retro

Looks back at a multi-agent run that just happened **in this same session** and reports on how the orchestration performed — not the code it produced. Token cost, agent count and order, timing, and where the hand-offs between agents worked or didn't. Chat output only; this skill never writes a file and never touches git.

This is the process-performance counterpart to `engineering-insights`: that skill captures what was learned about the *code*; this one captures how well the *agents* worked together.

---

## Scope

Works on whatever multi-agent activity happened in the current session — a `run-plan` run, the full spec-creator → implementation-planner → run-plan pipeline, an ad-hoc set of `Agent` calls, or a `Workflow` tool run. It doesn't assume a fixed pipeline shape; it reads the session's own transcript to find out what actually ran.

**Manual only.** Nothing auto-invokes this. Run it when asked for a retrospective/postmortem/review of a workflow, or on `/workflow-retro`.

If no `Agent` calls happened yet this session, say so and stop — there's nothing to retrospect on.

---

## Hard rules

1. **Chat only.** Never write a file, never append to `INSIGHTS.md`, never touch git. The report lives in your response and nowhere else.
2. **This session's own data only.** Every number comes from this session's own transcript and subagent logs (see *Locating the data*) — never estimate, round from memory, or ask the user to supply token counts.
3. **Numbers from the script, narrative from you.** Token sums, timestamps, and launch order come from `scripts/extract_workflow_metrics.mjs`'s output verbatim — never hand-recompute them by eyeballing a transcript. Difficulties, duplication, and gaps are a reading task: look at the condensed JSON the script produces (tool tallies, touched files, error excerpts, each agent's final hand-back) and judge from there.
4. **No run yet → say so and stop.** If the script reports an error (no subagents directory, or an empty one), relay that message plainly; don't fabricate a retrospective from nothing.
5. **A claim needs a pointer.** Every entry in Difficulties / What went easily / Duplicated work / Missed-skipped must name the specific agent and point at evidence — a tool name, a file path, or a quoted fragment of a hand-back. An entry with nothing to point at doesn't go in the report.

---

## Locating the data

Every session's transcript lives under `~/.claude/projects/<project-slug>/<session-uuid>.jsonl`, with subagent transcripts (when any ran) as siblings at `<session-uuid>/subagents/agent-*.jsonl` + matching `agent-*.meta.json`.

Get `<session-uuid>` from your own environment block — it's the folder name that also holds this session's scratchpad directory (`.../<session-uuid>/scratchpad`). Don't ask the user for it.

Run:

```sh
node .claude/skills/workflow-retro/scripts/extract_workflow_metrics.mjs <session-uuid>
```

The script searches `~/.claude/projects/*/` itself rather than constructing the path — **the project-slug folder name is not a reliable function of the cwd on Windows** (the same project can appear under two different slugs because the drive-letter case differs between process launches), so a hand-built path can silently miss the real session. Don't shortcut this by constructing the path yourself.

It prints one JSON object to stdout:

- `runSpan` — earliest/latest timestamp across every agent (wall-clock span of the whole run).
- `tokenGrandTotal` / `tokenGrandTotalSum` — input / output / cache-write / cache-read, summed across every agent.
- `duplicateFiles` — paths touched by two or more agents, with which agent types touched them. A ready-made seed list for the Duplicated-work section.
- `agents[]` — one entry per subagent that ran, each with: `agentType`, `description`, `spawnDepth`, `orderIndex` (launch order), `launchBatch` (same number ⇒ launched in parallel in the same parent turn), `tokens` + `tokensTotal`, `turnCount`, `firstTimestamp`/`lastTimestamp`, `toolTally` (call count by tool name), `filesTouched`, `errorCount` + `errorExcerpts` (up to 6, each with the failing tool and a content snippet), and `finalMessage` (the agent's last text block — its hand-back report, verbatim).

If it can't find the session or there's nothing to report, it prints `{"error": "..."}` — relay that message and stop per rule 4.

**Token accounting note, already handled by the script, don't redo it by hand:** a single API turn's `usage` is logged once per *content block* in the raw transcript (one line for the thinking block, one per tool call, all repeating the same usage snapshot for that turn) — summing naively per-line overcounts by as much as the block count. The script dedupes by `message.id` before summing, so its `tokens`/`tokensTotal` figures are already correct; use them as-is.

---

## Building the report

### Mechanical (straight from the script's JSON)

- **Agent count and roster** — `agentType` + `description` per entry.
- **Order of launch** — sort by `orderIndex`; agents sharing a `launchBatch` ran in parallel, different batches ran sequentially.
- **Tokens** — per agent: input / output / cache-write / cache-read, plus the grand total. A high cache-read relative to input/output means the agent did many turns over an already-large context (cheap per turn, but a sign of a long-running or context-heavy agent) — worth calling out, not just tabulating.
- **Timing** — per-agent wall-clock (`firstTimestamp` → `lastTimestamp`), and the overall `runSpan`. Note explicitly that overlapping (parallel-batch) agents mean the run span is shorter than the sum of individual durations — don't add them up as if sequential.
- **Errors** — `errorCount` per agent; mention the tool and cause from `errorExcerpts` for any agent with errors.

### Judgment (read the finalMessage / toolTally / filesTouched the script surfaced)

For each of these, name the specific agent and cite the evidence field — a claim with nothing to point at doesn't belong in the report:

- **Difficulties** — an agent with `errorCount > 0` (quote the excerpt), a disproportionately high `turnCount` or `toolTally` for what the task should have taken, or a `finalMessage` that names a deviation, a blocker, or a workaround.
- **What went easily** — an agent with `errorCount: 0`, a low `turnCount`, and a `finalMessage` with no caveats — especially where that's a contrast to a harder stage next to it.
- **Duplicated information** — start from the script's `duplicateFiles` list. For each entry with two or more *different* `agentType`s, judge whether the earlier agent's `finalMessage` could plausibly have carried that fact forward instead of the later agent re-reading the same file cold. Quote both agents and the shared path.
- **What was skipped or missed** — read each `finalMessage` for explicit "not done" / "out of scope" / "deferred" / "could not verify" language, or a verifier-style NOT MET / BUGS FOUND row, then check whether any later agent's `finalMessage` picked it up. If none did, it's a gap.

Don't force an entry into every category — an unremarkable run can have zero duplicated-info findings. A fabricated entry to fill a section is worse than leaving it empty.

---

## Report format

```markdown
# Workflow Retro — <short label for what ran>

**Session:** `<session-uuid>` · **Span:** <start> → <end> (<wall-clock duration>)
**Agents launched:** <n> across <n> launch batch(es)

## Agents
| # | Batch | Agent | Duration | Turns | Tokens (in/out/cache-w/cache-r) | Errors | Hand-back verdict |
|---|-------|-------|----------|-------|----------------------------------|--------|--------------------|
| 1 | 1 | spec-creator | 9m38s | 38 | 76 / 3.0k / 148k / 3.9M | 1 | (first clause of finalMessage) |

**Totals:** in X · out Y · cache-write Z · cache-read W → **G tokens**

## Difficulties
- <agent>: <what happened> — evidence: <tool/file/quote>

## What went easily
- <agent>: <why>

## Duplicated work
- `<path>` read independently by <agent A> and <agent B> — <what could have been handed forward instead>

## Missed / skipped
- <agent>: <what, and whether a later agent covered it>

## Recommendations for next run
<2-4 sentences specific to *this* run — not generic advice>
```

Rules for filling it in:
- If `agentCount` is 1, state in one line that there's nothing to compare for parallelism/duplication, and skip those sections entirely rather than leaving them as empty headings.
- "Hand-back verdict" is the first clause of `finalMessage` (or its `Status:` line, if the agent uses that convention) — not the full text; the full text is available if the user asks for more on a specific agent.
- Durations use `firstTimestamp`/`lastTimestamp` per agent; call out overlap explicitly when batches ran in parallel.
