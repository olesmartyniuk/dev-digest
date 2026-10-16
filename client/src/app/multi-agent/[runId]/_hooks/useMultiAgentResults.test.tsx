import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MultiAgentRunView } from "@devdigest/shared";

const replace = vi.fn();
let search = "";
const get = vi.fn();
const post = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/lib/api", () => ({
  api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) },
}));
vi.mock("@/app/repos/[repoId]/pulls/[number]/_hooks/useTurnIntoEvalCase", () => ({
  useTurnIntoEvalCase: () => ({ turn: vi.fn(), pendingId: null }),
}));

import { useMultiAgentResults } from "./useMultiAgentResults";

const run: MultiAgentRunView = {
  id: "m1",
  pr_id: "pr1",
  pr_number: 7,
  pr_title: "t",
  repo_id: "repo",
  ran_at: "2026-01-01T00:00:00Z",
  agent_count: 2,
  total_duration_ms: 1000,
  total_cost_usd: 0.1,
  cost_complete: true,
  in_flight: false,
  columns: [
    { run_id: "r1", agent_name: "A" },
    { run_id: "r2", agent_name: "B" },
  ] as MultiAgentRunView["columns"],
  groups: [
    {
      id: "g1",
      file: "a.ts",
      start_line: 1,
      end_line: 2,
      title: "x",
      severity: "WARNING",
      finding_ids: ["f1", "f2"],
      run_ids: ["r1", "r2"],
    },
  ],
  locations: [],
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  replace.mockReset();
  get.mockReset();
  post.mockReset();
  search = "";
  get.mockResolvedValue(run);
  post.mockResolvedValue(undefined);
});

describe("useMultiAgentResults", () => {
  it("defaults to Columns / first agent, and reads mode, agent, trace and conflicts filter from the URL", async () => {
    const { result, rerender } = renderHook(() => useMultiAgentResults("m1"), { wrapper });
    await waitFor(() => expect(result.current.data?.id).toBe("m1"));
    expect(get).toHaveBeenCalledWith("/multi-agent-runs/m1");
    expect(result.current.view).toBe("columns");
    expect(result.current.agentTab).toBe("r1");
    expect(result.current.traceRunId).toBeNull();
    expect(result.current.onlyConflicts).toBe(false);

    search = "view=tabs&agent=r2&trace=r2&only=conflicts";
    rerender();
    expect(result.current.view).toBe("tabs");
    expect(result.current.agentTab).toBe("r2");
    expect(result.current.traceRunId).toBe("r2");
    expect(result.current.onlyConflicts).toBe(true);

    search = "view=bogus";
    rerender();
    expect(result.current.view).toBe("columns");
  });

  it("writes UI state to the URL, dropping default values and keeping other params", async () => {
    const { result } = renderHook(() => useMultiAgentResults("m1"), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    act(() => result.current.setView("tabs"));
    expect(replace).toHaveBeenLastCalledWith("/multi-agent/m1?view=tabs");

    search = "view=tabs&only=conflicts";
    const again = renderHook(() => useMultiAgentResults("m1"), { wrapper });
    act(() => again.result.current.setView("columns"));
    expect(replace).toHaveBeenLastCalledWith("/multi-agent/m1?only=conflicts");
    act(() => again.result.current.setOnlyConflicts(false));
    expect(replace).toHaveBeenLastCalledWith("/multi-agent/m1?view=tabs");
    act(() => again.result.current.setTrace("r1"));
    expect(replace).toHaveBeenLastCalledWith("/multi-agent/m1?view=tabs&only=conflicts&trace=r1");
    act(() => again.result.current.setTrace(null));
    expect(replace).toHaveBeenLastCalledWith("/multi-agent/m1?view=tabs&only=conflicts");
  });

  it("resolves a finding's group and applies Dismiss to every underlying finding id", async () => {
    const { result } = renderHook(() => useMultiAgentResults("m1"), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.groupOf("f2")?.id).toBe("g1");
    expect(result.current.groupOf("other")).toBeUndefined();

    await act(() => result.current.groupAction.mutateAsync({ findingIds: ["f1", "f2"], action: "dismiss" }));
    expect(post.mock.calls.map((c) => c[0]).sort()).toEqual(["/findings/f1/dismiss", "/findings/f2/dismiss"]);
  });
});
