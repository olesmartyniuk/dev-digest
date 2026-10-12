/* hooks/eval.ts — React Query hooks for the L06 eval pipeline (SPEC-04):
   eval cases, background eval runs, dashboards, "Turn into eval case".
   Types only from @devdigest/shared (never a schema value — keeps zod out of
   the client bundle). */
"use client";

import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { notify } from "../toast";
import type {
  AgentEvalDashboard,
  EvalCaseBodyInput,
  EvalCaseView,
  EvalRunDetail,
  EvalRunSummary,
  EvalWorkspaceDashboard,
  StartEvalRunResponse,
  TurnIntoEvalCaseResponse,
} from "@devdigest/shared";

/** Poll while any run is in flight so the server-sourced "Running…" state self-clears. */
const RUN_POLL_MS = 3000;
const anyRunning = (runs: { status: string }[] | undefined) =>
  (runs ?? []).some((r) => r.status === "running");

// ---- Cases ----
export function useAgentEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-cases", agentId],
    queryFn: () => api.get<EvalCaseView[]>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
  });
}

export function useEvalCase(caseId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-case", caseId],
    queryFn: () => api.get<EvalCaseView>(`/eval-cases/${caseId}`),
    enabled: !!caseId,
  });
}

function useInvalidateEval(agentId: string) {
  const qc = useQueryClient();
  return React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
    qc.invalidateQueries({ queryKey: ["eval-dashboard", agentId] });
    qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
  }, [qc, agentId]);
}

export function useCreateEvalCase(agentId: string) {
  const invalidate = useInvalidateEval(agentId);
  return useMutation({
    mutationFn: (body: EvalCaseBodyInput) =>
      api.post<EvalCaseView>(`/agents/${agentId}/eval-cases`, body),
    onSuccess: invalidate,
  });
}

export function useUpdateEvalCase(agentId: string) {
  const invalidate = useInvalidateEval(agentId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: EvalCaseBodyInput }) =>
      api.put<EvalCaseView>(`/eval-cases/${id}`, body),
    onSuccess: (data) => {
      qc.setQueryData(["eval-case", data.id], data);
      invalidate();
    },
  });
}

export function useDeleteEvalCase(agentId: string) {
  const invalidate = useInvalidateEval(agentId);
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/eval-cases/${id}`),
    onSuccess: invalidate,
  });
}

// ---- Runs ----
/** Run history for an agent. Its `running` rows ARE the server-sourced in-flight state (AC-35). */
export function useAgentEvalRuns(agentId: string | null | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["eval-runs", agentId],
    queryFn: () => api.get<EvalRunSummary[]>(`/agents/${agentId}/eval-runs`),
    enabled: !!agentId,
    refetchInterval: (q) => (anyRunning(q.state.data) ? RUN_POLL_MS : false),
  });

  // running -> finished: refresh the case list + dashboards that the run just changed.
  const running = anyRunning(query.data);
  const wasRunning = React.useRef(false);
  React.useEffect(() => {
    if (wasRunning.current && !running) {
      qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    }
    wasRunning.current = running;
  }, [running, qc, agentId]);

  return query;
}

export function useStartEvalRun(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseIds?: string[]) =>
      api.post<StartEvalRunResponse>(
        `/agents/${agentId}/eval-runs`,
        caseIds ? { case_ids: caseIds } : {},
      ),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["eval-runs", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard", agentId] });
    },
    onError: (err: Error) => notify.error(err.message),
  });
}

export function useEvalRun(runId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-run", runId],
    queryFn: () => api.get<EvalRunDetail>(`/eval-runs/${runId}`),
    enabled: !!runId,
    retry: false,
  });
}

// ---- Dashboards ----
export function useAgentEvalDashboard(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-dashboard", agentId],
    queryFn: () => api.get<AgentEvalDashboard>(`/agents/${agentId}/eval-dashboard`),
    enabled: !!agentId,
    refetchInterval: (q) => (anyRunning(q.state.data?.runs) ? RUN_POLL_MS : false),
  });
}

export function useEvalWorkspaceDashboard() {
  return useQuery({
    queryKey: ["eval-dashboard"],
    queryFn: () => api.get<EvalWorkspaceDashboard>("/eval-dashboard"),
  });
}

// ---- Turn a decided finding into a case ----
/** The success toast is raised by the calling component's hook (it owns the copy). */
export function useTurnIntoEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (findingId: string) =>
      api.post<TurnIntoEvalCaseResponse>(`/findings/${findingId}/eval-case`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["eval-cases", res.case.owner_id] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}
