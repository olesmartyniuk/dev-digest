/* Pure helpers for the agent-picker estimate display (AC-9/11, D16). */
import type { AgentRunEstimate } from "@devdigest/shared";

export function estimateFor(
  estimates: AgentRunEstimate[] | undefined,
  agentId: string,
): AgentRunEstimate | undefined {
  return estimates?.find((e) => e.agent_id === agentId);
}

export interface FooterEstimate {
  durationMs: number | null;
  costUsd: number | null;
  durationIncomplete: boolean;
  costIncomplete: boolean;
}

/** Wall-clock = max of known durations (parallel); cost = sum of known costs.
 *  A `*Incomplete` flag is set when any ticked agent's value is unknown. */
export function footerEstimate(ticked: Array<AgentRunEstimate | undefined>): FooterEstimate {
  const durations = ticked.map((e) => e?.mean_duration_ms ?? null);
  const costs = ticked.map((e) => e?.mean_cost_usd ?? null);
  const knownDurations = durations.filter((d): d is number => d != null);
  const knownCosts = costs.filter((c): c is number => c != null);
  return {
    durationMs: knownDurations.length ? Math.max(...knownDurations) : null,
    costUsd: knownCosts.length ? knownCosts.reduce((a, b) => a + b, 0) : null,
    durationIncomplete: durations.some((d) => d == null),
    costIncomplete: costs.some((c) => c == null),
  };
}
