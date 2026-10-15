import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

/** budget.ts reads its env at import time, so each test loads a fresh copy with its own ledger. */
async function load(budget: string) {
  vi.resetModules();
  process.env.EVAL_BUDGET_USD = budget;
  process.env.EVAL_BUDGET_FILE = join(mkdtempSync(join(tmpdir(), "eval-budget-")), "ledger.jsonl");
  return import("./budget.js");
}

afterEach(() => {
  delete process.env.EVAL_BUDGET_USD;
  delete process.env.EVAL_BUDGET_FILE;
});

describe("budget", () => {
  test("no cap configured → never throws, nothing is written", async () => {
    const b = await load("0");
    b.charge("x", "deepseek/deepseek-v4-flash", 1e9, 1e9);
    expect(() => b.assertBudget()).not.toThrow();
    expect(b.spentUsd()).toBe(0);
  });

  test("prices known models per 1M tokens", async () => {
    const b = await load("0.25");
    // 1M in × $0.14 + 1M out × $0.28
    expect(b.priceUsd("deepseek/deepseek-v4-flash", 1_000_000, 1_000_000)).toBeCloseTo(0.42, 6);
  });

  test("unknown models use the pessimistic fallback price", async () => {
    const b = await load("0.25");
    expect(b.priceUsd("some/unknown-model", 1_000_000, 0)).toBeCloseTo(1.0, 6);
  });

  test("ledger accumulates across calls and trips the cap", async () => {
    const b = await load("0.25");
    b.charge("a", "deepseek/deepseek-v4-flash", 1_000_000, 0); // $0.14
    expect(() => b.assertBudget()).not.toThrow();
    b.charge("b", "deepseek/deepseek-v4-flash", 1_000_000, 0); // $0.28 total
    expect(b.spentUsd()).toBeCloseTo(0.28, 6);
    expect(() => b.assertBudget()).toThrow(b.BudgetExceededError);
  });

  test("an in-flight call that would cross the cap is refused up front", async () => {
    const b = await load("0.25");
    b.charge("a", "deepseek/deepseek-v4-flash", 1_000_000, 0); // $0.14
    expect(() => b.assertBudget(0.2)).toThrow(b.BudgetExceededError);
  });

  test("the error message carries the greppable marker CI looks for", async () => {
    const b = await load("0.25");
    expect(new b.BudgetExceededError(0.3).message).toContain(b.BUDGET_MARKER);
  });
});
