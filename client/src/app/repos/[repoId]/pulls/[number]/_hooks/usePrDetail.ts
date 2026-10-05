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
import type { DiffOrder } from "../_components/DiffTab/constants";

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

  /** Write several URL params in one `router.replace` (one history entry, not one per key). */
  const writeParams = React.useCallback(
    (patch: Record<string, string | null>) => {
      const sp = new URLSearchParams(search.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null) sp.delete(k);
        else sp.set(k, v);
      }
      router.replace(`/repos/${repoId}/pulls/${number}${sp.toString() ? `?${sp.toString()}` : ""}`);
    },
    [search, router, repoId, number],
  );
  const setParam = React.useCallback(
    (key: string, val: string | null) => writeParams({ [key]: val }),
    [writeParams],
  );
  // Clears a stale `?file=` focus when switching tabs manually, so it doesn't
  // re-scroll the Files-changed tab later for an unrelated visit.
  const setTab = React.useCallback((t: string) => writeParams({ tab: t, file: null }), [writeParams]);
  /** A Review focus click (D8, AC-11): switch to Files changed and focus one file, in one replace. */
  const openFileInDiff = React.useCallback(
    (path: string) => writeParams({ tab: "diff", file: path }),
    [writeParams],
  );

  // The "Files changed" tab's file order lives in the URL too, so a shared
  // link keeps showing the same view. Absent means Smart (the default),
  // so existing `?tab=diff` links stay valid.
  const diffOrder: DiffOrder = search.get("order") === "original" ? "original" : "smart";
  const setDiffOrder = React.useCallback(
    (o: DiffOrder) => setParam("order", o === "smart" ? null : o),
    [setParam],
  );

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
    // L03 — a review may have classified intent lazily during the run; make
    // sure a fresh (or first) classification shows up on the card.
    if (prId) qc.invalidateQueries({ queryKey: ["pr-intent", prId] });
  }, [invalidateActiveRuns, invalidateRunHistory, refetchReviews, qc, prId]);

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
    focusFile: search.get("file"),
    diffOrder,
    setDiffOrder,
    setTab,
    setParam,
    openFileInDiff,
    onRunDone,
    onDeleteRun,
    onRunsStarted: invalidateActiveRuns,
  };
}
