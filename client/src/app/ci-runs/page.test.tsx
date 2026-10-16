import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CiRunRow } from "@devdigest/shared";
import messages from "../../../messages/en/ci.json";
import CiRunsPage from "./page";

// The shell is covered by its own tests; here only the page body matters.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

afterEach(cleanup);

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    statusText: "",
    json: () => Promise.resolve(body),
  } as Response;
}

const recent = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
const run = (over: Partial<CiRunRow>): CiRunRow => ({
  id: "r",
  ran_at: recent(5),
  repo: "acme/app",
  pr_number: 1,
  agent_id: "a1",
  agent_name: "Security Reviewer",
  status: "succeeded",
  blocking: false,
  findings_count: 1,
  cost_usd: null,
  duration_ms: 1000,
  job_url: null,
  ...over,
});

let runs: CiRunRow[] | "error";
let syncBody: { ingested: number; skipped: number; error: string | null };

beforeEach(() => {
  runs = [];
  syncBody = { ingested: 0, skipped: 0, error: null };
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith("/ci/sync") && init?.method === "POST") return Promise.resolve(jsonResponse(syncBody));
      if (url.endsWith("/ci/runs")) {
        if (runs === "error") {
          return Promise.resolve(jsonResponse({ error: { code: "x", message: "boom" } }, 500));
        }
        return Promise.resolve(jsonResponse(runs));
      }
      return Promise.resolve(jsonResponse({}, 404));
    }),
  );
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
        <CiRunsPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("/ci-runs", () => {
  it("shows the empty state when there are no runs", async () => {
    renderPage();
    expect(await screen.findByText("No CI runs yet")).toBeInTheDocument();
  });

  it("recovers from a load error through Retry", async () => {
    runs = "error";
    renderPage();
    expect(await screen.findByText("Could not load CI runs")).toBeInTheDocument();
    runs = [];
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByText("No CI runs yet")).toBeInTheDocument();
  });

  it("keeps the rows visible and warns when the sync reports an error, in server order", async () => {
    runs = [
      run({ id: "new", pr_number: 22, agent_name: "Newest" }),
      run({ id: "old", pr_number: 11, agent_name: "Older", ran_at: recent(60) }),
    ];
    syncBody = { ingested: 0, skipped: 0, error: "Could not fetch CI results from GitHub: 403" };
    renderPage();
    expect(await screen.findByText("#22")).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent("Could not fetch CI results from GitHub: 403");
    const body = screen.getAllByRole("row").slice(1);
    expect(within(body[0]!).getByText("#22")).toBeInTheDocument();
    expect(within(body[1]!).getByText("#11")).toBeInTheDocument();
  });
});
