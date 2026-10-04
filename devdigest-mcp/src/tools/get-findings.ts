import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ReviewRecord, Severity } from '@devdigest/shared';
import { SEVERITIES, SEVERITY_RANK } from './enums.js';
import type { ResponseFormat } from './enums.js';
import { responseFormatParam, fromApiError, ok, paginate, ID_HINTS } from './result.js';
import type { ToolDeps } from './types.js';

export const getFindingsInput = {
  pr_id: z
    .string()
    .uuid({ message: `pr_id: ${ID_HINTS['pull request']}` })
    .describe('DevDigest pull-request id (uuid, not the GitHub PR number)'),
  run_id: z.string().min(1).optional().describe('Only findings from this review run'),
  agent_id: z.string().min(1).optional().describe('Only findings from this agent (id from list_agents)'),
  severity: z.array(z.enum(SEVERITIES)).min(1).optional().describe('e.g. ["CRITICAL","WARNING"]'),
  include_dismissed: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).default(0),
  response_format: responseFormatParam,
};

/** A finding flattened out of its parent review, with the review's run/agent attached. */
export type ProjectableFinding = ReviewRecord['findings'][number] & {
  run_id: string | null;
  agent_name: string | null | undefined;
};

export interface FindingFilter {
  runIds?: string[];
  agentId?: string;
  severity?: Severity[];
  includeDismissed: boolean;
}

export type FindingOmit = 'agent_name' | 'run_id';

/** Flatten reviews[].findings, filter, and sort most-severe-first. */
export function selectFindings(reviews: ReviewRecord[], f: FindingFilter): ProjectableFinding[] {
  const runIdSet = f.runIds ? new Set(f.runIds) : undefined;
  const severitySet = f.severity ? new Set(f.severity) : undefined;
  const out: ProjectableFinding[] = [];

  for (const review of reviews) {
    if (runIdSet && !(review.run_id !== null && runIdSet.has(review.run_id))) continue;
    if (f.agentId && review.agent_id !== f.agentId) continue;
    for (const finding of review.findings) {
      if (!f.includeDismissed && finding.dismissed_at !== null) continue;
      if (severitySet && !severitySet.has(finding.severity)) continue;
      out.push({ ...finding, run_id: review.run_id, agent_name: review.agent_name });
    }
  }

  out.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    const byFile = a.file.localeCompare(b.file);
    if (byFile !== 0) return byFile;
    return a.start_line - b.start_line;
  });

  return out;
}

const DETAILED_EXTRA_KEYS = [
  'id',
  'review_id',
  'rationale',
  'suggestion',
  'kind',
  'accepted_at',
  'dismissed_at',
  'trifecta_components',
  'evidence',
] as const;

export function projectFinding(
  x: ProjectableFinding,
  format: ResponseFormat,
  omit?: readonly FindingOmit[],
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    severity: x.severity,
    category: x.category,
    title: x.title,
    file: x.file,
    start_line: x.start_line,
    end_line: x.end_line,
    confidence: x.confidence,
    agent_name: x.agent_name,
    run_id: x.run_id,
  };

  if (format === 'detailed') {
    for (const key of DETAILED_EXTRA_KEYS) {
      base[key] = (x as Record<string, unknown>)[key];
    }
    return base;
  }

  if (omit) {
    for (const key of omit) delete base[key];
  }
  return base;
}

export function countKeptFindings(review: ReviewRecord): number {
  return review.findings.filter((f) => f.dismissed_at === null).length;
}

export function summarizeReviews(reviews: ReviewRecord[], format: ResponseFormat): Record<string, unknown>[] {
  return reviews.map((r) => {
    const findings_count = countKeptFindings(r);
    if (format === 'detailed') {
      return {
        review_id: r.id,
        run_id: r.run_id,
        agent_name: r.agent_name,
        verdict: r.verdict,
        score: r.score,
        findings_count,
        created_at: r.created_at,
        summary: r.summary,
        model: r.model,
        grounding: r.grounding,
      };
    }
    return {
      run_id: r.run_id,
      agent_name: r.agent_name,
      verdict: r.verdict,
      score: r.score,
      findings_count,
    };
  });
}

interface GetFindingsArgs {
  pr_id: string;
  run_id?: string;
  agent_id?: string;
  severity?: Severity[];
  include_dismissed: boolean;
  limit: number;
  offset: number;
  response_format: ResponseFormat;
}

export async function getFindingsHandler(args: GetFindingsArgs, deps: ToolDeps): Promise<CallToolResult> {
  let reviews: ReviewRecord[];
  try {
    reviews = await deps.api.listReviews(args.pr_id);
  } catch (e) {
    return fromApiError(e, { entity: 'pull request', id: args.pr_id });
  }

  if (reviews.length === 0) {
    return ok({
      pr_id: args.pr_id,
      results: [],
      total: 0,
      next_offset: null,
      findings: [],
      note: 'No reviews yet for this PR — call run_agent_on_pr with this pr_id and an agent_id from list_agents.',
    });
  }

  const runIdProvided = args.run_id !== undefined;
  const matchesAgent = (r: ReviewRecord) => !args.agent_id || r.agent_id === args.agent_id;
  const matchesRunAndAgent = (r: ReviewRecord) => (!runIdProvided || r.run_id === args.run_id) && matchesAgent(r);
  const runMatchedAny = !runIdProvided || reviews.some((r) => r.run_id === args.run_id);

  const reviewsForResults = runMatchedAny ? reviews.filter(matchesRunAndAgent) : reviews.filter(matchesAgent);

  const filter: FindingFilter = {
    ...(runIdProvided ? { runIds: [args.run_id as string] } : {}),
    ...(args.agent_id ? { agentId: args.agent_id } : {}),
    ...(args.severity ? { severity: args.severity } : {}),
    includeDismissed: args.include_dismissed,
  };
  const selected = selectFindings(reviews, filter);
  const { page, total, next_offset } = paginate(selected, args.offset, args.limit);

  let note: string | undefined;
  if (!runMatchedAny) {
    note = `No review for run_id ${args.run_id} on this PR — omit run_id, or use a run_id from results.`;
  } else if (selected.length === 0) {
    const baselineTotal = selectFindings(reviews, { includeDismissed: args.include_dismissed }).length;
    note = `No findings match these filters (${baselineTotal} findings on this PR without them) — drop severity/run_id/agent_id or set include_dismissed:true.`;
  }

  const projectedFindings = page.map((x) => projectFinding(x, args.response_format));

  const payload: Record<string, unknown> =
    args.response_format === 'detailed'
      ? {
          pr_id: args.pr_id,
          reviews: summarizeReviews(reviewsForResults, 'detailed'),
          total,
          offset: args.offset,
          next_offset,
          findings: projectedFindings,
        }
      : {
          pr_id: args.pr_id,
          results: summarizeReviews(reviewsForResults, 'concise'),
          total,
          next_offset,
          findings: projectedFindings,
        };

  if (note) payload.note = note;

  return ok(payload);
}

const DESCRIPTION =
  'Findings from DevDigest reviews of a PR, most severe first. Filter by run, agent or severity; paginate with offset/limit.';

export function registerGetFindings(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'get_findings',
    {
      description: DESCRIPTION,
      inputSchema: getFindingsInput,
      annotations: { readOnlyHint: true },
    },
    (args) => getFindingsHandler(args, deps),
  );
}
