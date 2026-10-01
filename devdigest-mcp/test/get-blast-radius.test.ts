import { describe, expect, it, vi } from 'vitest';
import type { DevDigestApi } from '../src/api/endpoints.js';
import { getBlastRadiusHandler } from '../src/tools/get-blast-radius.js';
import type { ToolDeps } from '../src/tools/types.js';

describe('getBlastRadiusHandler', () => {
  it('makes no DevDigestApi call and returns a [MOCK] summary', async () => {
    const api = new Proxy(
      {},
      {
        get() {
          throw new Error('DevDigestApi must not be called by the blast-radius mock');
        },
      },
    ) as unknown as DevDigestApi;
    const deps: ToolDeps = { api, config: {} as ToolDeps['config'], sleep: vi.fn(), now: () => 0 };

    const result = await getBlastRadiusHandler({ pr_id: '00000000-0000-0000-0000-000000000000' }, deps);
    const first = result.content[0];
    const text = first && 'text' in first ? (first.text as string) : '';
    const payload = JSON.parse(text);
    expect(payload.summary).toMatch(/^\[MOCK\]/);
    expect(payload).toHaveProperty('changed_symbols');
    expect(payload).toHaveProperty('downstream');
  });
});
