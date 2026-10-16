/* hooks/multi-agent.ts — React Query hooks for SPEC-05 multi-agent review:
   per-agent estimates, starting a multi-agent run, and the results view. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentRunEstimate,
  MultiAgentLatestResponse,
  MultiAgentRunView,
  ReviewStartResponse,
} from "@devdigest/shared";

/** Per-enabled-agent time/cost estimates (mean over each agent's recent runs). */
export function useAgentEstimates(enabled = true) {
  return useQuery({
    queryKey: ["multi-agent-estimates"],
    queryFn: () => api.get<AgentRunEstimate[]>("/multi-agent/estimates"),
    enabled,
    staleTime: 60_000,
  });
}

/** Start one multi-agent review (`POST /pulls/:id/review {agentIds}`). Errors,
   including the 429 from the per-route cap, are toasted by the global
   MutationCache handler — no second toast here. */
export function useStartMultiAgentReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agentIds }: { prId: string; agentIds: string[] }) =>
      api.post<ReviewStartResponse>(`/pulls/${prId}/review`, { agentIds }),
    onSuccess: (_d, { prId }) => {
      qc.invalidateQueries({ queryKey: ["reviews", prId] });
      qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
      qc.invalidateQueries({ queryKey: ["pr-active-runs", prId] });
      qc.invalidateQueries({ queryKey: ["multi-agent-latest"] });
    },
  });
}

/** One multi-agent run. Polls while the server reports it in flight, so a
   reload mid-run keeps updating (server-sourced, like usePrRuns). */
export function useMultiAgentRun(id: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-agent-run", id],
    queryFn: () => api.get<MultiAgentRunView>(`/multi-agent-runs/${id}`),
    enabled: !!id,
    refetchInterval: (query) => (query.state.data?.in_flight ? 4000 : false),
  });
}

/** Id of the newest multi-agent run (or null) — the sidebar entry's target. */
export function useLatestMultiAgentRun() {
  return useQuery({
    queryKey: ["multi-agent-latest"],
    queryFn: () => api.get<MultiAgentLatestResponse>("/multi-agent-runs/latest"),
  });
}

/** Accept/dismiss every finding in an overlap group at once (AC-30). */
export function useGroupFindingAction(parentId: string, prId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ findingIds, action }: { findingIds: string[]; action: "accept" | "dismiss" }) =>
      Promise.all(findingIds.map((id) => api.post(`/findings/${id}/${action}`))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["multi-agent-run", parentId] });
      if (prId) qc.invalidateQueries({ queryKey: ["reviews", prId] });
      qc.invalidateQueries({ queryKey: ["pulls"] });
    },
  });
}
