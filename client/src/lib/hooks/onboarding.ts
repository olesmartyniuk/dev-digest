/* hooks/onboarding.ts — React Query hooks for the Onboarding Tour (SPEC-02 / L05):
     GET  /repos/:id/onboarding          → the stored tour, or the not_generated empty state
     POST /repos/:id/onboarding/generate → (re)generate it, inline
     GET  /repos/:id/onboarding/file     → read-only source preview for a tour link
   Not added to `hooks/index.ts` — `conventions.ts` is not in that barrel
   either; import from `@/lib/hooks/onboarding` directly. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { OnboardingTour, SpecFile } from "@devdigest/shared";

/** `GET /repos/:id/onboarding` — the stored tour, or the empty `not_generated` state. */
export function useOnboardingTour(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["onboarding", repoId],
    queryFn: () => api.get<OnboardingTour>(`/repos/${repoId}/onboarding`),
    enabled: !!repoId,
  });
}

/** `POST /repos/:id/onboarding/generate` — (re)generate, inline, one LLM call. */
export function useGenerateOnboarding(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<OnboardingTour>(`/repos/${repoId}/onboarding/generate`),
    onSuccess: (data) => {
      qc.setQueryData(["onboarding", repoId], data);
      qc.invalidateQueries({ queryKey: ["onboarding-file", repoId] });
    },
    onError: (err) => {
      // A 409 index_not_ready means the index state the UI is showing is
      // already stale — refetch it so the blocked notice stays accurate.
      if (err instanceof ApiError && err.code === "index_not_ready") {
        qc.invalidateQueries({ queryKey: ["repo-intel-state", repoId] });
      }
    },
  });
}

/** `GET /repos/:id/onboarding/file?path=` — read-only source preview for a tour link. */
export function useOnboardingFile(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: ["onboarding-file", repoId, path],
    queryFn: () => api.get<SpecFile>(`/repos/${repoId}/onboarding/file?path=${encodeURIComponent(path!)}`),
    enabled: !!repoId && !!path,
  });
}
