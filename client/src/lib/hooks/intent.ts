/* hooks/intent.ts — React Query hooks for the L03 PR intent classifier. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentResponse } from "@devdigest/shared";

/** The stored intent for a PR — null when never classified. */
export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-intent", prId],
    queryFn: () => api.get<PrIntentResponse>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

/**
 * (Re)classify synchronously. `skipped` (present on a handled failure, e.g.
 * no key configured) is kept in the cache too, so the card can show why.
 */
export function useClassifyIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentResponse>(`/pulls/${prId}/intent`),
    onSuccess: (res) => {
      qc.setQueryData(["pr-intent", prId], res);
    },
  });
}
