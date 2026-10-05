import { describe, it, expect } from "vitest";
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
