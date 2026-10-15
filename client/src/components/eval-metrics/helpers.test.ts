import { describe, it, expect } from "vitest";
import { formatRate, deltaPp, formatSignedPp, formatCostDelta, formatCost } from "./helpers";

describe("eval metric helpers", () => {
  it("formats rates and renders n/a for null or not-applicable values", () => {
    expect(formatRate(0.874)).toBe("87%");
    expect(formatRate(1)).toBe("100%");
    expect(formatRate(null)).toBe("n/a");
    expect(formatRate(1, true)).toBe("n/a");
  });

  it("computes and signs percentage-point deltas", () => {
    expect(deltaPp(0.82, 0.8)).toBe(2);
    expect(deltaPp(0.5, 0.9)).toBe(-40);
    expect(formatSignedPp(2)).toBe("+2.0 pts");
    expect(formatSignedPp(-4)).toBe("−4.0 pts");
    expect(formatSignedPp(0)).toBe("0.0 pts");
  });

  it("signs cost deltas and shows an em dash when either side is unpriced", () => {
    expect(formatCostDelta(0.01, 0.0223)).toBe("+$0.0123");
    expect(formatCostDelta(0.0223, 0.01)).toBe("−$0.0123");
    expect(formatCostDelta(null, 0.01)).toBe("—");
    expect(formatCost(null)).toBe("—");
    expect(formatCost(0.0123)).toBe("$0.0123");
  });
});
