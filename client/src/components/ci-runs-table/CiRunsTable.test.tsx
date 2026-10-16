import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CiRunRow } from "@devdigest/shared";
import messages from "../../../messages/en/ci.json";
import { CiRunsTable } from "./CiRunsTable";

afterEach(cleanup);

const run = (over: Partial<CiRunRow> = {}): CiRunRow => ({
  id: "r1",
  ran_at: "2026-10-15T10:00:00Z",
  repo: "acme/app",
  pr_number: 7,
  agent_id: "a1",
  agent_name: "Security Reviewer",
  status: "succeeded",
  blocking: false,
  findings_count: 2,
  cost_usd: 0.0123,
  duration_ms: 4200,
  job_url: "https://github.com/acme/app/actions/runs/1/attempts/1",
  ...over,
});

function renderTable(runs: CiRunRow[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
      <CiRunsTable runs={runs} />
    </NextIntlClientProvider>,
  );
}

describe("CiRunsTable", () => {
  it("renders a missing cost as a dash, marks blocking runs, and opens the job safely", () => {
    renderTable([
      run({ id: "r1", cost_usd: null, blocking: true }),
      run({ id: "r2", agent_name: null, status: "no_findings", findings_count: 0, job_url: "javascript:alert(1)" }),
    ]);
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("—", { selector: "td" })).toBeInTheDocument();
    expect(within(rows[0]!).queryByText("$0.000")).not.toBeInTheDocument();
    expect(within(rows[0]!).getByText("blocking")).toBeInTheDocument();
    expect(within(rows[0]!).getByRole("link", { name: "View" })).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(rows[1]!).getByText("Unknown agent")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("No findings")).toBeInTheDocument();
    expect(within(rows[1]!).queryByRole("link")).not.toBeInTheDocument();
  });
});
