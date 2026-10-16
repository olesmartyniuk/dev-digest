import { describe, it, expect } from "vitest";
import { NAV } from "@devdigest/ui";
import { activeKeyFor } from "./helpers";

describe("activeKeyFor", () => {
  it("matches the onboarding tour route but not the unrelated add-repository page", () => {
    expect(activeKeyFor("/repos/abc/onboarding")).toBe("onboarding-tour");
    expect(activeKeyFor("/onboarding")).toBe("");
  });

  it("still resolves the other repo-scoped nav keys", () => {
    expect(activeKeyFor("/repos/abc/context")).toBe("context");
    expect(activeKeyFor("/repos/abc/pulls")).toBe("pulls");
  });
});

describe("CI Runs nav entry (SPEC-05)", () => {
  it("is listed under GLOBAL and routes to /ci-runs", () => {
    const global = NAV.find((g) => g.section === "GLOBAL")!;
    expect(global.items.find((i) => i.key === "ci-runs")).toMatchObject({ label: "CI Runs", href: "/ci-runs" });
    expect(activeKeyFor("/ci-runs")).toBe("ci-runs");
  });
});

describe("Eval Dashboard nav entry (L06)", () => {
  it("is listed under SKILLS LAB right after Conventions and routes to /eval", () => {
    const lab = NAV.find((g) => g.section === "SKILLS LAB")!;
    const keys = lab.items.map((i) => i.key);
    expect(keys.indexOf("eval")).toBe(keys.indexOf("conventions") + 1);
    expect(lab.items.find((i) => i.key === "eval")).toMatchObject({ label: "Eval Dashboard", href: "/eval" });
  });

  it("highlights it on /eval and any /eval/* path", () => {
    expect(activeKeyFor("/eval")).toBe("eval");
    expect(activeKeyFor("/eval/0f8fad5b-d9cb-469f-a165-70867728950e")).toBe("eval");
  });
});
