/* useMultiAgentResults — orchestration for the multi-agent results page
   (SPEC-05): the run query (server-sourced polling), URL-held UI state
   (?view= ?agent= ?trace= ?only=), and the group-wide finding actions. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { MultiAgentGroup } from "@devdigest/shared";
import { useGroupFindingAction, useMultiAgentRun } from "@/lib/hooks/multi-agent";
import { useTurnIntoEvalCase } from "@/app/repos/[repoId]/pulls/[number]/_hooks/useTurnIntoEvalCase";

export type ResultsMode = "columns" | "tabs";

export function useMultiAgentResults(runId: string) {
  const router = useRouter();
  const search = useSearchParams();
  const { data, isLoading, isError, error, refetch } = useMultiAgentRun(runId);

  const view: ResultsMode = search.get("view") === "tabs" ? "tabs" : "columns";
  const agentTab = search.get("agent") ?? data?.columns[0]?.run_id ?? null;
  const traceRunId = search.get("trace");
  const onlyConflicts = search.get("only") === "conflicts";

  /** One `router.replace` per change (one history entry, not one per key). */
  const writeParams = React.useCallback(
    (patch: Record<string, string | null>) => {
      const sp = new URLSearchParams(search.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null) sp.delete(k);
        else sp.set(k, v);
      }
      const qs = sp.toString();
      router.replace(`/multi-agent/${runId}${qs ? `?${qs}` : ""}`);
    },
    [search, router, runId],
  );

  const groupAction = useGroupFindingAction(runId, data?.pr_id);
  const turnIntoEval = useTurnIntoEvalCase();

  const groupByFindingId = React.useMemo(() => {
    const m = new Map<string, MultiAgentGroup>();
    for (const g of data?.groups ?? []) for (const id of g.finding_ids) m.set(id, g);
    return m;
  }, [data?.groups]);

  return {
    data,
    isLoading,
    isError,
    error,
    refetch,
    view,
    setView: (v: ResultsMode) => writeParams({ view: v === "columns" ? null : v }),
    agentTab,
    setAgentTab: (id: string) => writeParams({ agent: id }),
    traceRunId,
    setTrace: (id: string | null) => writeParams({ trace: id }),
    onlyConflicts,
    setOnlyConflicts: (on: boolean) => writeParams({ only: on ? "conflicts" : null }),
    groupAction,
    turnIntoEval,
    groupOf: (findingId: string) => groupByFindingId.get(findingId),
  };
}
