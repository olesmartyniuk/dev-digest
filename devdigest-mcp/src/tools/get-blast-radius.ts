import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { BlastRadiusResponse } from '@devdigest/shared';
import { fromApiError, ok, ID_HINTS } from './result.js';
import type { ToolDeps } from './types.js';

export const getBlastRadiusInput = {
  pr_id: z
    .string()
    .uuid({ message: `pr_id: ${ID_HINTS['pull request']}` })
    .describe('DevDigest pull-request id'),
};

interface GetBlastRadiusArgs {
  pr_id: string;
}

export async function getBlastRadiusHandler(args: GetBlastRadiusArgs, deps: ToolDeps): Promise<CallToolResult> {
  let blast: BlastRadiusResponse;
  try {
    blast = await deps.api.getBlastRadius(args.pr_id);
  } catch (e) {
    return fromApiError(e, { entity: 'pull request', id: args.pr_id });
  }

  const payload: Record<string, unknown> = { ...blast };
  if (blast.degraded) {
    payload.note = `Repo index incomplete (${blast.degraded_reason ?? 'unknown'}) — callers may be partial and endpoints/crons unattributed; ask the user to re-sync the repo in the DevDigest UI, then call get_blast_radius again.`;
  } else if (blast.downstream.length === 0) {
    payload.note =
      'No downstream callers found for the changed symbols — the change is locally contained as far as the index knows; proceed with run_agent_on_pr or get_findings.';
  }

  return ok(payload);
}

const DESCRIPTION =
  "What else a PR could break: per changed symbol, its callers (file:line) and the HTTP endpoints / cron jobs reachable from them, read from DevDigest's repo index (no new analysis). Check degraded/degraded_reason — a degraded result may be incomplete.";

export function registerGetBlastRadius(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'get_blast_radius',
    {
      description: DESCRIPTION,
      inputSchema: getBlastRadiusInput,
      annotations: { readOnlyHint: true },
    },
    (args) => getBlastRadiusHandler(args, deps),
  );
}
