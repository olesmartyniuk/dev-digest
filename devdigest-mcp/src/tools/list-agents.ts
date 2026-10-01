import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { responseFormatParam, fromApiError, ok } from './result.js';
import type { ResponseFormat } from './enums.js';
import type { ToolDeps } from './types.js';

export const listAgentsInput = {
  enabled_only: z.boolean().default(false).describe('Only agents that run in "all agents" mode'),
  response_format: responseFormatParam,
};

const DESCRIPTION = 'List DevDigest review agents. Use an agent\'s id as agent_id in run_agent_on_pr.';

export async function listAgentsHandler(
  args: { enabled_only: boolean; response_format: ResponseFormat },
  deps: ToolDeps,
): Promise<CallToolResult> {
  let agents;
  try {
    agents = await deps.api.listAgents();
  } catch (e) {
    return fromApiError(e, { entity: 'agent', id: '' });
  }

  const filtered = args.enabled_only ? agents.filter((a) => a.enabled) : agents;

  if (agents.length === 0) {
    return ok({
      agents: [],
      note: 'No agents configured — ask the user to create one in the DevDigest UI (Agents page).',
    });
  }
  if (args.enabled_only && filtered.length === 0) {
    return ok({
      agents: [],
      note: 'No enabled agents — call list_agents without enabled_only and pass one as agent_id to run_agent_on_pr.',
    });
  }

  const projected =
    args.response_format === 'detailed'
      ? filtered
      : filtered.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          provider: a.provider,
          model: a.model,
          enabled: a.enabled,
        }));

  return ok({ agents: projected });
}

export function registerListAgents(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'list_agents',
    {
      description: DESCRIPTION,
      inputSchema: listAgentsInput,
      annotations: { readOnlyHint: true },
    },
    (args) => listAgentsHandler(args, deps),
  );
}
