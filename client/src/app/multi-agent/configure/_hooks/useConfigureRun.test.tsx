import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

const push = vi.fn();
const replace = vi.fn();
const mutateAsync = vi.fn();
let search = "pr=pr1";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ repoId: "r1" }) }));
vi.mock("@/lib/hooks/core", () => ({ usePulls: () => ({ data: [], isLoading: false }) }));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({
    data: [
      { id: "a1", name: "Sec", enabled: true },
      { id: "a2", name: "Off", enabled: false },
    ],
  }),
}));
vi.mock("@/lib/hooks/multi-agent", () => ({
  useAgentEstimates: () => ({ data: [] }),
  useStartMultiAgentReview: () => ({ mutateAsync, isPending: false }),
}));

import { useConfigureRun } from "./useConfigureRun";

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  mutateAsync.mockReset();
  search = "pr=pr1";
});

describe("useConfigureRun", () => {
  it("starts the ticked agents for the chosen PR and navigates to the new parent run", async () => {
    mutateAsync.mockResolvedValue({ multi_agent_run_id: "ma-7" });
    const { result } = renderHook(() => useConfigureRun());
    expect(result.current.agents.map((a) => a.id)).toEqual(["a1"]);

    act(() => result.current.selection.toggle("a1"));
    await act(() => result.current.run());

    expect(mutateAsync).toHaveBeenCalledWith({ prId: "pr1", agentIds: ["a1"] });
    expect(push).toHaveBeenCalledWith("/multi-agent/ma-7");
  });

  it("stays on the screen when the start is rejected, and never starts without a PR or agents", async () => {
    mutateAsync.mockRejectedValue(new Error("429"));
    const { result } = renderHook(() => useConfigureRun());

    await act(() => result.current.run()); // nothing ticked
    expect(mutateAsync).not.toHaveBeenCalled();

    act(() => result.current.selection.toggle("a1"));
    await act(() => result.current.run());
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();

    search = "";
    const noPr = renderHook(() => useConfigureRun());
    act(() => noPr.result.current.selection.toggle("a1"));
    await act(() => noPr.result.current.run());
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });
});
