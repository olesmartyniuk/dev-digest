"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useAgentEvalCases,
  useAgentEvalDashboard,
  useAgentEvalRuns,
  useDeleteEvalCase,
  useStartEvalRun,
} from "@/lib/hooks/eval";
import { passingCount, runningState } from "./helpers";

/** `?case=` value that opens the editor for a not-yet-created case. */
export const NEW_CASE = "new";

/**
 * Data + orchestration for the Evals tab. In-flight state is server-sourced
 * (the agent's `running` eval runs), so "Running…" survives a reload. The case
 * editor's open state lives in `?case=<id|new>` (URL state convention).
 */
export function useAgentEvalsTab(agentId: string) {
  const cases = useAgentEvalCases(agentId);
  const dashboard = useAgentEvalDashboard(agentId);
  const runs = useAgentEvalRuns(agentId);
  const start = useStartEvalRun(agentId);
  const del = useDeleteEvalCase(agentId);
  const search = useSearchParams();
  const router = useRouter();

  const { isRunningAll, runningCaseId } = runningState(runs.data);
  const startMutate = start.mutate;
  const deleteMutate = del.mutate;

  const runAll = React.useCallback(() => startMutate(undefined), [startMutate]);
  const runCase = React.useCallback((id: string) => startMutate([id]), [startMutate]);
  const deleteCase = React.useCallback((id: string) => deleteMutate(id), [deleteMutate]);

  const caseParam = search.get("case");
  const setCaseParam = React.useCallback(
    (value: string | null) => {
      const sp = new URLSearchParams(search.toString());
      if (value) sp.set("case", value);
      else sp.delete("case");
      router.replace(`/agents/${agentId}?${sp.toString()}`);
    },
    [search, router, agentId],
  );

  const list = cases.data ?? [];
  return {
    cases: list,
    dashboard: dashboard.data,
    runs: runs.data,
    isLoading: cases.isLoading,
    isError: cases.isError,
    passing: passingCount(list),
    isRunningAll: isRunningAll || (start.isPending && start.variables === undefined),
    runningCaseId,
    runAll,
    runCase,
    deleteCase,
    editor: {
      /** null = closed, NEW_CASE = new case, otherwise a case id. */
      current: caseParam,
      open: (target: string) => setCaseParam(target),
      close: () => setCaseParam(null),
    },
  };
}
