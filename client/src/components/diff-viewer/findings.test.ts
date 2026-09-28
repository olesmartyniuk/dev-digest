import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { findingsByPath, partitionFindings, worstSeverity } from "./findings";

function finding(over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "SUGGESTION",
    category: "style",
    title: "t",
    file: "src/a.ts",
    start_line: 12,
    end_line: 12,
    rationale: "r",
    suggestion: null,
    confidence: 0.8,
    kind: null,
    trifecta_components: null,
    evidence: null,
    review_id: "rev1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

describe("partitionFindings", () => {
  it("matches a finding on a rendered RIGHT:line key", () => {
    const f = finding({ start_line: 12 });
    const { matched, unanchored } = partitionFindings([f], new Set(["RIGHT:12"]));
    expect(matched.get("RIGHT:12")).toEqual([f]);
    expect(unanchored).toEqual([]);
  });

  it("puts a finding on an unrendered line into unanchored", () => {
    const f = finding({ start_line: 99 });
    const { matched, unanchored } = partitionFindings([f], new Set(["RIGHT:12"]));
    expect(matched.size).toBe(0);
    expect(unanchored).toEqual([f]);
  });
});

describe("worstSeverity", () => {
  it("returns the worst severity across a mixed list", () => {
    expect(
      worstSeverity([finding({ id: "a", severity: "SUGGESTION" }), finding({ id: "b", severity: "CRITICAL" })]),
    ).toBe("CRITICAL");
  });

  it("returns null for an empty list", () => {
    expect(worstSeverity([])).toBeNull();
  });
});

describe("findingsByPath", () => {
  it("groups findings by their file", () => {
    const a = finding({ id: "a", file: "src/a.ts" });
    const b = finding({ id: "b", file: "src/b.ts" });
    const c = finding({ id: "c", file: "src/a.ts" });
    const byPath = findingsByPath([a, b, c]);
    expect(byPath.get("src/a.ts")).toEqual([a, c]);
    expect(byPath.get("src/b.ts")).toEqual([b]);
  });
});
