import { describe, it, expect } from "vitest";
import type { ContextDocument } from "@devdigest/shared";
import { buildAllRows, moveAttached, summarize, toggleAttached } from "./helpers";

function doc(over: Partial<ContextDocument> = {}): ContextDocument {
  return {
    path: "docs/a.md",
    name: "a.md",
    root: "docs",
    size: 20,
    chars: 10,
    tokens: 5,
    entry_chars: 20,
    updated_at: null,
    used_by: { agents: 0, skills: 0 },
    ...over,
  };
}

describe("toggleAttached", () => {
  it("checking a document appends it to the END of the attached list", () => {
    expect(toggleAttached(["a.md"], "b.md", true)).toEqual(["a.md", "b.md"]);
  });

  it("is a no-op when the path is already attached", () => {
    expect(toggleAttached(["a.md"], "a.md", true)).toEqual(["a.md"]);
  });

  it("unchecking removes the path", () => {
    expect(toggleAttached(["a.md", "b.md"], "a.md", false)).toEqual(["b.md"]);
  });
});

describe("moveAttached", () => {
  it("swaps a path with its neighbour", () => {
    expect(moveAttached(["a.md", "b.md", "c.md"], "b.md", -1)).toEqual(["b.md", "a.md", "c.md"]);
    expect(moveAttached(["a.md", "b.md", "c.md"], "b.md", 1)).toEqual(["a.md", "c.md", "b.md"]);
  });

  it("is a no-op at either edge", () => {
    const list = ["a.md", "b.md"];
    expect(moveAttached(list, "a.md", -1)).toEqual(list);
    expect(moveAttached(list, "b.md", 1)).toEqual(list);
  });
});

describe("summarize", () => {
  it("sums tokens/entry_chars for the effective set and flips overCap once the cap is exceeded", () => {
    const docs = [doc({ path: "a.md", tokens: 100, entry_chars: 1000 }), doc({ path: "b.md", tokens: 50, entry_chars: 500 })];
    const under = summarize(["a.md", "b.md"], docs, 2000);
    expect(under.tokens).toBe(150);
    expect(under.entryChars).toBe(1500);
    expect(under.overCap).toBe(false);

    const over = summarize(["a.md", "b.md"], docs, 1200);
    expect(over.overCap).toBe(true);
  });

  it("lists effective paths not found in the listing as missing", () => {
    const docs = [doc({ path: "a.md" })];
    const result = summarize(["a.md", "gone.md"], docs, 10_000);
    expect(result.missing).toEqual(["gone.md"]);
  });
});

describe("buildAllRows", () => {
  it("preserves the server's order and filters case-insensitively on path", () => {
    const docs = [doc({ path: "docs/a.md" }), doc({ path: "specs/webhooks.md" })];
    const rows = buildAllRows(docs, ["docs/a.md"], "WEBHOOK");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.doc.path).toBe("specs/webhooks.md");
    expect(rows[0]!.attached).toBe(false);
  });
});
