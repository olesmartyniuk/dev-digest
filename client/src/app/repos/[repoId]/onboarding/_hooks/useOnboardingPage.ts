"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { useGenerateOnboarding, useOnboardingTour } from "@/lib/hooks/onboarding";
import { useRepoIntelStatus } from "@/lib/hooks/repo-intel";
import { DEFAULT_VIEWER_MODE, FILE_PARAM, VIEWER_MODE_PARAM, type ViewerMode } from "../constants";

const VALID_MODES: readonly ViewerMode[] = ["preview", "raw"];

/**
 * Everything the Onboarding Tour page does, so `page.tsx` stays layout: load
 * the stored tour, the repo's index state, run (re)generation, and track the
 * source-file drawer's open path + viewer mode in the URL (`?file=`,
 * `?mode=`) — mirroring `context/_hooks/useContextPage.ts`.
 */
export function useOnboardingPage(repoId: string) {
  const search = useSearchParams();
  const router = useRouter();

  const tourQuery = useOnboardingTour(repoId);
  const generateMutation = useGenerateOnboarding(repoId);
  const indexQuery = useRepoIntelStatus(repoId);

  const filePath = search.get(FILE_PARAM);
  const requestedMode = search.get(VIEWER_MODE_PARAM) ?? "";
  const viewerMode: ViewerMode = VALID_MODES.includes(requestedMode as ViewerMode)
    ? (requestedMode as ViewerMode)
    : DEFAULT_VIEWER_MODE;

  const setParam = React.useCallback(
    (key: string, value: string | null) => {
      const sp = new URLSearchParams(search.toString());
      if (value === null) sp.delete(key);
      else sp.set(key, value);
      const qs = sp.toString();
      router.replace(`/repos/${repoId}/onboarding${qs ? `?${qs}` : ""}`);
    },
    [search, router, repoId],
  );

  const openFile = React.useCallback((path: string) => setParam(FILE_PARAM, path), [setParam]);
  const closeFile = React.useCallback(() => setParam(FILE_PARAM, null), [setParam]);
  const setViewerMode = React.useCallback(
    (mode: ViewerMode) => setParam(VIEWER_MODE_PARAM, mode),
    [setParam],
  );

  const indexStatus = indexQuery.data?.status;
  const indexReady = indexStatus === "full";
  const generateError = generateMutation.error;
  const blockedByServer = generateError instanceof ApiError && generateError.code === "index_not_ready";

  return {
    tour: tourQuery.data?.tour ?? null,
    generatedAt: tourQuery.data?.generated_at ?? null,
    limitedData: tourQuery.data?.limited_data ?? false,
    status: tourQuery.data?.status,
    indexStatus,
    indexReady,
    isLoading: tourQuery.isLoading,
    isError: tourQuery.isError,
    refetch: tourQuery.refetch,
    generate: () => generateMutation.mutate(),
    generating: generateMutation.isPending,
    generateError,
    blockedByServer,
    openFile,
    closeFile,
    filePath,
    viewerMode,
    setViewerMode,
  };
}
