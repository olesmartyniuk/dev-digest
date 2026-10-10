"use client";

import { useActiveRepo } from "@/lib/repo-context";
import { useAgentContext, useSetAgentContext } from "@/lib/hooks/context";

/** Data + attach/reorder orchestration for the agent editor's Context tab. */
export function useAgentContextTab(agentId: string) {
  const { repoId } = useActiveRepo();
  const { data } = useAgentContext(agentId);
  const mutation = useSetAgentContext(agentId);

  return {
    repoId,
    attached: data?.paths ?? [],
    inherited: data?.inherited ?? [],
    effective: data?.effective ?? [],
    setAttached: (paths: string[]) => mutation.mutate(paths),
    busy: mutation.isPending,
    isLoading: data === undefined,
  };
}
