/**
 * Hard spend cap for an eval run (CI sets EVAL_BUDGET_USD=0.25; unset/0 = no cap, e.g. local runs).
 *
 * Every model call is priced from its token usage and appended to a ledger FILE, so the total
 * survives across vitest workers and across the separate `vitest run` invocations CI makes per
 * suite. Before each call (and after each agent turn) the ledger is checked; once it reaches the
 * cap a BudgetExceededError is thrown and nothing further is sent to the model.
 *
 * Prices are USD per 1M tokens and are an ESTIMATE (same table as server/src/adapters/llm/pricing.ts).
 * Unknown models fall back to a deliberately pessimistic price so the cap trips early, not late.
 * Override with EVAL_PRICE_IN / EVAL_PRICE_OUT (USD per 1M tokens).
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { RESULTS_DIR } from "./artifacts/paths.js";

export const BUDGET_USD = Number(process.env.EVAL_BUDGET_USD ?? "0");
export const LEDGER_FILE = process.env.EVAL_BUDGET_FILE ?? join(RESULTS_DIR, "budget-ledger.jsonl");

/** Greppable marker: CI looks for it in a suite's log to tell "budget hit" from a real failure. */
export const BUDGET_MARKER = "EVAL_BUDGET_EXCEEDED";

const PRICES: Record<string, { in: number; out: number }> = {
  "deepseek/deepseek-v4-flash": { in: 0.14, out: 0.28 },
  "deepseek/deepseek-v4-pro": { in: 0.435, out: 0.87 },
  "deepseek/deepseek-v3.2": { in: 0.23, out: 0.34 },
  "google/gemini-2.5-flash": { in: 0.3, out: 2.5 },
};
const FALLBACK_PRICE = { in: 1.0, out: 5.0 };

export class BudgetExceededError extends Error {
  constructor(spent: number) {
    super(`${BUDGET_MARKER}: spent ~$${spent.toFixed(4)} of the $${BUDGET_USD.toFixed(2)} eval budget — no further model calls`);
    this.name = "BudgetExceededError";
  }
}

export const budgetEnabled = () => BUDGET_USD > 0;

export function priceUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model] ?? FALLBACK_PRICE;
  const pin = Number(process.env.EVAL_PRICE_IN ?? p.in);
  const pout = Number(process.env.EVAL_PRICE_OUT ?? p.out);
  return (inputTokens * pin + outputTokens * pout) / 1_000_000;
}

/** Total recorded so far, summed from the ledger. */
export function spentUsd(): number {
  if (!existsSync(LEDGER_FILE)) return 0;
  let sum = 0;
  for (const line of readFileSync(LEDGER_FILE, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      sum += Number(JSON.parse(line).usd) || 0;
    } catch {
      /* a torn line is ignored, never fatal */
    }
  }
  return sum;
}

/** Throw if the cap is already reached, or would be once `pendingUsd` (an in-flight call) is added. */
export function assertBudget(pendingUsd = 0): void {
  if (!budgetEnabled()) return;
  const spent = spentUsd() + pendingUsd;
  if (spent >= BUDGET_USD) throw new BudgetExceededError(spent);
}

/** Record a finished call's cost. No-op when no cap is configured. */
export function charge(label: string, model: string, inputTokens: number, outputTokens: number): number {
  const usd = priceUsd(model, inputTokens, outputTokens);
  if (!budgetEnabled()) return usd;
  mkdirSync(dirname(LEDGER_FILE), { recursive: true });
  appendFileSync(LEDGER_FILE, JSON.stringify({ label, model, in: inputTokens, out: outputTokens, usd }) + "\n");
  return usd;
}
