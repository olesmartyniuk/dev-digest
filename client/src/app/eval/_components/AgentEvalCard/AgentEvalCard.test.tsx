import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalAgentCard, EvalRunSummary } from "@devdigest/shared";
import messages from "../../../../../messages/en/eval.json";
import { AgentEvalCard } from "./AgentEvalCard";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

const RUN: EvalRunSummary = {
  id: "r1",
  agent_id: "ag1",
  agent_name: "Security Reviewer",
  agent_version: 3,
  model: "deepseek/deepseek-v4-flash",
  status: "done",
  partial: false,
  started_at: "2026-10-01T10:00:00Z",
  finished_at: "2026-10-01T10:00:05Z",
  case_ids: [],
  case_count: 9,
  errored_count: 0,
  cost_usd: 0.01,
  error: null,
  aggregate: {
    recall: 0.75,
    precision: 1,
    citation_accuracy: 1,
    traces_passed: 7,
    traces_total: 9,
    duration_ms: 1,
    cost_usd: 0.01,
    per_trace: [],
  },
  na: { recall: false, precision: false, citation_accuracy: false },
};

const CARD: EvalAgentCard = {
  agent_id: "ag1",
  agent_name: "Security Reviewer",
  model: "deepseek/deepseek-v4-flash",
  cases_total: 9,
  last_run: RUN,
  trend: [],
};

function renderCard(card: EvalAgentCard) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <AgentEvalCard card={card} />
    </NextIntlClientProvider>,
  );
}

describe("AgentEvalCard", () => {
  it("renders the agent's real model, version, pass x/y and the three rates, linking to its dashboard", () => {
    renderCard(CARD);
    expect(screen.getByText("deepseek/deepseek-v4-flash")).toBeInTheDocument();
    expect(screen.getByText(/v3 ·/)).toBeInTheDocument();
    expect(screen.getByText(/pass 7\/9/)).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getAllByText("100%")).toHaveLength(2);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/eval/ag1");
  });

  it('renders "n/a" for a metric flagged not-applicable, and "never run" without runs', () => {
    renderCard({ ...CARD, last_run: { ...RUN, na: { recall: false, precision: true, citation_accuracy: false } } });
    expect(screen.getByText("n/a")).toBeInTheDocument();
    cleanup();
    renderCard({ ...CARD, last_run: null });
    expect(screen.getByText("never run")).toBeInTheDocument();
  });
});
