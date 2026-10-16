import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { MultiAgentLocation } from "@devdigest/shared";
import runs from "../../../../../../messages/en/runs.json";
import { DisagreementBlock } from "./DisagreementBlock";

afterEach(cleanup);

const take = (run_id: string, name: string, verdict: MultiAgentLocation["takes"][number]["verdict"], scope: MultiAgentLocation["takes"][number]["scope"] = null) => ({
  run_id,
  agent_id: null,
  agent_name: name,
  verdict,
  scope,
});

const conflict: MultiAgentLocation = {
  group_id: "g1",
  file: "src/a.ts",
  line: 4,
  title: "Hardcoded secret",
  is_conflict: true,
  takes: [take("r1", "Alpha", "CRITICAL"), take("r2", "Beta", "did_not_flag", "perf")],
};
const agreement: MultiAgentLocation = {
  group_id: "g2",
  file: "src/b.ts",
  line: 9,
  title: "Missing await",
  is_conflict: false,
  takes: [take("r1", "Alpha", "WARNING"), take("r2", "Beta", "WARNING")],
};

function renderBlock(locations: MultiAgentLocation[], onlyConflicts: boolean, onChange = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs }}>
      <DisagreementBlock locations={locations} onlyConflicts={onlyConflicts} onOnlyConflictsChange={onChange} />
    </NextIntlClientProvider>,
  );
}

describe("DisagreementBlock", () => {
  it("is hidden when there are no locations", () => {
    const { container } = renderBlock([], false);
    expect(container.firstChild).toBeNull();
  });

  it("lists everything with the toggle off and only conflicts with it on", () => {
    renderBlock([conflict, agreement], false);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("Missing await")).toBeInTheDocument();
    // did-not-flag take carries the scope reason
    expect(screen.getByText("Not a performance concern.")).toBeInTheDocument();
    cleanup();

    renderBlock([conflict, agreement], true);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.queryByText("Missing await")).not.toBeInTheDocument();
  });

  it("shows the empty text with the toggle on and no conflicts, keeping the toggle reachable", () => {
    const onChange = vi.fn();
    renderBlock([agreement], true, onChange);
    expect(screen.getByText(/No conflicts/)).toBeInTheDocument();
    const toggle = screen.getByRole("switch", { name: "Show only conflicts" });
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
