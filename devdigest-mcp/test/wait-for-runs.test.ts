import { describe, expect, it, vi } from 'vitest';
import type { RunSummary } from '@devdigest/shared';
import { DevDigestApiError } from '../src/api/client.js';
import type { DevDigestApi } from '../src/api/endpoints.js';
import { waitForRuns } from '../src/tools/wait-for-runs.js';
import type { ToolDeps } from '../src/tools/types.js';

function runSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    run_id: 'run1',
    agent_id: 'a1',
    agent_name: 'Reviewer',
    provider: 'openai',
    model: 'gpt-5',
    status: 'running',
    error: null,
    duration_ms: null,
    tokens_in: null,
    tokens_out: null,
    cost_usd: null,
    findings_count: null,
    grounding: null,
    ran_at: null,
    score: null,
    blockers: null,
    ...overrides,
  };
}

/** Fake clock: `sleep` advances it by `ms`; no real timers involved. */
function makeDeps(listRuns: DevDigestApi['listRuns'], pollIntervalMs = 3000): ToolDeps {
  const clock = { time: 0 };
  const api = { listRuns } as unknown as DevDigestApi;
  return {
    api,
    config: { pollIntervalMs } as ToolDeps['config'],
    now: () => clock.time,
    sleep: async (ms: number, signal?: AbortSignal) => {
      if (signal?.aborted) throw new Error('aborted');
      clock.time += ms;
    },
  };
}

describe('waitForRuns', () => {
  it('settles once a running target becomes done', async () => {
    let call = 0;
    const listRuns = vi.fn(async () => {
      call += 1;
      return [runSummary({ status: call < 3 ? 'running' : 'done' })];
    });
    const deps = makeDeps(listRuns);
    const result = await waitForRuns({
      prId: 'pr1',
      targets: [{ run_id: 'run1', agent_name: 'Reviewer' }],
      timeoutMs: 60_000,
      deps,
    });
    expect(result.kind).toBe('settled');
    expect(call).toBe(3);
  });

  it('settles with a mix of failed and done', async () => {
    let call = 0;
    const listRuns = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return [runSummary({ run_id: 'run1', status: 'running' }), runSummary({ run_id: 'run2', status: 'running' })];
      }
      return [
        runSummary({ run_id: 'run1', status: 'failed', error: 'boom' }),
        runSummary({ run_id: 'run2', status: 'done' }),
      ];
    });
    const deps = makeDeps(listRuns);
    const result = await waitForRuns({
      prId: 'pr1',
      targets: [
        { run_id: 'run1', agent_name: 'A' },
        { run_id: 'run2', agent_name: 'B' },
      ],
      timeoutMs: 60_000,
      deps,
    });
    expect(result.kind).toBe('settled');
    if (result.kind === 'settled') {
      const byId = new Map(result.runs.map((r) => [r.run_id, r]));
      expect(byId.get('run1')?.status).toBe('failed');
      expect(byId.get('run1')?.summary?.error).toBe('boom');
      expect(byId.get('run2')?.status).toBe('done');
    }
  });

  it('times out when the deadline passes with runs still pending', async () => {
    const listRuns = vi.fn(async () => [runSummary({ status: 'running' })]);
    const deps = makeDeps(listRuns, 3000);
    const result = await waitForRuns({
      prId: 'pr1',
      targets: [{ run_id: 'run1', agent_name: 'Reviewer' }],
      timeoutMs: 5000,
      deps,
    });
    expect(result.kind).toBe('timeout');
  });

  it('returns missing when a triggered run vanishes from /runs', async () => {
    const listRuns = vi.fn(async () => []);
    const deps = makeDeps(listRuns);
    const result = await waitForRuns({
      prId: 'pr1',
      targets: [{ run_id: 'run1', agent_name: 'Reviewer' }],
      timeoutMs: 60_000,
      deps,
    });
    expect(result.kind).toBe('missing');
  });

  it('tolerates 3 consecutive transient errors then succeeds', async () => {
    let call = 0;
    const listRuns = vi.fn(async () => {
      call += 1;
      if (call <= 3) throw new DevDigestApiError('down', 0, 'network_error');
      return [runSummary({ status: 'done' })];
    });
    const deps = makeDeps(listRuns);
    const result = await waitForRuns({
      prId: 'pr1',
      targets: [{ run_id: 'run1', agent_name: 'Reviewer' }],
      timeoutMs: 600_000,
      deps,
    });
    expect(result.kind).toBe('settled');
    expect(call).toBe(4);
  });

  it('returns poll_failed on the 4th consecutive transient error', async () => {
    const listRuns = vi.fn(async () => {
      throw new DevDigestApiError('down', 0, 'network_error');
    });
    const deps = makeDeps(listRuns);
    const result = await waitForRuns({
      prId: 'pr1',
      targets: [{ run_id: 'run1', agent_name: 'Reviewer' }],
      timeoutMs: 600_000,
      deps,
    });
    expect(result.kind).toBe('poll_failed');
    expect(listRuns).toHaveBeenCalledTimes(4);
  });

  it('returns aborted when the signal is already aborted', async () => {
    const listRuns = vi.fn(async () => [runSummary({ status: 'running' })]);
    const deps = makeDeps(listRuns);
    const controller = new AbortController();
    controller.abort();
    const result = await waitForRuns({
      prId: 'pr1',
      targets: [{ run_id: 'run1', agent_name: 'Reviewer' }],
      timeoutMs: 60_000,
      deps,
      signal: controller.signal,
    });
    expect(result.kind).toBe('aborted');
    expect(listRuns).not.toHaveBeenCalled();
  });

  it('calls onProgress with the finished/total counts', async () => {
    let call = 0;
    const listRuns = vi.fn(async () => {
      call += 1;
      return [
        runSummary({ run_id: 'run1', status: call < 2 ? 'running' : 'done' }),
        runSummary({ run_id: 'run2', status: 'running' }),
      ];
    });
    const deps = makeDeps(listRuns);
    const progressCalls: Array<[number, number]> = [];
    const result = await waitForRuns({
      prId: 'pr1',
      targets: [
        { run_id: 'run1', agent_name: 'A' },
        { run_id: 'run2', agent_name: 'B' },
      ],
      timeoutMs: 600_000,
      deps,
      onProgress: (finished, total) => {
        progressCalls.push([finished, total]);
      },
    });
    expect(result.kind).toBe('timeout'); // run2 never finishes within this test's deadline window
    expect(progressCalls.length).toBeGreaterThan(0);
    expect(progressCalls.every(([, total]) => total === 2)).toBe(true);
  });
});
