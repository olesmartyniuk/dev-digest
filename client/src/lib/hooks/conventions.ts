/* hooks/conventions.ts — React Query hooks for the Conventions Extractor. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Convention,
  ConventionCategory,
  ConventionExtractResult,
  ConventionSkillDraft,
  ConventionStatus,
  Skill,
} from "@devdigest/shared";

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<Convention[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/**
 * Run an extraction. This is the one mutation here that costs money and time
 * (a clone read plus a model call), so it has no optimistic path: the scan's
 * own result — candidates AND the stats/drops that explain them — replaces the
 * cached list directly rather than being re-fetched.
 */
export function useExtractConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionExtractResult>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (result) => {
      qc.setQueryData(["conventions", repoId], result.conventions);
      qc.invalidateQueries({ queryKey: ["conventionSkillDraft", repoId] });
    },
  });
}

export interface UpdateConventionInput {
  id: string;
  patch: {
    status?: ConventionStatus;
    rule?: string;
    rationale?: string | null;
    category?: ConventionCategory;
  };
}

export function useUpdateConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateConventionInput) =>
      api.patch<Convention>(`/conventions/${id}`, patch),
    onSuccess: (updated) => {
      // Patch the row in place: accept/reject is a rapid-fire interaction and a
      // full refetch between clicks makes the list flicker under the cursor.
      qc.setQueryData<Convention[]>(["conventions", repoId], (prev) =>
        prev?.map((c) => (c.id === updated.id ? updated : c)),
      );
      qc.invalidateQueries({ queryKey: ["conventionSkillDraft", repoId] });
    },
  });
}

/** The server-merged skill draft for the repo's accepted conventions. */
export function useConventionSkillDraft(repoId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["conventionSkillDraft", repoId],
    queryFn: () => api.get<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill-draft`),
    enabled: !!repoId && enabled,
    // The draft is derived from rows that change as the user accepts/rejects,
    // so it must never be served stale into the modal.
    staleTime: 0,
  });
}

export interface CreateConventionSkillInput {
  name: string;
  description?: string;
  body: string;
  enabled?: boolean;
  agent_ids?: string[];
}

export interface CreateConventionSkillResult {
  skill: Skill;
  linked_agent_ids: string[];
}

export function useCreateConventionSkill(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConventionSkillInput) =>
      api.post<CreateConventionSkillResult>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      for (const agentId of result.linked_agent_ids) {
        qc.invalidateQueries({ queryKey: ["agent-skills", agentId] });
      }
    },
  });
}
