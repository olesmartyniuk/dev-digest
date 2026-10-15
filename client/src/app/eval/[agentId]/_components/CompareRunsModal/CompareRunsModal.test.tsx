import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalRunDetail } from "@devdigest/shared";
import messages from "../../../../../../messages/en/eval.json";
import { CompareRunsModal } from "./CompareRunsModal";
import { diffLines, orderOldNew, sameCaseSet } from "./helpers";

afterEach(cleanup);

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

function run(over: Partial<EvalRunDetail> & { id: string }): EvalRunDetail {
  return {
    agent_id: "ag1",
    agent_name: "Security Reviewer",
    agent_version: 6,
    model: "m",
    status: "done",
    partial: false,
    started_at: "2026-10-01T00:00:00Z",
    finished_at: "2026-10-01T00:00:05Z",
    case_ids: ["c1", "c2"],
    case_count: 2,
    errored_count: 0,
    cost_usd: 0.01,
    error: null,
    aggregate: {
      recall: 0.8,
      precision: 0.9,
      citation_accuracy: 1,
      traces_passed: 1,
      traces_total: 2,
      duration_ms: 1,
      cost_usd: 0.01,
      per_trace: [],
    },
    na: { recall: false, precision: false, citation_accuracy: false },
    config: { provider: "openrouter", model: "m", system_prompt: "Be careful.\nFlag secrets.", strategy: "single-pass", skill_ids: [] },
    cases: [],
    ...over,
  };
}

const OLD = run({ id: "old" });
const NEW = run({
  id: "new",
  agent_version: 7,
  started_at: "2026-10-02T00:00:00Z",
  cost_usd: 0.0223,
  aggregate: { ...OLD.aggregate!, recall: 0.82, precision: 0.86, citation_accuracy: 1, cost_usd: 0.0223 },
  config: { ...OLD.config, system_prompt: "Be careful.\nFlag every secret.\nNever flag test fixtures." },
});

let responses: Record<string, Response>;

beforeEach(() => {
  responses = {
    "/eval-runs/old": jsonResponse(OLD),
    "/eval-runs/new": jsonResponse(NEW),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const hit = Object.entries(responses).find(([suffix]) => url.endsWith(suffix));
      return Promise.resolve(hit ? hit[1] : jsonResponse({}, 404));
    }),
  );
});

function renderModal(ids: [string, string]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <CompareRunsModal runIds={ids} onClose={() => {}} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("CompareRunsModal", () => {
  it("orders old -> new by started_at (not click order), shows signed deltas and the prompt diff", async () => {
    // newer run selected FIRST
    renderModal(["new", "old"]);
    expect(await screen.findByText("Compare runs · v6 → v7")).toBeInTheDocument();

    expect(screen.getByText("80% → 82%")).toBeInTheDocument();
    expect(screen.getByText("+2.0 pts")).toBeInTheDocument();
    expect(screen.getByText("90% → 86%")).toBeInTheDocument();
    expect(screen.getByText("−4.0 pts")).toBeInTheDocument();
    expect(screen.getByText("+$0.0123")).toBeInTheDocument(); // cost, USD

    expect(screen.getByText("SYSTEM PROMPT DIFF")).toBeInTheDocument();
    expect(screen.getByText(/^−\s+Flag secrets\.$/)).toBeInTheDocument();
    expect(screen.getByText(/^\+\s+Flag every secret\.$/)).toBeInTheDocument();
    expect(screen.getByText(/^\+\s+Never flag test fixtures\.$/)).toBeInTheDocument();
    // same case set -> no warning
    expect(screen.queryByText(/not like-for-like/)).not.toBeInTheDocument();
  });

  it('states "no prompt change" when both runs used the same agent version', async () => {
    responses["/eval-runs/new"] = jsonResponse({ ...NEW, agent_version: 6 });
    renderModal(["old", "new"]);
    expect(await screen.findByText("No prompt change (same agent version).")).toBeInTheDocument();
    expect(screen.queryByText(/^\+\s/)).not.toBeInTheDocument();
  });

  it("warns when the runs covered different case sets", async () => {
    responses["/eval-runs/new"] = jsonResponse({ ...NEW, case_ids: ["c1", "c9"] });
    renderModal(["old", "new"]);
    expect(await screen.findByText(/not like-for-like/)).toBeInTheDocument();
  });

  it("shows an error state when one of the runs no longer exists (404)", async () => {
    delete responses["/eval-runs/old"];
    renderModal(["old", "new"]);
    expect(await screen.findByText("One of the selected runs no longer exists.")).toBeInTheDocument();
  });
});

describe("compare helpers", () => {
  it("orderOldNew / sameCaseSet / diffLines", () => {
    expect(orderOldNew({ started_at: "2026-02-01" }, { started_at: "2026-01-01" })[0].started_at).toBe("2026-01-01");
    expect(sameCaseSet(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameCaseSet(["a"], ["a", "b"])).toBe(false);
    expect(diffLines("a\nb", "a\nc")).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "c" },
    ]);
  });
});
