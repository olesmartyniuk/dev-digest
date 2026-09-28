import { describe, it, expect } from "vitest";
import { deriveNameFromMarkdown } from "./helpers";

describe("deriveNameFromMarkdown", () => {
  it("returns the text of the first # heading", () => {
    expect(deriveNameFromMarkdown("# PR Quality Rubric\n\nBody text.")).toBe("PR Quality Rubric");
  });

  it("ignores a ## sub-heading and finds the first top-level one further down", () => {
    expect(deriveNameFromMarkdown("intro\n## Not this\n# The real title\nmore")).toBe("The real title");
  });

  it("returns null when there is no # heading", () => {
    expect(deriveNameFromMarkdown("Just some text, no heading.")).toBeNull();
  });

  it("returns null for an empty body", () => {
    expect(deriveNameFromMarkdown("")).toBeNull();
  });
});
