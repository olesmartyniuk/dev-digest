"use client";

import { useEvalRun } from "@/lib/hooks/eval";
import { orderOldNew } from "./helpers";

/**
 * Fetch both selected runs (each carries its own config snapshot, so no
 * separate agent-version fetch is needed) and order them old -> new.
 */
export function useCompareRuns(runIds: [string, string]) {
  const first = useEvalRun(runIds[0]);
  const second = useEvalRun(runIds[1]);

  const isLoading = first.isLoading || second.isLoading;
  const isError = first.isError || second.isError;
  const [older, newer] =
    first.data && second.data ? orderOldNew(first.data, second.data) : [undefined, undefined];

  return { isLoading, isError, older, newer };
}
