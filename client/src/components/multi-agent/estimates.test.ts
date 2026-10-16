import { describe, it, expect } from "vitest";
import type { AgentRunEstimate } from "@devdigest/shared";
import { estimateFor, footerEstimate } from "./estimates";

const est = (id: string, ms: number | null, cost: number | null): AgentRunEstimate => ({
  agent_id: id,
  sample_size: 3,
  mean_duration_ms: ms,
  mean_cost_usd: cost,
});

describe("footerEstimate", () => {
  it("takes the max duration and sums the cost", () => {
    const f = footerEstimate([
      est("a", 8200, 0.06),
      est("b", 7400, 0.05),
      est("c", 6900, 0.04),
      est("d", 7100, 0.05),
    ]);
    expect(f.durationMs).toBe(8200);
    expect(f.costUsd).toBeCloseTo(0.2, 10);
    expect(f.durationIncomplete).toBe(false);
    expect(f.costIncomplete).toBe(false);
  });

  it("excludes unknowns from the sum and flags them incomplete", () => {
    const f = footerEstimate([est("a", 8000, 0.06), est("b", 7000, null), undefined]);
    expect(f.costUsd).toBeCloseTo(0.06, 10);
    expect(f.costIncomplete).toBe(true);
    expect(f.durationMs).toBe(8000);
    expect(f.durationIncomplete).toBe(true);
  });

  it("is null when nothing is known", () => {
    expect(footerEstimate([est("a", null, null)])).toEqual({
      durationMs: null,
      costUsd: null,
      durationIncomplete: true,
      costIncomplete: true,
    });
  });
});

describe("estimateFor", () => {
  it("finds an agent's estimate", () => {
    expect(estimateFor([est("a", 1, 1)], "a")?.agent_id).toBe("a");
    expect(estimateFor(undefined, "a")).toBeUndefined();
  });
});
