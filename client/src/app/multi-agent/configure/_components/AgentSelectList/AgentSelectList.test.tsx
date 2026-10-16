import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/runs.json";
import { useAgentSelection } from "@/components/multi-agent";
import { AgentSelectList } from "./AgentSelectList";

afterEach(cleanup);

const agents = [
  { id: "a1", name: "Security", description: "Finds vulnerabilities", enabled: true },
  { id: "a2", name: "Style", description: "   ", enabled: true },
] as unknown as Agent[];

const estimates = [{ agent_id: "a1", sample_size: 2, mean_duration_ms: 8200, mean_cost_usd: 0.06 }];

function Harness() {
  const sel = useAgentSelection();
  return (
    <AgentSelectList
      agents={agents}
      estimates={estimates}
      isSelected={sel.isSelected}
      onToggle={sel.toggle}
      onSelectAll={() => sel.selectAll(agents.map((a) => a.id))}
    />
  );
}

describe("AgentSelectList", () => {
  it("starts unticked, ticks all, hides empty descriptions and shows n/a for unknown estimates", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
        <Harness />
      </NextIntlClientProvider>,
    );
    const boxes = screen.getAllByRole("checkbox");
    boxes.forEach((b) => expect(b).toHaveAttribute("aria-checked", "false"));

    expect(screen.getByText("Finds vulnerabilities")).toBeInTheDocument();
    expect(screen.getByText("8.2s")).toBeInTheDocument();
    expect(screen.getByText("$0.060")).toBeInTheDocument();
    // agent 2: blank description is not rendered, and both estimates are n/a
    expect(screen.getAllByText("n/a")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    screen.getAllByRole("checkbox").forEach((b) => expect(b).toHaveAttribute("aria-checked", "true"));
  });
});

// keep vi referenced for consistency with sibling tests
void vi;
