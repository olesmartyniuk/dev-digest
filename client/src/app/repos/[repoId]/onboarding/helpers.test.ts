import { describe, it, expect } from "vitest";
import type { Onboarding } from "@devdigest/shared";
import { extractCommands, orderedSections } from "./helpers";

describe("extractCommands", () => {
  it("collects every line in a fenced sh block, dropping comments and stripping `$ `", () => {
    const body = [
      "Run it locally:",
      "",
      "```sh",
      "# install deps",
      "$ npm install",
      "npm run dev",
      "```",
    ].join("\n");
    expect(extractCommands(body)).toEqual(["npm install", "npm run dev"]);
  });

  it("falls back to an inline-code list when there is no fence", () => {
    const body = ["Steps:", "", "- `npm install`", "- `npm run dev`"].join("\n");
    expect(extractCommands(body)).toEqual(["npm install", "npm run dev"]);
  });

  it("returns [] for prose with no fence and no inline-code list", () => {
    expect(extractCommands("No commands could be grounded here, sorry.")).toEqual([]);
  });
});

describe("orderedSections", () => {
  it("sorts shuffled sections into the fixed SECTION_ORDER and drops unknown kinds", () => {
    const tour: Onboarding = {
      sections: [
        { kind: "first_tasks", title: "t", body: "b", diagram: null, links: [] },
        { kind: "mystery", title: "t", body: "b", diagram: null, links: [] },
        { kind: "architecture", title: "t", body: "b", diagram: null, links: [] },
        { kind: "how_to_run", title: "t", body: "b", diagram: null, links: [] },
        { kind: "critical_paths", title: "t", body: "b", diagram: null, links: [] },
        { kind: "reading_path", title: "t", body: "b", diagram: null, links: [] },
      ],
    };
    expect(orderedSections(tour).map((s) => s.kind)).toEqual([
      "architecture",
      "critical_paths",
      "how_to_run",
      "reading_path",
      "first_tasks",
    ]);
  });
});
