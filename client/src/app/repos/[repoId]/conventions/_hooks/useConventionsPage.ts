"use client";

import React from "react";
import type {
  Convention,
  ConventionCategory,
  ConventionStatus,
} from "@devdigest/shared";
import {
  useConventions,
  useExtractConventions,
  useUpdateConvention,
} from "@/lib/hooks/conventions";
import { countConventions, sortConventions, type ConventionCounts } from "../helpers";

/**
 * Everything the Conventions page does, so `page.tsx` stays layout: load the
 * stored candidates, run a scan, and record a verdict or an edit on one.
 */
export function useConventionsPage(repoId: string) {
  const list = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const [modalOpen, setModalOpen] = React.useState(false);

  const conventions = React.useMemo(
    () => sortConventions(list.data ?? []),
    [list.data],
  );
  const counts: ConventionCounts = React.useMemo(
    () => countConventions(list.data ?? []),
    [list.data],
  );

  const setStatus = React.useCallback(
    (id: string, status: ConventionStatus) => update.mutate({ id, patch: { status } }),
    [update],
  );

  const editRule = React.useCallback(
    (id: string, patch: { rule: string; category: ConventionCategory }) =>
      update.mutateAsync({ id, patch }),
    [update],
  );

  /** Accept every still-undecided candidate — the "select all" shortcut. */
  const acceptAllPending = React.useCallback(() => {
    for (const c of conventions) {
      if (c.status === "pending") update.mutate({ id: c.id, patch: { status: "accepted" } });
    }
  }, [conventions, update]);

  /** Take back every accepted verdict, returning those rows to undecided. */
  const deselectAll = React.useCallback(() => {
    for (const c of conventions) {
      if (c.status === "accepted") update.mutate({ id: c.id, patch: { status: "pending" } });
    }
  }, [conventions, update]);

  return {
    conventions: conventions as Convention[],
    counts,
    isLoading: list.isLoading,
    isError: list.isError,
    refetch: list.refetch,
    scan: extract.mutate,
    scanning: extract.isPending,
    scanResult: extract.data,
    scanError: extract.error,
    busyId: update.isPending ? update.variables?.id : undefined,
    setStatus,
    editRule,
    acceptAllPending,
    deselectAll,
    modalOpen,
    openModal: () => setModalOpen(true),
    closeModal: () => setModalOpen(false),
  };
}
