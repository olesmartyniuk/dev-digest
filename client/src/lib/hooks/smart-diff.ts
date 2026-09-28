/* hooks/smart-diff.ts — React Query hook for the L03 Smart Diff endpoint. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SmartDiffResponse } from "@devdigest/shared";

/** Files grouped by role for a PR — deterministic, no-LLM classification. */
export function usePrSmartDiff(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-smart-diff", prId],
    queryFn: () => api.get<SmartDiffResponse>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId,
  });
}
