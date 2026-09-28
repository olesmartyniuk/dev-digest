import { describe, it, expect } from "vitest";
import type { Convention, ConventionDrop } from "@devdigest/shared";
import { citation, confidenceColor, countConventions, groupDrops, sortConventions } from "./helpers";

function make(over: Partial<Convention>): Convention {
  return {
    id: "c",
    repo_id: "r1",
    category: "async",
    rule: "rule",
    rationale: null,
    evidence: { path: "src/a.ts", line: 1, snippet: "x" },
    confidence: 0.5,
    status: "pending",
    origin: "model",
    created_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("countConventions", () => {
  it("tallies each status", () => {
    expect(
      countConventions([
        make({ id: "1", status: "pending" }),
        make({ id: "2", status: "accepted" }),
        make({ id: "3", status: "accepted" }),
        make({ id: "4", status: "rejected" }),
      ]),
    ).toEqual({ total: 4, pending: 1, accepted: 2, rejected: 1 });
  });
});

describe("sortConventions", () => {
  it("puts undecided first, then accepted, then rejected", () => {
    const sorted = sortConventions([
      make({ id: "rej", status: "rejected" }),
      make({ id: "acc", status: "accepted" }),
      make({ id: "pen", status: "pending" }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(["pen", "acc", "rej"]);
  });

  it("orders by confidence within one status", () => {
    const sorted = sortConventions([
      make({ id: "low", confidence: 0.4 }),
      make({ id: "high", confidence: 0.95 }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(["high", "low"]);
  });

  it("does not mutate its input", () => {
    const input = [make({ id: "a", status: "rejected" }), make({ id: "b", status: "pending" })];
    sortConventions(input);
    expect(input.map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("confidenceColor", () => {
  it("is green when the evidence is strong and muted when it is weak", () => {
    expect(confidenceColor(0.91)).toBe("var(--ok)");
    expect(confidenceColor(0.7)).toBe("var(--warn)");
    expect(confidenceColor(0.3)).toBe("var(--text-muted)");
  });
});

describe("groupDrops", () => {
  it("tallies reasons, most frequent first", () => {
    const drops: ConventionDrop[] = [
      { rule: "a", path: "x", reason: "snippet_not_found" },
      { rule: "b", path: "y", reason: "low_confidence" },
      { rule: "c", path: "z", reason: "snippet_not_found" },
    ];
    expect(groupDrops(drops)).toEqual([
      { reason: "snippet_not_found", count: 2 },
      { reason: "low_confidence", count: 1 },
    ]);
  });
});

describe("citation", () => {
  it("renders file:line", () => {
    expect(citation(make({ evidence: { path: "src/api/users.ts", line: 23, snippet: "" } }))).toBe(
      "src/api/users.ts:23",
    );
  });
});
