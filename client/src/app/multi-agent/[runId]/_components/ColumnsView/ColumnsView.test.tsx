import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MultiAgentColumn, MultiAgentFinding, MultiAgentRunView } from "@devdigest/shared";
import runs from "../../../../../../messages/en/runs.json";

vi.mock("@/lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [{ kind: "info", msg: "Reading the diff" }], running: true }),
}));

import { ColumnsView } from "./ColumnsView";

afterEach(cleanup);

const finding = (id: string, run_id: string): MultiAgentFinding =>
  ({
    id,
    severity: "CRITICAL",
    category: "security",
    title: `Finding ${id}`,
    file: "src/a.ts",
    start_line: 4,
    end_line: 6,
    rationale: "why",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv",
    accepted_at: null,
    dismissed_at: null,
    run_id,
    agent_id: null,
    group_id: "g1",
  }) as MultiAgentFinding;

const column = (over: Partial<MultiAgentColumn>): MultiAgentColumn => ({
  run_id: "r",
  agent_id: null,
  agent_name: "Agent",
  provider: null,
  model: null,
  status: "done",
  error: null,
  verdict: null,
  summary: null,
  score: 80,
  duration_ms: 8200,
  cost_usd: 0.05,
  findings: [],
  ...over,
});

const view: MultiAgentRunView = {
  id: "m1",
  pr_id: "pr1",
  pr_number: 7,
  pr_title: "t",
  repo_id: "repo",
  ran_at: "2026-01-01T00:00:00Z",
  agent_count: 3,
  total_duration_ms: 8200,
  total_cost_usd: 0.05,
  cost_complete: true,
  in_flight: true,
  columns: [
    column({ run_id: "r1", agent_name: "Alpha", findings: [finding("f1", "r1")] }),
    column({ run_id: "r2", agent_name: "Beta", status: "failed", error: "No API key", score: null }),
    column({ run_id: "r3", agent_name: "Gamma", status: "running", score: null }),
  ],
  groups: [
    {
      id: "g1",
      file: "src/a.ts",
      start_line: 4,
      end_line: 6,
      title: "Finding f1",
      severity: "CRITICAL",
      finding_ids: ["f1"],
      run_ids: ["r1", "r2"],
    },
  ],
  locations: [],
};

describe("ColumnsView", () => {
  it("renders one column per agent with status-specific bodies and opens the trace", () => {
    const onOpenTrace = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="en" messages={{ runs }}>
          <ColumnsView view={view} groupOf={(id) => (id === "f1" ? view.groups[0] : undefined)} onOpenTrace={onOpenTrace} />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    expect(screen.getAllByRole("region")).toHaveLength(3);
    expect(screen.getByText("Finding f1")).toBeInTheDocument();
    expect(screen.getByText("1 finding")).toBeInTheDocument();
    // failed column shows its error text
    expect(screen.getByRole("alert")).toHaveTextContent("No API key");
    // running column shows the live event message
    expect(screen.getByRole("status")).toHaveTextContent("Reading the diff");

    fireEvent.click(screen.getAllByRole("button", { name: "View trace" })[0]!);
    expect(onOpenTrace).toHaveBeenCalledWith("r1");
  });
});
