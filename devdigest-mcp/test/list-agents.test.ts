import { describe, expect, it, vi } from 'vitest';
import type { Agent } from '@devdigest/shared';
import { DevDigestApiError } from '../src/api/client.js';
import type { DevDigestApi } from '../src/api/endpoints.js';
import { listAgentsHandler } from '../src/tools/list-agents.js';
import type { ToolDeps } from '../src/tools/types.js';

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'a1',
    name: 'Reviewer',
    description: 'desc',
    provider: 'openai',
    model: 'gpt-5',
    system_prompt: 'secret prompt',
    output_schema: { type: 'object' },
    enabled: true,
    version: 1,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    repo_intel: true,
    ...overrides,
  };
}

function deps(listAgents: DevDigestApi['listAgents']): ToolDeps {
  const api = { listAgents } as unknown as DevDigestApi;
  return { api, config: {} as ToolDeps['config'], sleep: vi.fn(), now: () => 0 };
}

function text(result: Awaited<ReturnType<typeof listAgentsHandler>>): string {
  const first = result.content[0];
  return first && 'text' in first ? (first.text as string) : '';
}

describe('listAgentsHandler', () => {
  it('concise omits system_prompt/output_schema; detailed includes them', async () => {
    const d = deps(async () => [agent()]);

    const concise = await listAgentsHandler({ enabled_only: false, response_format: 'concise' }, d);
    const concisePayload = JSON.parse(text(concise));
    expect(concisePayload.agents[0]).not.toHaveProperty('system_prompt');
    expect(concisePayload.agents[0]).not.toHaveProperty('output_schema');
    expect(concisePayload.agents[0]).toEqual({
      id: 'a1',
      name: 'Reviewer',
      description: 'desc',
      provider: 'openai',
      model: 'gpt-5',
      enabled: true,
    });

    const detailed = await listAgentsHandler({ enabled_only: false, response_format: 'detailed' }, d);
    const detailedPayload = JSON.parse(text(detailed));
    expect(detailedPayload.agents[0]).toHaveProperty('system_prompt');
    expect(detailedPayload.agents[0]).toHaveProperty('output_schema');
  });

  it('enabled_only filters, and notes when it filters to zero', async () => {
    const d = deps(async () => [agent({ id: 'a1', enabled: false })]);
    const result = await listAgentsHandler({ enabled_only: true, response_format: 'concise' }, d);
    const payload = JSON.parse(text(result));
    expect(payload.agents).toEqual([]);
    expect(payload.note).toContain('No enabled agents');
  });

  it('notes when there are zero agents at all', async () => {
    const d = deps(async () => []);
    const result = await listAgentsHandler({ enabled_only: false, response_format: 'concise' }, d);
    const payload = JSON.parse(text(result));
    expect(payload.agents).toEqual([]);
    expect(payload.note).toContain('No agents configured');
  });

  it('a network error gives isError: true', async () => {
    const d = deps(async () => {
      throw new DevDigestApiError('unreachable', 0, 'network_error');
    });
    const result = await listAgentsHandler({ enabled_only: false, response_format: 'concise' }, d);
    expect(result.isError).toBe(true);
  });
});
