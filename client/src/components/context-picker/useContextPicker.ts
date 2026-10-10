"use client";

import React from "react";
import { useContextListing } from "@/lib/hooks/context";

/** Data + local UI state (filter, preview) shared by `ContextPicker`. */
export function useContextPicker(repoId: string | null) {
  const listing = useContextListing(repoId);
  const [filter, setFilter] = React.useState("");
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  return {
    listing: listing.data,
    documents: listing.data?.documents ?? [],
    filter,
    setFilter,
    previewPath,
    openPreview: (path: string) => setPreviewPath(path),
    closePreview: () => setPreviewPath(null),
    isLoading: listing.isLoading,
    isError: listing.isError,
  };
}
