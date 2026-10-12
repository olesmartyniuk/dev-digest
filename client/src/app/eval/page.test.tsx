import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../messages/en/eval.json";
import EvalDashboardPage from "./page";

// The shell is covered by its own tests; here only the page body matters.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

let payload: unknown;

beforeEach(() => {
  payload = { agents: [], recent_runs: [] };
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(payload))));
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <EvalDashboardPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("/eval (all agents)", () => {
  it("shows the existing noRuns empty state while there are no runs", async () => {
    renderPage();
    expect(await screen.findByText("No runs yet. Create an eval case and run it.")).toBeInTheDocument();
    expect(screen.getByText("RECENT EVAL RUNS · ALL AGENTS")).toBeInTheDocument();
  });

  it("lists one card per agent and the newest-first runs table when runs exist", async () => {
    const run = {
      id: "r1",
      agent_id: "ag1",
      agent_name: "Security Reviewer",
      agent_version: 2,
      model: "m",
      status: "done",
      partial: false,
      started_at: "2026-10-01T10:00:00Z",
      finished_at: "2026-10-01T10:00:05Z",
      case_ids: [],
      case_count: 9,
      errored_count: 0,
      cost_usd: null,
      error: null,
      aggregate: {
        recall: 1,
        precision: 0.5,
        citation_accuracy: 1,
        traces_passed: 5,
        traces_total: 9,
        duration_ms: 1,
        cost_usd: null,
        per_trace: [],
      },
      na: { recall: false, precision: false, citation_accuracy: false },
    };
    payload = {
      agents: [{ agent_id: "ag1", agent_name: "Security Reviewer", model: "m", cases_total: 9, last_run: run, trend: [] }],
      recent_runs: [run],
    };
    renderPage();
    expect(await screen.findAllByText("Security Reviewer")).toHaveLength(2); // card + table row
    expect(screen.getByText("5/9")).toBeInTheDocument();
    expect(screen.queryByText("No runs yet. Create an eval case and run it.")).not.toBeInTheDocument();
  });
});
