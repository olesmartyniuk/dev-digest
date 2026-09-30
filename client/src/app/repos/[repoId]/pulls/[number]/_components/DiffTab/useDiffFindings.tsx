"use client";

import React from "react";
import type { DiffFindingApi } from "@/components/diff-viewer";
import { useFindingAction, usePrReviews } from "@/lib/hooks/reviews";
import { FindingCard } from "../FindingCard";

/**
 * The inline-finding adapter handed to `DiffViewer`/`FileCard` (mirrors
 * `useDiffComments.ts`'s shape). `usePrReviews(prId)` is a cache hit here —
 * `usePrDetail` already calls it for the page — and this hook does the
 * finding↔file join itself (decision B: the server never does).
 */
export function useDiffFindings(
  prId: string | null,
  repoFullName?: string | null,
  headSha?: string | null,
): DiffFindingApi {
  const { data: reviews } = usePrReviews(prId);
  const action = useFindingAction();

  const findings = React.useMemo(() => (reviews ?? []).flatMap((r) => r.findings), [reviews]);

  const renderFinding = React.useCallback<DiffFindingApi["renderFinding"]>(
    (f) => (
      <FindingCard
        f={f}
        defaultExpanded
        pending={action.isPending}
        repoFullName={repoFullName}
        headSha={headSha}
        onAction={(act) => prId && action.mutate({ findingId: f.id, action: act, prId })}
      />
    ),
    [action, repoFullName, headSha, prId],
  );

  return React.useMemo(() => ({ findings, renderFinding }), [findings, renderFinding]);
}
