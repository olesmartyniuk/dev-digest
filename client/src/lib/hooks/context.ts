/* hooks/context.ts — React Query hooks for Project Context (SPEC-01 / L05):
   the repo-scoped document listing/preview/rescan, and the agent/skill
   attachment endpoints. Replaces the unused `useContextFiles`/
   `useReindexContext` placeholders that used to live in hooks/core.ts. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentContext,
  ContextListing,
  ContextPreview,
  SkillContext,
  SpecFile,
} from "@devdigest/shared";

/** `GET /repos/:id/context` — scans on a cache miss, otherwise serves the server's in-memory scan cache. */
export function useContextListing(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["context", repoId],
    queryFn: () => api.get<ContextListing>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

/** `POST /repos/:id/context/rescan` — forces a fresh scan (AC-17). */
export function useRescanContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.post<ContextListing>(`/repos/${repoId}/context/rescan`),
    onSuccess: (data, repoId) => qc.setQueryData(["context", repoId], data),
  });
}

/** `GET /repos/:id/context/file?path=` — the read-only raw-source preview (D3). */
export function useContextDocument(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: ["context-doc", repoId, path],
    queryFn: () => api.get<SpecFile>(`/repos/${repoId}/context/file?path=${encodeURIComponent(path!)}`),
    enabled: !!repoId && !!path,
  });
}

/** `GET /agents/:id/context` — an agent's own + inherited + effective project-context paths. */
export function useAgentContext(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-context", agentId],
    queryFn: () => api.get<AgentContext>(`/agents/${agentId}/context`),
    enabled: !!agentId,
  });
}

/** `PUT /agents/:id/context` — replace the agent's whole ordered set of attached paths. */
export function useSetAgentContext(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) => api.put<AgentContext>(`/agents/${agentId}/context`, { paths }),
    onSuccess: (data) => {
      qc.setQueryData(["agent-context", agentId], data);
      // "used by" counts on the listing change with every attach/detach.
      qc.invalidateQueries({ queryKey: ["context"] });
    },
  });
}

/** `GET /skills/:id/context` — a skill's own attached paths. */
export function useSkillContext(skillId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-context", skillId],
    queryFn: () => api.get<SkillContext>(`/skills/${skillId}/context`),
    enabled: !!skillId,
  });
}

/** `PUT /skills/:id/context` — replace the skill's whole ordered set of attached paths. */
export function useSetSkillContext(skillId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) => api.put<SkillContext>(`/skills/${skillId}/context`, { paths }),
    onSuccess: (data) => {
      qc.setQueryData(["skill-context", skillId], data);
      // "used by" counts, every linking agent's inherited context, and this
      // skill's own SERIALIZES AS preview all depend on this set.
      qc.invalidateQueries({ queryKey: ["context"] });
      qc.invalidateQueries({ queryKey: ["agent-context"] });
      qc.invalidateQueries({ queryKey: ["skill-context-preview", skillId] });
    },
  });
}

/** `GET /skills/:id/context/preview?repo_id=` — the serialized "## Project context" block (AC-9). */
export function useSkillContextPreview(
  skillId: string | null | undefined,
  repoId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["skill-context-preview", skillId, repoId],
    queryFn: () => api.get<ContextPreview>(`/skills/${skillId}/context/preview?repo_id=${repoId}`),
    enabled: !!skillId && !!repoId,
  });
}
