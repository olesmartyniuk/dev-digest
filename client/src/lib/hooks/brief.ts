/* hooks/brief.ts — React Query hooks for the L05 PR Why + Risk Brief. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrBriefResponse } from "@devdigest/shared";

/** The cached brief for a PR — `brief: null` when never generated. Never calls the LLM. */
export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-brief", prId],
    queryFn: () => api.get<PrBriefResponse>(`/pulls/${prId}/brief`),
    enabled: !!prId,
  });
}

/**
 * Generate (or regenerate) the brief — always a fresh LLM call (AC-2/AC-10).
 * No `onError` cache write: a failed regenerate keeps the cached brief shown
 * (AC-12). Nothing invalidates this on run completion — regeneration is
 * explicit only.
 */
export function useGeneratePrBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrBriefResponse>(`/pulls/${prId}/brief`),
    onSuccess: (res) => {
      qc.setQueryData(["pr-brief", prId], res);
    },
  });
}
