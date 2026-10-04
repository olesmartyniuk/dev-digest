import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Convention } from '@devdigest/shared';
import { CONVENTION_STATUSES, CONVENTION_CATEGORIES } from './enums.js';
import type { LocalConventionStatus, LocalConventionCategory, ResponseFormat } from './enums.js';
import { responseFormatParam, fromApiError, ok, paginate, ID_HINTS } from './result.js';
import type { ToolDeps } from './types.js';

export const getConventionsInput = {
  repo_id: z
    .string()
    .uuid({ message: `repo_id: ${ID_HINTS.repo}` })
    .describe('DevDigest repo id (uuid). Conventions are per repo, not per PR.'),
  status: z.enum(CONVENTION_STATUSES).optional().describe('accepted = house rules a human approved; omit for all'),
  category: z.enum(CONVENTION_CATEGORIES).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  response_format: responseFormatParam,
};

interface GetConventionsArgs {
  repo_id: string;
  status?: LocalConventionStatus;
  category?: LocalConventionCategory;
  limit: number;
  offset: number;
  response_format: ResponseFormat;
}

function projectConvention(c: Convention, format: ResponseFormat): Record<string, unknown> {
  if (format === 'detailed') {
    return {
      id: c.id,
      category: c.category,
      rule: c.rule,
      status: c.status,
      confidence: c.confidence,
      origin: c.origin,
      rationale: c.rationale,
      evidence: c.evidence,
      created_at: c.created_at,
    };
  }
  return { category: c.category, rule: c.rule, status: c.status, confidence: c.confidence };
}

export async function getConventionsHandler(args: GetConventionsArgs, deps: ToolDeps): Promise<CallToolResult> {
  let conventions: Convention[];
  try {
    conventions = await deps.api.listConventions(args.repo_id);
  } catch (e) {
    return fromApiError(e, { entity: 'repo', id: args.repo_id });
  }

  if (conventions.length === 0) {
    return ok({
      repo_id: args.repo_id,
      total: 0,
      next_offset: null,
      conventions: [],
      note:
        'No conventions extracted yet for this repo — extraction runs from the DevDigest UI (repo → Conventions page); ask the user to run it, then call get_conventions again.',
    });
  }

  const filtered = conventions
    .filter((c) => !args.status || c.status === args.status)
    .filter((c) => !args.category || c.category === args.category)
    .sort((a, b) => {
      const byAccepted = Number(b.status === 'accepted') - Number(a.status === 'accepted');
      if (byAccepted !== 0) return byAccepted;
      return b.confidence - a.confidence;
    });

  const { page, total, next_offset } = paginate(filtered, args.offset, args.limit);
  const projected = page.map((c) => projectConvention(c, args.response_format));

  const payload: Record<string, unknown> =
    args.response_format === 'detailed'
      ? { repo_id: args.repo_id, total, offset: args.offset, next_offset, conventions: projected }
      : { repo_id: args.repo_id, total, next_offset, conventions: projected };

  if (filtered.length === 0) {
    payload.note = `No conventions match status/category (${conventions.length} in this repo without the filters) — drop status or category.`;
  }

  return ok(payload);
}

const DESCRIPTION =
  'House coding conventions DevDigest extracted for a repo. Filter by status/category; paginate with offset/limit.';

export function registerGetConventions(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'get_conventions',
    {
      description: DESCRIPTION,
      inputSchema: getConventionsInput,
      annotations: { readOnlyHint: true },
    },
    (args) => getConventionsHandler(args, deps),
  );
}
