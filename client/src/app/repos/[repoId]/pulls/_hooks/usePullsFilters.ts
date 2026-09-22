"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * The PR list's filter state.
 *
 * `status` lives in the URL so a filtered list is linkable and survives reload;
 * search text and sort are transient, so they stay local.
 */
export function usePullsFilters(repoId: string) {
  const search = useSearchParams();
  const router = useRouter();

  // Default to "needs review" — the most actionable filter on open.
  const status = search.get("status") ?? "needs_review";
  const setStatus = React.useCallback(
    (k: string) => {
      const sp = new URLSearchParams(search.toString());
      sp.set("status", k); // always explicit so "all" sticks over the needs_review default
      router.replace(`/repos/${repoId}/pulls?${sp.toString()}`);
    },
    [search, router, repoId],
  );

  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState("newest");

  return { status, setStatus, query, setQuery, sort, setSort };
}
