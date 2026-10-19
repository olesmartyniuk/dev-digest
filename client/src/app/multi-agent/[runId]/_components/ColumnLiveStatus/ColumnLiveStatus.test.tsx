import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import runs from "../../../../../../messages/en/runs.json";

let stream: { events: { kind: string; msg: string }[]; running: boolean } = { events: [], running: true };
vi.mock("@/lib/hooks/reviews", () => ({ useRunEvents: () => stream }));

import { ColumnLiveStatus } from "./ColumnLiveStatus";

afterEach(cleanup);

function setup(queued = false) {
  const qc = new QueryClient();
  const spy = vi.spyOn(qc, "invalidateQueries");
  const ui = () => (
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ runs }}>
        <ColumnLiveStatus runId="r1" parentId="m1" queued={queued} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  return { ui, spy };
}

describe("ColumnLiveStatus", () => {
  it("shows the latest stream message, falls back to Queued, and refetches the run when the stream ends", () => {
    stream = { events: [], running: true };
    const q = setup(true);
    const view = render(q.ui());
    expect(screen.getByRole("status")).toHaveTextContent("Queued");
    expect(q.spy).not.toHaveBeenCalled();

    stream = { events: [{ kind: "info", msg: "Reading the diff" }], running: true };
    view.rerender(q.ui());
    expect(screen.getByRole("status")).toHaveTextContent("Reading the diff");

    stream = { events: [{ kind: "info", msg: "Done" }], running: false };
    view.rerender(q.ui());
    expect(q.spy).toHaveBeenCalledWith({ queryKey: ["multi-agent-run", "m1"] });
  });

  it("falls back to Running for a non-queued column with no events", () => {
    stream = { events: [], running: true };
    render(setup(false).ui());
    expect(screen.getByRole("status")).toHaveTextContent("Running");
  });
});
