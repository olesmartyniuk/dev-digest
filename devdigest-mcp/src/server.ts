import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpConfig } from './config.js';
import { createHttpClient } from './api/client.js';
import { createDevDigestApi } from './api/endpoints.js';
import type { ToolDeps } from './tools/types.js';
import { registerListAgents } from './tools/list-agents.js';
import { registerGetFindings } from './tools/get-findings.js';
import { registerRunAgentOnPr } from './tools/run-agent-on-pr.js';
import { registerGetConventions } from './tools/get-conventions.js';
import { registerGetBlastRadius } from './tools/get-blast-radius.js';

export const SERVER_INFO = { name: 'devdigest', version: '0.0.0' } as const;

const INSTRUCTIONS = [
  'DevDigest exposes agents, PR reviews, findings and conventions for a locally running DevDigest API.',
  'Every id (pr_id, repo_id, agent_id, run_id) is a DevDigest uuid — a GitHub PR number is not a valid pr_id.',
  'The usual order is list_agents -> run_agent_on_pr, which already waits and returns the verdict and findings in one call; call get_findings only to page further or re-read a past review later.',
  "get_blast_radius reads the repo index DevDigest built at clone time; if its result says degraded, treat it as possibly incomplete.",
].join(' ');

/** Abortable sleep: resolves after `ms`, or rejects immediately if `signal` aborts first or mid-wait. */
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new Error('aborted'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function defaultDeps(config: McpConfig): ToolDeps {
  const http = createHttpClient(config);
  const api = createDevDigestApi(http);
  return {
    api,
    config,
    sleep: abortableSleep,
    now: () => Date.now(),
  };
}

export function createServer(deps: ToolDeps): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });

  registerListAgents(server, deps);
  registerRunAgentOnPr(server, deps);
  registerGetFindings(server, deps);
  registerGetConventions(server, deps);
  registerGetBlastRadius(server, deps);

  return server;
}
