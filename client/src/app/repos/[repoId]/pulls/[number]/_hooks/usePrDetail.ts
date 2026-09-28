"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { usePullDetail, usePulls } from "@/lib/hooks";
import {
  useCancelRun,
  useDeleteRun,
  usePrActiveRuns,
  usePrReviews,
  usePrRuns,
} from "@/lib/hooks/reviews";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import type { FindingRecord } from "@devdigest/shared";

/**
 * Everything the PR detail route needs, so the page itself stays layout.
 *
 * Holds the number→uuid resolution, the five queries that hang off it, the
 * live-run derivation, the `?tab=`/`?trace=` URL state, and the cache
 * invalidation a settling run requires.
 */
export function usePrDetail(repoId: string, number: string) {
  const search = useSearchParams();
  const router = useRouter();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  // The route is keyed by PR number, but every PR API is keyed by the row's
  // uuid — resolve number → uuid via the (cached) pulls list before fetching.
  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const prId = pulls?.find((p) => p.number === Number(number))?.id ?? null;
  const { data: pr, isLoading: detailLoading, isError, error, refetch } = usePullDetail(prId);
  const { data: reviews, refetch: refetchReviews } = usePrReviews(prId);

  // Live run tracking is SERVER-SOURCED (agent_runs status='running'): survives
  // navigation AND reload, and self-clears via polling when runs finish.
  const qc = useQueryClient();
  const { data: activeRuns } = usePrActiveRuns(prId);
  const { data: prRuns } = usePrRuns(prId);
  const deleteRun = useDeleteRun(prId);
  const cancel = useCancelRun();

  const liveRunIds = React.useMemo(
    () => (activeRuns ?? []).map((r) => r.run_id),
    [activeRuns],
  );

  const invalidateActiveRuns = React.useCallback(() => {
    if (prId) qc.invalidateQueries({ queryKey: ["pr-active-runs", prId] });
  }, [qc, prId]);

  // When a run settles (done OR failed) refresh the full run history too, so a
  // just-failed run shows up in "Run history" immediately — no page reload.
  const invalidateRunHistory = React.useCallback(() => {
    if (prId) qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
  }, [qc, prId]);

  const setParam = React.useCallback(
    (key: string, val: string | null) => {
      const sp = new URLSearchParams(search.toString());
      if (val == null) sp.delete(key);
      else sp.set(key, val);
      router.replace(`/repos/${repoId}/pulls/${number}${sp.toString() ? `?${sp.toString()}` : ""}`);
    },
    [search, router, repoId, number],
  );
  const setTab = React.useCallback((t: string) => setParam("tab", t), [setParam]);

  // Reviews come newest-first; each is its own run (grouped into accordions).
  const runs = React.useMemo(() => reviews ?? [], [reviews]);
  const allFindings: FindingRecord[] = React.useMemo(
    () => runs.flatMap((r) => r.findings),
    [runs],
  );
  const lethalTrifecta = React.useMemo(
    () => allFindings.filter((f) => f.kind === "lethal_trifecta"),
    [allFindings],
  );

  const onRunDone = React.useCallback(() => {
    invalidateActiveRuns();
    invalidateRunHistory();
    refetchReviews();
  }, [invalidateActiveRuns, invalidateRunHistory, refetchReviews]);

  const onDeleteRun = React.useCallback(
    (id: string) => {
      if (window.confirm("Delete this run from history? (its logs are removed too)"))
        deleteRun.mutate(id);
    },
    [deleteRun],
  );

  return {
    repoNotFound,
    isLoading: pullsLoading || (prId != null && detailLoading),
    isError,
    error,
    refetch,
    pr,
    prId,
    // The real "owner/repo" (null until the repo is loaded) — used to build
    // github.com deep-links for the header and finding file references.
    repoFullName: activeRepo?.full_name ?? null,
    repoName: activeRepo?.full_name ?? repoId,
    runs,
    prRuns,
    liveRunIds,
    reviewRunning: liveRunIds.length > 0,
    allFindings,
    lethalTrifecta,
    findingsCount: allFindings.length,
    cancel,
    tab: search.get("tab") ?? "overview",
    traceRunId: search.get("trace"),
    setTab,
    setParam,
    onRunDone,
    onDeleteRun,
    onRunsStarted: invalidateActiveRuns,
  };
}
