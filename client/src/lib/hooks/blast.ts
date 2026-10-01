/* hooks/blast.ts — React Query hook for the L04 blast-radius endpoint. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadiusResponse } from "@devdigest/shared";

/** Blast radius for a PR — reshaped repo-intel index data, no LLM. */
export function usePrBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-blast", prId],
    queryFn: () => api.get<BlastRadiusResponse>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
