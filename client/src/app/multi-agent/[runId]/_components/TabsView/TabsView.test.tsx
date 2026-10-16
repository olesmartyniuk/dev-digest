import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MultiAgentColumn, MultiAgentFinding, MultiAgentRunView } from "@devdigest/shared";
import runs from "../../../../../../messages/en/runs.json";
import prReview from "../../../../../../messages/en/prReview.json";
import evalMessages from "../../../../../../messages/en/eval.json";

vi.mock("@/lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import { TabsView } from "./TabsView";

afterEach(cleanup);

const finding = (id: string, run_id: string, over: Partial<MultiAgentFinding> = {}): MultiAgentFinding =>
  ({
    id,
    severity: "CRITICAL",
    category: "security",
    title: `Finding ${id}`,
    file: "src/a.ts",
    start_line: 4,
    end_line: 4,
    rationale: "Because secrets leak",
    suggestion: "Use an env var",
    confidence: 0.87,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv",
    accepted_at: null,
    dismissed_at: null,
    run_id,
    agent_id: null,
    group_id: "g1",
    ...over,
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
  summary: "All good",
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
  agent_count: 2,
  total_duration_ms: 8200,
  total_cost_usd: 0.1,
  cost_complete: true,
  in_flight: false,
  columns: [
    column({ run_id: "r1", agent_name: "Alpha", score: 61, findings: [finding("f1", "r1")] }),
    column({ run_id: "r2", agent_name: "Beta", score: 74, findings: [finding("f2", "r2")] }),
  ],
  groups: [
    {
      id: "g1",
      file: "src/a.ts",
      start_line: 4,
      end_line: 4,
      title: "Finding f1",
      severity: "CRITICAL",
      finding_ids: ["f1", "f2"],
      run_ids: ["r1", "r2"],
    },
  ],
  locations: [],
};

function renderTabs(onGroupAction = vi.fn(), v: MultiAgentRunView = view, agentTab = "r1") {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ runs, prReview, eval: evalMessages }}>
        <TabsView
          view={v}
          agentTab={agentTab}
          onAgentTab={vi.fn()}
          groupOf={() => view.groups[0]}
          onOpenTrace={vi.fn()}
          onGroupAction={onGroupAction}
          onTurnIntoEval={vi.fn()}
          pendingFindingIds={new Set()}
          evalPendingId={null}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return onGroupAction;
}

describe("TabsView", () => {
  it("shows a tab per agent, expands a finding, and applies Accept to the whole group", () => {
    const onGroupAction = renderTabs();

    expect(screen.getByRole("button", { name: /Alpha/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Beta/ })).toBeInTheDocument();
    expect(screen.getByText("Also flagged by Beta")).toBeInTheDocument();
    expect(screen.getByText("All good")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Finding f1"));
    expect(screen.getByText("Because secrets leak")).toBeInTheDocument();
    expect(screen.getByText("Use an env var")).toBeInTheDocument();
    expect(screen.getByText(/87%/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dismiss/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Turn into eval case/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Learn/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reply/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Accept/ }));
    expect(onGroupAction).toHaveBeenCalledWith(["f1", "f2"], "accept");
  });

  it("applies Dismiss to the whole group, and hides the suggested fix when the finding has none", () => {
    const v: MultiAgentRunView = {
      ...view,
      columns: [
        column({ run_id: "r1", agent_name: "Alpha", findings: [finding("f1", "r1", { suggestion: null })] }),
        view.columns[1]!,
      ],
    };
    const onGroupAction = renderTabs(vi.fn(), v);
    fireEvent.click(screen.getByText("Finding f1"));
    expect(screen.queryByText(/Suggested fix/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Dismiss/ }));
    expect(onGroupAction).toHaveBeenCalledWith(["f1", "f2"], "dismiss");
  });

  it("shows failed and cancelled agents as such, not as an empty result", () => {
    const v: MultiAgentRunView = {
      ...view,
      columns: [
        column({ run_id: "r1", agent_name: "Alpha", status: "failed", error: "No API key", score: null }),
        column({ run_id: "r2", agent_name: "Beta", status: "cancelled", score: null }),
      ],
    };
    renderTabs(vi.fn(), v, "r1");
    expect(screen.getByRole("alert")).toHaveTextContent("No API key");
    expect(screen.queryByText("No findings")).not.toBeInTheDocument();
    cleanup();
    renderTabs(vi.fn(), v, "r2");
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
