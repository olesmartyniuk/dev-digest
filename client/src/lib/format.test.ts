import { describe, it, expect } from "vitest";
import { formatDurationMs } from "./format";

describe("formatDurationMs", () => {
  it("formats unknown, sub-minute and minute-plus durations", () => {
    expect(formatDurationMs(null)).toBe("—");
    expect(formatDurationMs(8200)).toBe("8.2s");
    expect(formatDurationMs(65000)).toBe("1m 05s");
  });
});
