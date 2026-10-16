import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

const push = vi.fn();
const mutateAsync = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgents: () => ({
    data: [
      { id: "a1", name: "Security", model: "gpt-4.1", enabled: true },
      { id: "a2", name: "Perf", model: "gpt-4.1", enabled: true },
      { id: "a3", name: "Disabled one", model: "gpt-4.1", enabled: false },
    ],
  }),
}));
vi.mock("../../../../../../../lib/hooks/multi-agent", () => ({
  useAgentEstimates: () => ({
    data: [{ agent_id: "a1", sample_size: 3, mean_duration_ms: 8200, mean_cost_usd: 0.06 }],
  }),
  useStartMultiAgentReview: () => ({ mutateAsync, isPending: false }),
}));

import { RunReviewDropdown } from "./RunReviewDropdown";

beforeEach(() => {
  push.mockReset();
  mutateAsync.mockReset();
});
afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const open = () => fireEvent.click(screen.getByRole("button", { name: "Pick agents to run" }));

describe("RunReviewDropdown (agent picker)", () => {
  it("renders the trigger label", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    expect(screen.getByText("Run Review")).toBeInTheDocument();
  });

  it("lists only enabled agents unchecked, counts ticks, clears, and runs", async () => {
    mutateAsync.mockResolvedValue({ runs: [{ run_id: "r1" }], multi_agent_run_id: "m1" });
    const onRunsStarted = vi.fn();
    renderWithIntl(<RunReviewDropdown prId="pr1" onRunsStarted={onRunsStarted} />);
    open();

    expect(screen.queryByText("Disabled one")).not.toBeInTheDocument();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    boxes.forEach((b) => expect(b).toHaveAttribute("aria-checked", "false"));
    expect(screen.getByText("8.2s")).toBeInTheDocument();

    const runBtn = () => screen.getByRole("button", { name: /Run multi-agent review/ });
    expect(runBtn()).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Security/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Perf/ }));
    expect(runBtn()).toHaveTextContent("Run multi-agent review (2)");

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(runBtn()).toHaveTextContent("(0)");
    expect(runBtn()).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /Security/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Perf/ }));
    fireEvent.click(runBtn());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/multi-agent/m1"));
    expect(mutateAsync).toHaveBeenCalledWith({ prId: "pr1", agentIds: ["a1", "a2"] });
    expect(onRunsStarted).toHaveBeenCalledWith(["r1"]);
  });

  it("links to the Configure run screen for this PR", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Configure agents…" }));
    expect(push).toHaveBeenCalledWith("/multi-agent/configure?pr=pr1");
  });

  it("warns on a merged PR but still allows running", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" warnMerged />);
    open();
    expect(screen.getByText(/Already merged/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Security/ }));
    expect(screen.getByRole("button", { name: /Run multi-agent review/ })).toBeEnabled();
  });
});
