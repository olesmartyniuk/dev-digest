/* hooks/ci.ts — React Query hooks for Export-to-CI + CI Runs (SPEC-05).
   Types only from @devdigest/shared (never a schema value — keeps zod out of
   the client bundle). GET hooks stay pure; GitHub is only contacted by the
   explicit sync / preview / install mutations. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentCiOverview,
  CiExport,
  CiInstallInputBody,
  CiPreview,
  CiPreviewInputBody,
  CiRunRow,
  CiSyncResult,
} from "@devdigest/shared";

export function useAgentCi(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-ci", agentId],
    queryFn: () => api.get<AgentCiOverview>(`/agents/${agentId}/ci`),
    enabled: !!agentId,
  });
}

export function useCiRuns() {
  return useQuery({
    queryKey: ["ci-runs"],
    queryFn: () => api.get<CiRunRow[]>("/ci/runs"),
  });
}

/** Ingest new runner results from GitHub, then refresh every CI list. */
export function useCiSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId?: string) =>
      api.post<CiSyncResult>("/ci/sync", agentId ? { agent_id: agentId } : {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ci-runs"] });
      qc.invalidateQueries({ queryKey: ["agent-ci"] });
    },
  });
}

export function useCiPreview(agentId: string) {
  return useMutation({
    mutationFn: (body: CiPreviewInputBody) =>
      api.post<CiPreview>(`/agents/${agentId}/export-ci/preview`, body),
  });
}

/** No toast on error — the wizard shows the message inline. */
export function useCiInstall(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CiInstallInputBody) =>
      api.post<CiExport>(`/agents/${agentId}/export-ci`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-ci", agentId] }),
  });
}
