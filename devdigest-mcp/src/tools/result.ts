import { z } from 'zod/v4';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { DevDigestApiError } from '../api/client.js';
import { RESPONSE_FORMATS } from './enums.js';

export type Entity = 'pull request' | 'repo' | 'agent';

export function ok(payload: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

export function toolError(message: string, extra?: unknown): CallToolResult {
  const text = extra !== undefined ? `${message}\n${JSON.stringify(extra)}` : message;
  return { isError: true, content: [{ type: 'text', text }] };
}

export function paginate<T>(
  items: T[],
  offset: number,
  limit: number,
): { page: T[]; total: number; next_offset: number | null } {
  const total = items.length;
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  const next_offset = page.length > 0 && nextOffset < total ? nextOffset : null;
  return { page, total, next_offset };
}

export const responseFormatParam = z
  .enum(RESPONSE_FORMATS)
  .default('concise')
  .describe(
    'concise (default): verdict + findings, minimal fields; detailed: adds ids, run bookkeeping and long text',
  );

/** Principle-4 id hints: the "next step" half of every id error. */
export const ID_HINTS: Record<Entity, string> = {
  agent: "call list_agents and use an agent's id as agent_id",
  'pull request':
    'pr_id must be the DevDigest PR uuid, not the GitHub PR number — ask the user for it (DevDigest UI: Repos → Pull requests)',
  repo: 'repo_id must be the DevDigest repo uuid (a PR id will not work) — ask the user for it (DevDigest UI: Repos)',
};

function capitalize(entity: Entity): string {
  return entity.charAt(0).toUpperCase() + entity.slice(1);
}

export function fromApiError(e: unknown, ctx: { entity: Entity; id: string }): CallToolResult {
  if (!(e instanceof DevDigestApiError)) {
    const message = e instanceof Error ? e.message : String(e);
    return toolError(
      `Unexpected devdigest-mcp error: ${message} — retry once; if it repeats, stop and report it to the user.`,
    );
  }

  const { entity, id } = ctx;

  if (e.status === 0) {
    return toolError(e.message);
  }
  if (e.status === 404) {
    return toolError(`${capitalize(entity)} ${id} not found — ${ID_HINTS[entity]}.`);
  }
  if (e.status === 422) {
    return toolError(`${id} is not a valid DevDigest ${entity} id — ${ID_HINTS[entity]}.`);
  }
  if (e.status === 429) {
    return toolError(
      'DevDigest rate limit hit (review runs are capped at 10/minute) — wait about 60s, then retry run_agent_on_pr with the same arguments.',
    );
  }
  if (e.status === 400 && e.code === 'invalid_run_request') {
    return toolError(
      'Invalid run request — pass exactly one of agent_id (from list_agents) or all_agents:true.',
    );
  }
  if (e.status >= 400 && e.status < 500) {
    return toolError(
      `DevDigest API rejected the request (${e.status} ${e.code ?? 'error'}: ${e.message}) — check the arguments against this tool's input schema and retry.`,
    );
  }
  return toolError(
    `DevDigest API failed (${e.status} ${e.code ?? 'error'}: ${e.message}) — retry once; if it repeats, tell the user to check the API log in the ./scripts/dev.sh terminal.`,
  );
}
