import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import {
  countBlockers,
  gateTriggered,
  reviewPullRequest,
  toReviewPayload,
} from '@devdigest/reviewer-core';
import { CiRunResult, CI_SLUG_RE } from '@devdigest/shared';
import type { CiPostAs, GitHubReviewPayload, LLMProvider } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../server/src/adapters/git/diff-parser.js';
import { loadManifest } from './manifest.js';
import type { RunnerGitHub } from './github.js';
import { REVIEWER_CORE_VERSION, RUNNER_VERSION } from './version.js';

export interface RunnerDeps {
  env: Record<string, string | undefined>;
  /** Read a UTF-8 file; null when it does not exist. */
  readFile(path: string): Promise<string | null>;
  github: RunnerGitHub;
  makeLlm(key: string): LLMProvider;
  log(msg: string): void;
  now(): Date;
  args: { manifestPath: string; postAs: CiPostAs };
}

export interface RunOutcome {
  exitCode: number;
  result: CiRunResult | null;
}

const NO_RESULT = (exitCode: number): RunOutcome => ({ exitCode, result: null });

/** The PR number and head repo (`owner/name`) from the Actions event payload. */
function parseEvent(text: string | null): { number: number; headRepo: string | null } | null {
  if (!text) return null;
  try {
    const e = JSON.parse(text) as {
      pull_request?: { number?: number; head?: { repo?: { full_name?: string } | null } };
    };
    const pr = e.pull_request;
    if (!pr || typeof pr.number !== 'number') return null;
    return { number: pr.number, headRepo: pr.head?.repo?.full_name ?? null };
  } catch {
    return null;
  }
}

/** Memory lines: `{ "text": string }` per line; invalid / empty lines are skipped. */
function parseMemory(text: string | null): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line) as { text?: unknown };
      if (typeof j.text === 'string' && j.text.trim()) out.push(j.text);
    } catch {
      /* skip invalid line */
    }
  }
  return out;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function runAgent(deps: RunnerDeps): Promise<RunOutcome> {
  const { env, log } = deps;
  const startedAt = deps.now();
  const repository = env.GITHUB_REPOSITORY ?? '';

  // 1. Event — and the fork guard (defence in depth: the workflow already skips forks).
  const event = parseEvent(env.GITHUB_EVENT_PATH ? await deps.readFile(env.GITHUB_EVENT_PATH) : null);
  if (!event) {
    log('Cannot read the pull_request event payload (GITHUB_EVENT_PATH).');
    return NO_RESULT(1);
  }
  if (event.headRepo !== repository) {
    log('skipping: PR from a fork, secrets unavailable');
    return NO_RESULT(0);
  }

  // 2. Manifest — invalid means no LLM call and no result.
  const manifestText = await deps.readFile(deps.args.manifestPath);
  if (manifestText == null) {
    log(`Manifest validation failed: file not found: ${deps.args.manifestPath}`);
    return NO_RESULT(2);
  }
  const loaded = loadManifest(manifestText);
  if (!loaded.ok) {
    log(`Manifest validation failed: ${loaded.error}`);
    return NO_RESULT(2);
  }
  const manifest = loaded.manifest;
  const agentSlug = posix.basename(deps.args.manifestPath).replace(/\.ya?ml$/, '');
  if (!CI_SLUG_RE.test(agentSlug)) {
    log(`Manifest validation failed: file name "${agentSlug}" is not a valid agent slug`);
    return NO_RESULT(2);
  }

  const runId = Number(env.GITHUB_RUN_ID ?? '0') || 1;
  const attempt = Number(env.GITHUB_RUN_ATTEMPT ?? '1') || 1;
  const server = env.GITHUB_SERVER_URL ?? 'https://github.com';
  const jobUrl = `${server}/${repository}/actions/runs/${runId}/attempts/${attempt}`;
  const failOn = manifest.ci_fail_on;
  const skillDeps: { slug: string; sha256: string }[] = [];
  let headSha: string | null = null;

  const finish = (p: Partial<CiRunResult> & Pick<CiRunResult, 'status'>): CiRunResult => {
    const finished = deps.now();
    return CiRunResult.parse({
      findings_count: 0,
      cost_usd: null,
      duration_ms: finished.getTime() - startedAt.getTime(),
      agent: manifest.name,
      version: String(manifest.version ?? ''),
      pr_number: event.number,
      blockers: 0,
      agent_slug: agentSlug,
      repository,
      job_url: jobUrl,
      github_run_id: runId,
      github_run_attempt: attempt,
      model: manifest.model,
      manifest_version: manifest.version ?? null,
      commit_sha: headSha,
      dependencies: {
        skills: skillDeps,
        runner_version: RUNNER_VERSION,
        reviewer_core_version: REVIEWER_CORE_VERSION,
      },
      finished_at: finished.toISOString(),
      ...p,
    });
  };
  const failed = (error: string): RunOutcome => {
    log(`DevDigest run failed: ${error}`);
    return { exitCode: 1, result: finish({ status: 'failed', error: error.slice(0, 2000) }) };
  };

  // 3. Skills + memory.
  const root = posix.dirname(posix.dirname(deps.args.manifestPath));
  const skillBodies: string[] = [];
  for (const slug of manifest.skills) {
    const path = `${root}/skills/${slug}.md`;
    const body = await deps.readFile(path);
    if (body == null) return failed(`skill file not found: ${path}`);
    skillBodies.push(body);
    skillDeps.push({ slug, sha256: sha256(body) });
  }
  const memory = parseMemory(await deps.readFile(`${root}/memory.jsonl`));

  // 4. Key.
  const key = env.OPENROUTER_API_KEY;
  if (!key) return failed('OPENROUTER_API_KEY secret is not set');

  try {
    // 5. Diff + PR.
    const pull = await deps.github.getPull(repository, event.number);
    headSha = /^[0-9a-f]{40}$/.test(pull.headSha) ? pull.headSha : null;
    const diff = parseUnifiedDiff(await deps.github.getDiff(repository, event.number));

    // 6. Review.
    const outcome = await reviewPullRequest({
      systemPrompt: manifest.system_prompt,
      model: manifest.model,
      diff,
      llm: deps.makeLlm(key),
      strategy: manifest.strategy,
      skills: skillBodies,
      memory,
      prDescription: pull.body ?? undefined,
      task: `Review PR #${event.number}`,
      onEvent: (e) => log(e.msg),
    });
    const findings = outcome.review.findings;

    // 7. Gate.
    const blockers = countBlockers(findings, failOn);
    const gate = gateTriggered(findings, failOn);
    const count = (s: string) => findings.filter((f) => f.severity === s).length;

    // 8. Post.
    let postError: string | null = null;
    try {
      if (deps.args.postAs !== 'none') {
        const payload: GitHubReviewPayload = toReviewPayload(outcome.review, {
          failOn,
          diff,
          title: manifest.name,
        });
        if (deps.args.postAs === 'github_review') {
          // Actions' GITHUB_TOKEN cannot approve by default — downgrade to a comment.
          const reviewEvent = payload.event === 'APPROVE' ? 'COMMENT' : payload.event;
          await deps.github.postReview(
            repository,
            event.number,
            { ...payload, event: reviewEvent },
            pull.headSha,
          );
        } else {
          await deps.github.postComment(repository, event.number, payload.body);
        }
      }
    } catch (e) {
      postError = `could not post results to GitHub: ${(e as Error).message}`;
    }

    // 9. Result.
    const result = finish({
      status: postError ? 'failed' : findings.length === 0 ? 'no_findings' : 'succeeded',
      error: postError,
      findings_count: findings.length,
      critical: count('CRITICAL'),
      warning: count('WARNING'),
      suggestion: count('SUGGESTION'),
      blockers,
      cost_usd: outcome.costUsd,
      tokens_in: outcome.tokensIn,
      tokens_out: outcome.tokensOut,
    });
    if (postError) log(`DevDigest run failed: ${postError}`);

    // 10. Exit code.
    const exitCode = postError ? 1 : gate && failOn !== 'never' ? 1 : 0;
    log(
      `DevDigest: ${findings.length} finding(s), ${blockers} blocking under "${failOn}" -> exit ${exitCode}`,
    );
    return { exitCode, result };
  } catch (e) {
    return failed((e as Error).message || 'review failed');
  }
}
