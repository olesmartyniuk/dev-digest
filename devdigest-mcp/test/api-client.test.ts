import { describe, expect, it, vi } from 'vitest';
import { createHttpClient, DevDigestApiError } from '../src/api/client.js';

const CFG = { apiBase: 'http://localhost:3001', requestTimeoutMs: 5_000 };

function jsonResponse(status: number, body: unknown, statusText = ''): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createHttpClient', () => {
  it('(a) parses the error envelope on a 404', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(404, { error: { code: 'not_found', message: 'Agent not found' } }),
    );
    const client = createHttpClient(CFG, fetchImpl as unknown as typeof fetch);

    await expect(client.get('/agents/x')).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'Agent not found',
    });
    await expect(client.get('/agents/x')).rejects.toBeInstanceOf(DevDigestApiError);
  });

  it('(b) turns a rejected fetch into a network_error with the recovery hint', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const client = createHttpClient(CFG, fetchImpl as unknown as typeof fetch);

    await expect(client.get('/agents')).rejects.toMatchObject({ status: 0, code: 'network_error' });
    try {
      await client.get('/agents');
      throw new Error('expected rejection');
    } catch (e) {
      expect((e as Error).message).toContain('./scripts/dev.sh');
    }
  });

  it('(c) sets content-type only when a body is sent', async () => {
    const calls: RequestInit[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push(init ?? {});
      return jsonResponse(200, { ok: true });
    });
    const client = createHttpClient(CFG, fetchImpl as unknown as typeof fetch);

    await client.post('/pulls/1/review', { agentId: 'a' });
    await client.get('/agents');

    expect((calls[0]?.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect((calls[1]?.headers as Record<string, string> | undefined)?.['content-type']).toBeUndefined();
  });

  it('(d) falls back to "<status> <statusText>" for a non-JSON body', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>oops</html>', { status: 422, statusText: 'Unprocessable Entity' }));
    const client = createHttpClient(CFG, fetchImpl as unknown as typeof fetch);

    await expect(client.get('/pulls/x/runs')).rejects.toMatchObject({
      status: 422,
      message: '422 Unprocessable Entity',
    });
  });
});
