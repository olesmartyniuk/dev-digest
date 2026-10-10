"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useContextListing, useRescanContext } from "@/lib/hooks/context";
import { DEFAULT_VIEWER_MODE, type DocViewerMode } from "../constants";

const VALID_MODES: readonly DocViewerMode[] = ["preview", "edit"];

/**
 * Everything the Project Context page does, so `page.tsx` stays layout: load
 * the listing, track the selected document and viewer mode in the URL
 * (`?doc=`, `?mode=`), and rescan on demand.
 */
export function useContextPage(repoId: string) {
  const search = useSearchParams();
  const router = useRouter();
  const listing = useContextListing(repoId);
  const rescan = useRescanContext();

  const selectedPath = search.get("doc");
  const requestedMode = search.get("mode") ?? "";
  const mode: DocViewerMode = VALID_MODES.includes(requestedMode as DocViewerMode)
    ? (requestedMode as DocViewerMode)
    : DEFAULT_VIEWER_MODE;

  const setParam = React.useCallback(
    (key: string, value: string | null) => {
      const sp = new URLSearchParams(search.toString());
      if (value === null) sp.delete(key);
      else sp.set(key, value);
      router.replace(`/repos/${repoId}/context?${sp.toString()}`);
    },
    [search, router, repoId],
  );

  const select = React.useCallback((path: string) => setParam("doc", path), [setParam]);
  const setMode = React.useCallback((m: DocViewerMode) => setParam("mode", m), [setParam]);

  return {
    listing: listing.data,
    documents: listing.data?.documents ?? [],
    selectedPath,
    select,
    mode,
    setMode,
    rescan: () => rescan.mutate(repoId),
    rescanning: rescan.isPending,
    isLoading: listing.isLoading,
    isError: listing.isError,
    refetch: listing.refetch,
  };
}
