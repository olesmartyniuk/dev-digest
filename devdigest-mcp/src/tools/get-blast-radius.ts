import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BLAST_RADIUS_MOCK } from '../fixtures/blast-radius.mock.js';
import { ok, ID_HINTS } from './result.js';
import type { ToolDeps } from './types.js';

export const getBlastRadiusInput = {
  pr_id: z
    .string()
    .uuid({ message: `pr_id: ${ID_HINTS['pull request']}` })
    .describe('DevDigest pull-request id'),
  changed_files: z.array(z.string()).max(200).optional().describe('Ignored by the mock'),
};

interface GetBlastRadiusArgs {
  pr_id: string;
  changed_files?: string[];
}

export async function getBlastRadiusHandler(_args: GetBlastRadiusArgs, _deps: ToolDeps): Promise<CallToolResult> {
  // No HTTP call: the mock never touches the DevDigestApi or network.
  return ok(BLAST_RADIUS_MOCK);
}

const DESCRIPTION =
  'MOCK — returns a fixed sample, not real analysis. Real blast-radius analysis (wiring repo-intel\'s call graph through a dedicated endpoint) is not implemented yet; treat the output as illustrative only, never as input to a review decision.';

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
