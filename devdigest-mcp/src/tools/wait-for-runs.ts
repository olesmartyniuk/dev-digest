import type { RunSummary } from '@devdigest/shared';
import { DevDigestApiError } from '../api/client.js';
import type { ToolDeps } from './types.js';

export type RunOutcome = {
  run_id: string;
  agent_name: string;
  status: 'done' | 'failed' | 'cancelled' | 'running' | 'missing';
  summary?: RunSummary;
};

export type WaitResult =
  | { kind: 'settled'; runs: RunOutcome[] } // every target is done|failed|cancelled
  | { kind: 'timeout'; runs: RunOutcome[]; waitedMs: number }
  | { kind: 'aborted'; runs: RunOutcome[] }
  | { kind: 'missing'; runs: RunOutcome[] } // a triggered run_id vanished from /runs
  | { kind: 'poll_failed'; runs: RunOutcome[]; error: unknown };

const TERMINAL = new Set<RunOutcome['status']>(['done', 'failed', 'cancelled']);

function classify(
  targets: { run_id: string; agent_name: string }[],
  byId: Map<string, RunSummary>,
): RunOutcome[] {
  return targets.map((t) => {
    const summary = byId.get(t.run_id);
    if (!summary) return { run_id: t.run_id, agent_name: t.agent_name, status: 'missing' as const };
    const status = summary.status;
    if (status === 'done') return { run_id: t.run_id, agent_name: t.agent_name, status: 'done' as const, summary };
    if (status === 'failed' || status === 'cancelled') {
      return { run_id: t.run_id, agent_name: t.agent_name, status: status as 'failed' | 'cancelled', summary };
    }
    // 'running', null, or any other string: still pending.
    return { run_id: t.run_id, agent_name: t.agent_name, status: 'running' as const, summary };
  });
}

export async function waitForRuns(opts: {
  prId: string;
  targets: { run_id: string; agent_name: string }[];
  timeoutMs: number;
  deps: ToolDeps;
  signal?: AbortSignal;
  onProgress?: (finished: number, total: number) => Promise<void> | void;
}): Promise<WaitResult> {
  const { prId, targets, timeoutMs, deps, signal, onProgress } = opts;
  const deadline = deps.now() + timeoutMs;
  let consecutiveTransientErrors = 0;
  let lastRuns: RunOutcome[] = targets.map((t) => ({ run_id: t.run_id, agent_name: t.agent_name, status: 'running' }));

  while (true) {
    if (signal?.aborted) return { kind: 'aborted', runs: lastRuns };

    try {
      await deps.sleep(deps.config.pollIntervalMs, signal);
    } catch {
      // deps.sleep may reject on abort instead of resolving early.
      return { kind: 'aborted', runs: lastRuns };
    }

    if (signal?.aborted) return { kind: 'aborted', runs: lastRuns };

    let runs: RunSummary[];
    try {
      runs = await deps.api.listRuns(prId);
      consecutiveTransientErrors = 0;
    } catch (e) {
      const transient = e instanceof DevDigestApiError && (e.status === 0 || e.status >= 500);
      if (transient) {
        consecutiveTransientErrors += 1;
        if (consecutiveTransientErrors < 4) {
          if (deps.now() >= deadline) return { kind: 'timeout', runs: lastRuns, waitedMs: timeoutMs };
          continue;
        }
        return { kind: 'poll_failed', runs: lastRuns, error: e };
      }
      return { kind: 'poll_failed', runs: lastRuns, error: e };
    }

    const byId = new Map(runs.map((r) => [r.run_id, r] as const));
    const classified = classify(targets, byId);
    lastRuns = classified;

    if (classified.some((r) => r.status === 'missing')) {
      return { kind: 'missing', runs: classified };
    }

    const terminalCount = classified.filter((r) => TERMINAL.has(r.status)).length;
    if (terminalCount === classified.length) {
      return { kind: 'settled', runs: classified };
    }

    await onProgress?.(terminalCount, classified.length);

    if (deps.now() >= deadline) {
      return { kind: 'timeout', runs: classified, waitedMs: timeoutMs };
    }
  }
}
