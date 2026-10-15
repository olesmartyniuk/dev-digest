/**
 * EvalsTab — fetch is mocked at the boundary (same pattern as PrBriefCard.test):
 * a QueryClient + NextIntlClientProvider wrap the tab and the real hooks hit the
 * mocked `fetch`, routed by URL suffix.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentEvalDashboard, EvalCaseView, EvalRunSummary } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/eval.json";
import { ToastProvider } from "../../../../../../../lib/toast";
import { EvalsTab } from "./EvalsTab";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

type LastRun = EvalCaseView["last_run"];
const NEVER: LastRun = {
  status: "never_run",
  ran_at: null,
  expected_count: 1,
  actual_count: null,
  recall: null,
  precision: null,
  citation_accuracy: null,
  duration_ms: null,
};

function caseView(name: string, over: Partial<EvalCaseView> & { last?: Partial<LastRun> } = {}): EvalCaseView {
  const { last, ...rest } = over;
  return {
    id: `id-${name}`,
    owner_kind: "agent",
    owner_id: "ag1",
    name,
    input_diff: "diff --git a/x b/x",
    input_files: null,
    input_meta: { title: "t", body: "b" },
    expected_output: [],
    notes: null,
    agent_id: "ag1",
    source_finding_id: null,
    created_at: "2026-10-01T00:00:00Z",
    summary: { items: 1, must_find: 1, must_not_flag: 0, chip: "CRITICAL·security" },
    last_run: { ...NEVER, ...last },
    ...rest,
  };
}

const AGG = {
  recall: 0.87,
  precision: 0.9,
  citation_accuracy: 1,
  traces_passed: 1,
  traces_total: 3,
  duration_ms: 1000,
  cost_usd: 0.01,
  per_trace: [],
};

function runSummary(over: Partial<EvalRunSummary> = {}): EvalRunSummary {
  return {
    id: "run1",
    agent_id: "ag1",
    agent_name: "Security Reviewer",
    agent_version: 2,
    model: "m",
    status: "done",
    partial: false,
    started_at: "2026-10-01T00:00:00Z",
    finished_at: "2026-10-01T00:00:05Z",
    case_ids: [],
    case_count: 3,
    errored_count: 0,
    cost_usd: 0.01,
    error: null,
    aggregate: AGG,
    na: { recall: false, precision: false, citation_accuracy: false },
    ...over,
  };
}

function dashboard(over: Partial<AgentEvalDashboard["dashboard"]> = {}): AgentEvalDashboard {
  return {
    dashboard: {
      owner_kind: "agent",
      owner_id: "ag1",
      cases_total: 3,
      current: {
        recall: 0.87,
        precision: 0.9,
        citation_accuracy: 1,
        traces_passed: 1,
        traces_total: 3,
        cost_usd: 0.01,
      },
      delta: { recall: 0.02, precision: -0.04, citation_accuracy: 0 },
      trend: [],
      recent_runs: [],
      alert: null,
      ...over,
    },
    runs: [],
    regression: null,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

let cases: EvalCaseView[];
let runs: EvalRunSummary[];
let dash: AgentEvalDashboard;

beforeEach(() => {
  cases = [];
  runs = [];
  dash = dashboard();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.endsWith("/eval-cases")) return Promise.resolve(jsonResponse(cases));
      if (url.endsWith("/eval-runs")) return Promise.resolve(jsonResponse(runs));
      if (url.endsWith("/eval-dashboard")) return Promise.resolve(jsonResponse(dash));
      return Promise.resolve(jsonResponse({}, 404));
    }),
  );
});

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <ToastProvider>
          <EvalsTab agentId="ag1" />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const rowOf = (name: string) => screen.getByText(name).parentElement as HTMLElement;

describe("EvalsTab", () => {
  it("shows a loading state while the cases are still being fetched", () => {
    // never-resolving fetch keeps every query in its loading state
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    renderTab();
    expect(screen.getByText("Loading cases…")).toBeInTheDocument();
    expect(screen.queryByText(/No eval cases yet/)).not.toBeInTheDocument();
  });

  it("shows the empty state when the agent has no cases", async () => {
    renderTab();
    expect(await screen.findByText(/No eval cases yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run all evals \(0\)/ })).toBeDisabled();
  });

  it("renders tiles, never-run / passed / failed rows (icon + text) and the dashboard link", async () => {
    cases = [
      caseView("stripe-key-leak", {
        last: { status: "passed", ran_at: "2026-10-01T00:00:00Z", actual_count: 1 },
      }),
      caseView("ssrf-webhook", {
        last: { status: "failed", ran_at: "2026-10-01T00:00:00Z", actual_count: 0 },
      }),
      caseView("clean-refactor-no-flags", {
        summary: { items: 0, must_find: 0, must_not_flag: 0, chip: null },
        last: { expected_count: 0 },
      }),
    ];
    renderTab();

    // four tiles
    expect(await screen.findByText("RECALL")).toBeInTheDocument();
    expect(screen.getByText("PRECISION")).toBeInTheDocument();
    expect(screen.getByText("CITATION ACCURACY")).toBeInTheDocument();
    expect(screen.getByText("TRACES PASSED")).toBeInTheDocument();
    expect(await screen.findByText("87%")).toBeInTheDocument();
    expect(screen.getByText("1/3")).toBeInTheDocument();

    expect(await screen.findByText("1/3 passing")).toBeInTheDocument();
    expect(within(rowOf("stripe-key-leak")).getByText("passed")).toBeInTheDocument();
    expect(within(rowOf("stripe-key-leak")).getByText("expected 1 finding, got 1")).toBeInTheDocument();
    expect(within(rowOf("stripe-key-leak")).getByText("CRITICAL·security")).toBeInTheDocument();
    expect(within(rowOf("ssrf-webhook")).getByText("failed")).toBeInTheDocument();
    expect(within(rowOf("ssrf-webhook")).getByText("expected 1 finding, got 0")).toBeInTheDocument();
    const never = rowOf("clean-refactor-no-flags");
    expect(within(never).getAllByText("never run").length).toBeGreaterThan(0);
    expect(within(never).getByText("empty []")).toBeInTheDocument();
    // controls carry accessible names
    expect(within(never).getByRole("button", { name: "Run" })).toBeInTheDocument();
    expect(within(never).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(within(never).getByRole("button", { name: "Delete" })).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "View full dashboard" })).toHaveAttribute("href", "/eval/ag1");
  });

  it("shows Running… on the run control while the SERVER reports a running full run", async () => {
    cases = [caseView("stripe-key-leak")];
    runs = [runSummary({ status: "running", aggregate: null, finished_at: null })];
    renderTab();
    const btn = await screen.findByRole("button", { name: /Running…/ });
    expect(btn).toBeDisabled();
  });
});
