import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { MultiAgentRunView } from "@devdigest/shared";
import runs from "../../../../../../messages/en/runs.json";
import { ResultsHeader } from "./ResultsHeader";

afterEach(cleanup);

const view = (over: Partial<MultiAgentRunView> = {}): MultiAgentRunView => ({
  id: "m1",
  pr_id: "pr1",
  pr_number: 482,
  pr_title: "Add billing webhook",
  repo_id: "repo",
  ran_at: "2026-01-01T00:00:00Z",
  agent_count: 4,
  total_duration_ms: 8200,
  total_cost_usd: 0.2,
  cost_complete: true,
  in_flight: false,
  columns: [],
  groups: [],
  locations: [],
  ...over,
});

function renderHeader(v: MultiAgentRunView, mode: "columns" | "tabs", onModeChange = vi.fn(), onConfigure = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ runs }}>
      <ResultsHeader view={v} mode={mode} onModeChange={onModeChange} onConfigure={onConfigure} />
    </NextIntlClientProvider>,
  );
  return { onModeChange, onConfigure };
}

describe("ResultsHeader", () => {
  it("shows PR, neutral totals, the active mode, and wires Configure run and the mode switch", () => {
    const { onModeChange, onConfigure } = renderHeader(view(), "columns");

    expect(screen.getByRole("heading", { name: "#482 Add billing webhook" })).toBeInTheDocument();
    expect(screen.getByText("4 selected agents · parallel")).toBeInTheDocument();
    expect(screen.getByText("4 agents · parallel · 8.2s · $0.200")).toBeInTheDocument();
    expect(screen.queryByText(/cost incomplete/)).not.toBeInTheDocument();
    expect(screen.queryByText(/worktree/i)).not.toBeInTheDocument();

    expect(screen.getByRole("group", { name: "Results layout" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^columns$/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^tabs$/i })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: /^tabs$/i }));
    expect(onModeChange).toHaveBeenCalledWith("tabs");
    fireEvent.click(screen.getByRole("button", { name: "Configure run" }));
    expect(onConfigure).toHaveBeenCalledTimes(1);
  });

  it("marks the cost total incomplete when some run's cost is unknown, and reflects Tabs mode", () => {
    renderHeader(view({ cost_complete: false, total_cost_usd: 0.1 }), "tabs");
    expect(screen.getByText(/\$0\.100 \(cost incomplete\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^tabs$/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^columns$/i })).toHaveAttribute("aria-pressed", "false");
  });

  it("labels the mode switch 'Columns' and 'Tabs' as AC-25 specifies", () => {
    renderHeader(view(), "columns");
    expect(screen.getByRole("button", { name: "Columns" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tabs" })).toBeInTheDocument();
  });
});
