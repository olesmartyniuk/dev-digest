import { describe, expect, it } from 'vitest';
import { DevDigestApiError } from '../src/api/client.js';
import { fromApiError, paginate, toolError } from '../src/tools/result.js';

function text(result: ReturnType<typeof fromApiError>): string {
  const first = result.content[0];
  return first && 'text' in first ? (first.text as string) : '';
}

function expectNextStep(message: string) {
  const idx = message.indexOf(' — ');
  expect(idx).toBeGreaterThan(-1);
  expect(message.slice(idx + 3).trim().length).toBeGreaterThan(0);
}

describe('fromApiError', () => {
  it('status 0 passes through the network message verbatim', () => {
    const e = new DevDigestApiError(
      'DevDigest API unreachable at http://localhost:3001 — start it with ./scripts/dev.sh, then retry.',
      0,
      'network_error',
    );
    const result = fromApiError(e, { entity: 'pull request', id: 'x' });
    expect(result.isError).toBe(true);
    expectNextStep(text(result));
  });

  it('404 on an agent names list_agents', () => {
    const e = new DevDigestApiError('Agent not found', 404);
    const result = fromApiError(e, { entity: 'agent', id: 'abc' });
    expectNextStep(text(result));
    expect(text(result)).toContain('list_agents');
  });

  it('404 on a pull request mentions the GitHub PR number hint', () => {
    const e = new DevDigestApiError('Pull request not found', 404);
    const result = fromApiError(e, { entity: 'pull request', id: 'abc' });
    expectNextStep(text(result));
    expect(text(result)).toContain('not the GitHub PR number');
  });

  it('422 names the invalid id', () => {
    const e = new DevDigestApiError('invalid', 422);
    const result = fromApiError(e, { entity: 'repo', id: 'not-a-uuid' });
    expectNextStep(text(result));
    expect(text(result)).toContain('not-a-uuid');
  });

  it('429 names the rate limit and retry', () => {
    const e = new DevDigestApiError('Too Many Requests', 429);
    const result = fromApiError(e, { entity: 'pull request', id: 'x' });
    expectNextStep(text(result));
    expect(text(result)).toContain('run_agent_on_pr');
  });

  it('400 invalid_run_request names the two valid modes', () => {
    const e = new DevDigestApiError('Provide agentId or all:true', 400, 'invalid_run_request');
    const result = fromApiError(e, { entity: 'pull request', id: 'x' });
    expectNextStep(text(result));
    expect(text(result)).toContain('agent_id');
  });

  it('other 4xx points at the input schema', () => {
    const e = new DevDigestApiError('Nothing to update', 400, 'bad_request');
    const result = fromApiError(e, { entity: 'repo', id: 'x' });
    expectNextStep(text(result));
  });

  it('5xx points at the API log', () => {
    const e = new DevDigestApiError('Internal error', 500, 'internal_error');
    const result = fromApiError(e, { entity: 'repo', id: 'x' });
    expectNextStep(text(result));
    expect(text(result)).toContain('./scripts/dev.sh');
  });

  it('unknown errors get a generic retry message', () => {
    const result = fromApiError(new Error('boom'), { entity: 'agent', id: 'x' });
    expectNextStep(text(result));
    expect(text(result)).toContain('boom');
  });
});

describe('toolError', () => {
  it('attaches extra as JSON when provided', () => {
    const result = toolError('failed', { a: 1 });
    expect(text(result)).toContain('{"a":1}');
  });
});

describe('paginate', () => {
  it('returns next_offset null on the last page', () => {
    const { page, total, next_offset } = paginate([1, 2, 3], 0, 2);
    expect(page).toEqual([1, 2]);
    expect(total).toBe(3);
    expect(next_offset).toBe(2);

    const last = paginate([1, 2, 3], 2, 2);
    expect(last.page).toEqual([3]);
    expect(last.next_offset).toBeNull();
  });

  it('returns an empty page for an offset past the end', () => {
    const result = paginate([1, 2, 3], 10, 2);
    expect(result.page).toEqual([]);
    expect(result.next_offset).toBeNull();
    expect(result.total).toBe(3);
  });
});
