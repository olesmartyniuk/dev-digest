/**
 * CI change detector for the harness evals.
 *
 * Reads a newline-separated list of changed files (repo-relative) from $CHANGED_FILES and maps
 * them onto the eval suites that should run for this PR:
 *
 *   .claude/skills/<name>/**   OR  evals/skills/<name>/**   → run evals/skills/<name>  (content tier)
 *   .claude/agents/<name>.md   OR  evals/agents/<name>/**   → run evals/agents/<name>  (tool tier)
 *   root CLAUDE.md / evals/workflow/** change                 → run the workflow tier
 *   names in EVAL_CI_EXCLUDE (default: architecture-reviewer-lite) → never run in CI (cost)
 *   EVAL_ALL=1 (manual dispatch)                              → run everything that has evals
 *
 * A changed artifact with NO written evals is NOT a failure: it is reported on the `skipped_*`
 * outputs so the job can print a visible "SKIP <name> (no evals)" line instead of going red.
 *
 * Emits GitHub Actions step outputs (skills, agents, run_workflow, skipped_skills, skipped_agents)
 * to $GITHUB_OUTPUT. Pure filesystem + string work — no deps.
 */

import { existsSync, readdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EVALS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(EVALS_DIR, "..");

const changed = (process.env.CHANGED_FILES ?? "")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

/** Does evals/<tier>/<name>/ contain at least one *.eval.ts? */
function hasEvals(tier, name) {
  const dir = join(EVALS_DIR, tier, name);
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((f) => f.endsWith(".eval.ts"));
}

/** Collect distinct artifact names touched under a `.claude` and/or `evals` prefix. */
function touched(reClaude, reEvals) {
  const names = new Set();
  for (const f of changed) {
    const m = f.match(reClaude) ?? f.match(reEvals);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

const skillNames = touched(
  /^\.claude\/skills\/([^/]+)\//,
  /^evals\/skills\/([^/]+)\//,
);
const agentNames = touched(
  /^\.claude\/agents\/([^/]+)\.md$/,
  /^evals\/agents\/([^/]+)\//,
);

// EVAL_ALL=1 (manual workflow_dispatch) → every suite that has evals, nothing skipped.
const all = process.env.EVAL_ALL === "1";
const withEvals = (tier) =>
  existsSync(join(EVALS_DIR, tier))
    ? readdirSync(join(EVALS_DIR, tier)).filter((n) => hasEvals(tier, n) && !isExcluded(n))
    : [];

// Eval-only A/B variants are never run in CI (they exist for local eval:repeat/eval:delta
// comparison and would double the LLM spend). Override with EVAL_CI_EXCLUDE="a,b".
const excludedSet = new Set(
  (process.env.EVAL_CI_EXCLUDE ?? "architecture-reviewer-lite").split(",").map((s) => s.trim()).filter(Boolean),
);
const isExcluded = (n) => excludedSet.has(n);

const runnable = (tier, n) => hasEvals(tier, n) && !isExcluded(n);
const skills = all ? withEvals("skills") : skillNames.filter((n) => runnable("skills", n));
const skippedSkills = all ? [] : skillNames.filter((n) => !hasEvals("skills", n));
const agents = all ? withEvals("agents") : agentNames.filter((n) => runnable("agents", n));
const skippedAgents = all ? [] : agentNames.filter((n) => !hasEvals("agents", n));
const excluded = all ? [] : [...skillNames, ...agentNames].filter(isExcluded);

// The workflow tier measures the LIVE harness: it re-runs only when the ROOT CLAUDE.md changes
// (package CLAUDE.md files are ignored) or the workflow cases change. Engine (evals/src) edits do
// NOT trigger it — the model-free unit tests cover those, and the tier is the costliest one.
const runWorkflow =
  process.env.EVAL_ALL === "1" ||
  changed.some((f) => f === "CLAUDE.md" || /^evals\/workflow\//.test(f));

const out = process.env.GITHUB_OUTPUT;
const write = (k, v) => (out ? appendFileSync(out, `${k}=${v}\n`) : console.log(`${k}=${v}`));

write("skills", JSON.stringify(skills));
write("agents", JSON.stringify(agents));
write("run_workflow", String(runWorkflow));
write("skipped_skills", skippedSkills.join(" "));
write("skipped_agents", skippedAgents.join(" "));
write("excluded", excluded.join(" "));

// Human-readable summary in the step log.
console.error("── eval change detection ──");
console.error(`changed files : ${changed.length}`);
console.error(`skills → run  : ${skills.join(", ") || "(none)"}`);
console.error(`agents → run  : ${agents.join(", ") || "(none)"}`);
console.error(`workflow tier : ${runWorkflow ? "run" : "skip"}`);
if (skippedSkills.length) console.error(`SKIP skills (no evals): ${skippedSkills.join(", ")}`);
if (skippedAgents.length) console.error(`SKIP agents (no evals): ${skippedAgents.join(", ")}`);
if (excluded.length) console.error(`EXCLUDED from CI: ${excluded.join(", ")}`);
