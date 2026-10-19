/* useConfigureRun — orchestration for the Configure run screen (SPEC-05, M2/M3):
   the PR (from ?pr=), enabled agents, estimates, tick state and the start call. */
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useAgents } from "@/lib/hooks/agents";
import { usePulls } from "@/lib/hooks/core";
import { useAgentEstimates, useStartMultiAgentReview } from "@/lib/hooks/multi-agent";
import { useActiveRepo } from "@/lib/repo-context";
import { useAgentSelection } from "@/components/multi-agent";

export function useConfigureRun() {
  const router = useRouter();
  const params = useSearchParams();
  const prId = params.get("pr");
  const { repoId } = useActiveRepo();
  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const { data: allAgents } = useAgents();
  const { data: estimates } = useAgentEstimates();
  const selection = useAgentSelection();
  const start = useStartMultiAgentReview();

  const agents = (allAgents ?? []).filter((a) => a.enabled);

  const setPrId = (id: string) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("pr", id);
    else next.delete("pr");
    router.replace(`/multi-agent/configure${next.size ? `?${next}` : ""}`);
  };

  const run = async () => {
    if (!prId || selection.count === 0) return;
    try {
      const res = await start.mutateAsync({ prId, agentIds: selection.selected });
      router.push(`/multi-agent/${res.multi_agent_run_id}`);
    } catch {
      /* reported by the global mutation toast; stay on this screen */
    }
  };

  return {
    prId,
    setPrId,
    pulls: pulls ?? [],
    pullsLoading,
    agents,
    estimates,
    selection,
    start,
    run,
  };
}
