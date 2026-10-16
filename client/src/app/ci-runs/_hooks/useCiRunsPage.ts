"use client";

import React from "react";
import { useCiRuns, useCiSync } from "@/lib/hooks/ci";
import { DEFAULT_FILTERS, applyFilters, filterOptions, type CiRunFilters } from "./helpers";

/** Orchestration for /ci-runs: the list, a sync on mount / Refresh, and client-side filters. */
export function useCiRunsPage() {
  const query = useCiRuns();
  const sync = useCiSync();
  const [filters, setFilters] = React.useState<CiRunFilters>(DEFAULT_FILTERS);

  // Ingest new runner results when the page opens. No "already ran" ref guard:
  // under StrictMode the first effect run's observer is unsubscribed before the
  // mutation settles, leaving `isPending` stuck; the sync is idempotent, so
  // running it again after the simulated remount is harmless.
  const { mutate: runSync } = sync;
  React.useEffect(() => {
    runSync(undefined);
  }, [runSync]);

  const all = query.data;
  const runs = React.useMemo(() => applyFilters(all ?? [], filters, Date.now()), [all, filters]);
  const options = React.useMemo(() => filterOptions(all ?? []), [all]);

  const setFilter = React.useCallback(
    <K extends keyof CiRunFilters>(key: K, value: CiRunFilters[K]) =>
      setFilters((f) => ({ ...f, [key]: value })),
    [],
  );

  return {
    runs,
    totalCount: all?.length ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    refresh: () => runSync(undefined),
    syncing: sync.isPending,
    syncError: sync.data?.error ?? (sync.error ? sync.error.message : null),
    filters,
    setFilter,
    options,
  };
}
