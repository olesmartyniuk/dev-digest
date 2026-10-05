"use client";

import React from "react";
import { Drawer, Markdown } from "@devdigest/ui";
import { useContextDocument } from "@/lib/hooks/context";

/** A read-only Markdown preview of one project-context document, in a Drawer. */
export function ContextDocPreview({
  repoId,
  path,
  onClose,
}: {
  repoId: string;
  path: string;
  onClose: () => void;
}) {
  const { data } = useContextDocument(repoId, path);
  return (
    <Drawer title={path} onClose={onClose}>
      <Markdown>{data?.content}</Markdown>
    </Drawer>
  );
}
