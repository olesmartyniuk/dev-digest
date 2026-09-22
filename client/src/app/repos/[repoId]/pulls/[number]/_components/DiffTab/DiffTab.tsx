"use client";

import React from "react";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer } from "@/components/diff-viewer";
import type { PrFile } from "@devdigest/shared";
import { useDiffComments } from "./useDiffComments";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

export function DiffTab({ prId, filesCount, files, canComment }: DiffTabProps) {
  const { commenting, commentCount, showComments, toggleComments } = useDiffComments(
    prId,
    canComment,
  );

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          commentCount > 0 ? (
            <Button
              kind="ghost"
              size="sm"
              icon={showComments ? "EyeOff" : "Eye"}
              onClick={toggleComments}
            >
              {showComments ? "Hide comments" : "Show comments"} ({commentCount})
            </Button>
          ) : undefined
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>
      <DiffViewer files={files} commenting={commenting} />
    </section>
  );
}
