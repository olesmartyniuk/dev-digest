import { describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { DevDigestApi } from '../src/api/endpoints.js';
import { createServer } from '../src/server.js';
import type { ToolDeps } from '../src/tools/types.js';

function fakeDeps(): ToolDeps {
  const api: DevDigestApi = {
    listAgents: vi.fn(async () => []),
    triggerReview: vi.fn(async () => ({ pr_id: 'pr1', runs: [], reviews: [] })),
    listRuns: vi.fn(async () => []),
    listReviews: vi.fn(async () => []),
    listConventions: vi.fn(async () => []),
  };
  return {
    api,
    config: {
      apiBase: 'http://localhost:3001',
      requestTimeoutMs: 15_000,
      pollIntervalMs: 3_000,
      defaultRunTimeoutMs: 300_000,
    },
    sleep: vi.fn(async () => {}),
    now: () => 0,
  };
}

async function connect() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer(fakeDeps());
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

interface JsonSchemaProp {
  type?: string;
  items?: { type?: string };
}

describe('devdigest-mcp server', () => {
  it('lists exactly the 5 tools, each with an inputSchema', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['get_blast_radius', 'get_conventions', 'get_findings', 'list_agents', 'run_agent_on_pr'].sort(),
    );
    for (const tool of tools) {
      expect(tool.inputSchema).toBeDefined();
    }
  });

  it('M9: no tool input property is an object, and no array has object items', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    for (const tool of tools) {
      const properties = (tool.inputSchema as { properties?: Record<string, JsonSchemaProp> }).properties ?? {};
      for (const [name, prop] of Object.entries(properties)) {
        expect(prop.type, `${tool.name}.${name}`).not.toBe('object');
        if (prop.type === 'array') {
          expect(prop.items?.type, `${tool.name}.${name}.items`).not.toBe('object');
        }
      }
    }
  });

  it('get_blast_radius returns the mock', async () => {
    const { client } = await connect();
    const result = await client.callTool({
      name: 'get_blast_radius',
      arguments: { pr_id: '00000000-0000-0000-0000-000000000000' },
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const payload = JSON.parse(content[0]?.text ?? '{}');
    expect(payload.summary).toMatch(/^\[MOCK\]/);
  });

  it('get_findings with an invalid pr_id surfaces the GitHub-PR-number hint', async () => {
    const { client } = await connect();
    let surfacedText = '';
    try {
      const result = await client.callTool({ name: 'get_findings', arguments: { pr_id: 'abc' } });
      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text?: string }>;
      surfacedText = content[0]?.text ?? '';
    } catch (e) {
      // Some SDK versions surface input-validation failures as a protocol error.
      surfacedText = e instanceof Error ? e.message : String(e);
    }
    expect(surfacedText).toContain('not the GitHub PR number');
  });
});
