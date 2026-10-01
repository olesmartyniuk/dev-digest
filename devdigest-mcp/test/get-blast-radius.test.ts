import { describe, expect, it, vi } from 'vitest';
import type { BlastRadiusResponse } from '@devdigest/shared';
import { DevDigestApiError } from '../src/api/client.js';
import type { DevDigestApi } from '../src/api/endpoints.js';
import { getBlastRadiusHandler } from '../src/tools/get-blast-radius.js';
import type { ToolDeps } from '../src/tools/types.js';

function blastResponse(over: Partial<BlastRadiusResponse> = {}): BlastRadiusResponse {
  return {
    pr_id: 'pr1',
    changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
    downstream: [
      {
        symbol: 'rateLimit',
        callers: [{ name: 'publicRouter', file: 'b.ts', line: 23 }],
        endpoints_affected: ['GET /x'],
        crons_affected: [],
      },
    ],
    summary: '1 changed symbol · 1 caller · 1 endpoint · 0 cron jobs',
    degraded: false,
    degraded_reason: null,
    ...over,
  };
}

function deps(getBlastRadius: DevDigestApi['getBlastRadius']): ToolDeps {
  const api = { getBlastRadius } as unknown as DevDigestApi;
  return { api, config: {} as ToolDeps['config'], sleep: vi.fn(), now: () => 0 };
}

function payload(result: Awaited<ReturnType<typeof getBlastRadiusHandler>>): Record<string, unknown> {
  const first = result.content[0];
  return JSON.parse(first && 'text' in first ? (first.text as string) : '{}');
}

describe('getBlastRadiusHandler', () => {
  it('passes pr_id through and returns the payload with no note when non-degraded with downstream', async () => {
    const getBlastRadius = vi.fn(async () => blastResponse());
    const p = payload(await getBlastRadiusHandler({ pr_id: 'pr1' }, deps(getBlastRadius)));
    expect(getBlastRadius).toHaveBeenCalledWith('pr1');
    expect(p.pr_id).toBe('pr1');
    expect(p.downstream).toHaveLength(1);
    expect(p.note).toBeUndefined();
  });

  it('degraded → note tells the caller to re-sync', async () => {
    const p = payload(
      await getBlastRadiusHandler(
        { pr_id: 'pr1' },
        deps(async () => blastResponse({ degraded: true, degraded_reason: 'no_data' })),
      ),
    );
    expect(p.note).toMatch(/re-sync/);
  });

  it('empty non-degraded → note says no downstream callers', async () => {
    const p = payload(
      await getBlastRadiusHandler(
        { pr_id: 'pr1' },
        deps(async () => blastResponse({ downstream: [] })),
      ),
    );
    expect(p.note).toMatch(/No downstream callers/);
  });

  it('a 404 gives isError with the "not the GitHub PR number" hint', async () => {
    const d = deps(async () => {
      throw new DevDigestApiError('Pull request not found', 404);
    });
    const result = await getBlastRadiusHandler({ pr_id: '00000000-0000-0000-0000-000000000000' }, d);
    expect(result.isError).toBe(true);
    const first = result.content[0];
    const text = first && 'text' in first ? (first.text as string) : '';
    expect(text).toContain('not the GitHub PR number');
  });
});
