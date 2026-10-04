import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { CallToolResult, ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import type { ReviewRecord } from '@devdigest/shared';
import { DevDigestApiError } from '../api/client.js';
import { responseFormatParam, fromApiError, ok, toolError, paginate, ID_HINTS } from './result.js';
import type { ResponseFormat } from './enums.js';
import type { ToolDeps } from './types.js';
import { selectFindings, projectFinding, summarizeReviews, countKeptFindings } from './get-findings.js';
import type { ProjectableFinding } from './get-findings.js';
import { waitForRuns, type RunOutcome } from './wait-for-runs.js';

/**
 * Principle 1 — result, not operation. This tool performs trigger → wait →
 * collect in ONE call and returns a verdict + findings, never a run id to
 * poll. Do not split it into start/status tools.
 */
export const runAgentOnPrInput = {
  pr_id: z
    .string()
    .uuid({ message: `pr_id: ${ID_HINTS['pull request']}` })
    .describe('DevDigest pull-request id (uuid, not the GitHub PR number)'),
  agent_id: z
    .string()
    .min(1, { message: `agent_id: ${ID_HINTS.agent}` })
    .optional()
    .describe('Agent to run (from list_agents). Exactly one of agent_id / all_agents.'),
  all_agents: z.boolean().optional().describe('Run every enabled agent instead of one'),
  timeout_seconds: z.number().int().min(30).max(900).optional().describe('Max wait for the review(s); default 300'),
  max_findings: z.number().int().min(1).max(100).default(50),
  response_format: responseFormatParam,
};

interface RunAgentOnPrArgs {
  pr_id: string;
  agent_id?: string;
  all_agents?: boolean;
  timeout_seconds?: number;
  max_findings: number;
  response_format: ResponseFormat;
}

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

function buildRunLine(run: RunOutcome, review: ReviewRecord | undefined): Record<string, unknown> {
  return {
    run_id: run.run_id,
    agent_name: run.agent_name,
    status: run.status,
    error: run.summary?.error ?? null,
    duration_ms: run.summary?.duration_ms ?? null,
    cost_usd: run.summary?.cost_usd ?? null,
    findings_count: review ? countKeptFindings(review) : (run.summary?.findings_count ?? null),
    score: review?.score ?? run.summary?.score ?? null,
  };
}

export function buildSinglePayload(
  prId: string,
  run: RunOutcome,
  review: ReviewRecord | undefined,
  findings: ProjectableFinding[],
  total: number,
  maxFindings: number,
  format: ResponseFormat,
): Record<string, unknown> {
  const truncated = total > maxFindings;

  if (format === 'detailed') {
    return {
      pr_id: prId,
      runs: [buildRunLine(run, review)],
      reviews: review ? summarizeReviews([review], 'detailed') : [],
      total_findings: total,
      truncated,
      findings: findings.map((f) => projectFinding(f, 'detailed')),
    };
  }

  const payload: Record<string, unknown> = {
    pr_id: prId,
    agent_name: run.agent_name,
    verdict: review?.verdict ?? null,
    score: review?.score ?? null,
    findings: findings.map((f) => projectFinding(f, 'concise', ['agent_name', 'run_id'])),
  };
  if (truncated) {
    payload.truncated = true;
    payload.total_findings = total;
    payload.next = `call get_findings with pr_id=${prId} and run_id=${run.run_id} and offset=${maxFindings} for the rest`;
  }
  return payload;
}

export function buildMultiPayload(
  prId: string,
  runs: RunOutcome[],
  reviews: ReviewRecord[],
  findings: ProjectableFinding[],
  total: number,
  maxFindings: number,
  format: ResponseFormat,
): Record<string, unknown> {
  const truncated = total > maxFindings;
  const reviewByRunId = new Map(reviews.filter((r) => r.run_id !== null).map((r) => [r.run_id as string, r] as const));

  if (format === 'detailed') {
    return {
      pr_id: prId,
      runs: runs.map((run) => buildRunLine(run, reviewByRunId.get(run.run_id))),
      reviews: summarizeReviews(reviews, 'detailed'),
      total_findings: total,
      truncated,
      findings: findings.map((f) => projectFinding(f, 'detailed')),
    };
  }

  const results = runs.map((run) => {
    if (run.status === 'done') {
      const review = reviewByRunId.get(run.run_id);
      return {
        agent_name: run.agent_name,
        verdict: review?.verdict ?? null,
        score: review?.score ?? null,
        findings_count: review ? countKeptFindings(review) : 0,
      };
    }
    return { agent_name: run.agent_name, status: run.status, error: run.summary?.error ?? null };
  });

  const payload: Record<string, unknown> = {
    pr_id: prId,
    results,
    findings: findings.map((f) => projectFinding(f, 'concise', ['run_id'])),
  };
  if (truncated) {
    payload.truncated = true;
    payload.total_findings = total;
    payload.next = `call get_findings with pr_id=${prId} and offset=${maxFindings} for the rest`;
  }
  return payload;
}

export async function runAgentOnPrHandler(
  args: RunAgentOnPrArgs,
  deps: ToolDeps,
  extra: Extra,
): Promise<CallToolResult> {
  const hasAgent = args.agent_id !== undefined;
  const hasAll = args.all_agents === true;
  if (hasAgent === hasAll) {
    return toolError('Pass exactly one of agent_id (call list_agents to get one) or all_agents:true.');
  }
  const mode: 'single' | 'multi' = hasAgent ? 'single' : 'multi';

  let triggered;
  try {
    triggered = await deps.api.triggerReview(
      args.pr_id,
      hasAgent ? { agentId: args.agent_id as string } : { all: true },
    );
  } catch (e) {
    const isAgentNotFound = e instanceof DevDigestApiError && e.status === 404 && /agent/i.test(e.message);
    return fromApiError(
      e,
      isAgentNotFound ? { entity: 'agent', id: args.agent_id ?? '' } : { entity: 'pull request', id: args.pr_id },
    );
  }

  if (triggered.runs.length === 0) {
    return toolError(
      'No enabled agents — pass agent_id (any agent from list_agents), or ask the user to enable one on the DevDigest Agents page.',
    );
  }

  const targets = triggered.runs.map((r) => ({ run_id: r.run_id, agent_name: r.agent_name }));
  const timeoutMs = (args.timeout_seconds ?? deps.config.defaultRunTimeoutMs / 1000) * 1000;
  const progressToken = extra._meta?.progressToken;

  const waitResult = await waitForRuns({
    prId: args.pr_id,
    targets,
    timeoutMs,
    deps,
    signal: extra.signal,
    ...(progressToken !== undefined
      ? {
          onProgress: async (finished: number, total: number) => {
            await extra.sendNotification({
              method: 'notifications/progress',
              params: {
                progressToken,
                progress: finished,
                total,
                message: `${finished}/${total} review runs finished`,
              },
            });
          },
        }
      : {}),
  });

  if (waitResult.kind === 'poll_failed') {
    return fromApiError(waitResult.error, { entity: 'pull request', id: args.pr_id });
  }
  if (waitResult.kind === 'missing') {
    const id = waitResult.runs.find((r) => r.status === 'missing')?.run_id ?? '?';
    return toolError(
      `Run ${id} disappeared from the PR run history (deleted?) — retry run_agent_on_pr with the same arguments.`,
    );
  }
  if (waitResult.kind === 'aborted') {
    const ids = waitResult.runs.map((r) => r.run_id).join(', ');
    return toolError(
      `Cancelled by client; review run(s) ${ids} continue on the server — call get_findings with pr_id=${args.pr_id} later to read their findings.`,
    );
  }
  if (waitResult.kind === 'timeout') {
    const ids = waitResult.runs.map((r) => r.run_id).join(', ');
    const seconds = Math.round(timeoutMs / 1000);
    const runIdHint = mode === 'single' && targets[0] ? ` and run_id=${targets[0].run_id}` : '';
    return toolError(
      `Timed out after ${seconds}s waiting for run(s) ${ids}. They are still running on the server — call get_findings with pr_id=${args.pr_id}${runIdHint} in a minute or two.`,
      { pr_id: args.pr_id, run_ids: waitResult.runs.map((r) => r.run_id) },
    );
  }

  // waitResult.kind === 'settled'
  const doneRuns = waitResult.runs.filter((r) => r.status === 'done');
  const failedRuns = waitResult.runs.filter((r) => r.status !== 'done');

  let reviews: ReviewRecord[] = [];
  if (doneRuns.length > 0) {
    try {
      reviews = await deps.api.listReviews(args.pr_id);
    } catch (e) {
      return fromApiError(e, { entity: 'pull request', id: args.pr_id });
    }
  }

  const doneRunIds = doneRuns.map((r) => r.run_id);
  const selected = selectFindings(reviews, { runIds: doneRunIds, includeDismissed: false });
  const { page, total } = paginate(selected, 0, args.max_findings);

  const reviewByRunId = new Map(reviews.filter((r) => r.run_id !== null).map((r) => [r.run_id as string, r] as const));
  const relevantReviews = doneRuns
    .map((r) => reviewByRunId.get(r.run_id))
    .filter((r): r is ReviewRecord => r !== undefined);

  if (failedRuns.length === 0) {
    const payload =
      mode === 'single'
        ? buildSinglePayload(
            args.pr_id,
            doneRuns[0] as RunOutcome,
            reviewByRunId.get((doneRuns[0] as RunOutcome).run_id),
            page,
            total,
            args.max_findings,
            args.response_format,
          )
        : buildMultiPayload(args.pr_id, waitResult.runs, relevantReviews, page, total, args.max_findings, args.response_format);
    return ok(payload);
  }

  if (mode === 'single') {
    const run = waitResult.runs[0] as RunOutcome;
    const errorText = run.summary?.error ?? 'unknown error';
    const message = `Review run ${run.run_id} (${run.agent_name}) ${run.status}: ${errorText} — fix the cause and retry run_agent_on_pr. If the error names a missing API key or provider, ask the user to add it in DevDigest Settings → API keys.`;
    if (args.response_format === 'detailed') {
      return toolError(message, { pr_id: args.pr_id, runs: [buildRunLine(run, undefined)] });
    }
    return toolError(message);
  }

  const failedDescriptions = failedRuns
    .map((r) => `${r.agent_name}: ${r.status} — ${r.summary?.error ?? 'unknown error'}`)
    .join('; ');
  const payload = buildMultiPayload(
    args.pr_id,
    waitResult.runs,
    relevantReviews,
    page,
    total,
    args.max_findings,
    args.response_format,
  );
  return toolError(
    `${failedRuns.length} of ${waitResult.runs.length} review run(s) did not complete: ${failedDescriptions} — retry run_agent_on_pr with agent_id for each failed agent. Results from the completed runs are below.`,
    payload,
  );
}

const DESCRIPTION =
  'Run a DevDigest review agent on a PR and return its verdict and findings in one call (it waits, typically 30s–5min). Needs agent_id from list_agents, or all_agents:true. Rate-limited to 10 runs/min.';

export function registerRunAgentOnPr(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'run_agent_on_pr',
    {
      description: DESCRIPTION,
      inputSchema: runAgentOnPrInput,
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args, extra) => runAgentOnPrHandler(args, deps, extra),
  );
}
