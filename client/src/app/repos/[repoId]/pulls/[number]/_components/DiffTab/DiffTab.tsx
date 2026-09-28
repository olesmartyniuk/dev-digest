"use client";

import React from "react";
import { SectionLabel, Button, Skeleton } from "@devdigest/ui";
import { DiffViewer } from "@/components/diff-viewer";
import type { PrFile } from "@devdigest/shared";
import { usePrSmartDiff } from "@/lib/hooks/smart-diff";
import { useDiffComments } from "./useDiffComments";
import { useDiffFindings } from "./useDiffFindings";
import { resolveGroups } from "./helpers";
import { DiffOrderToggle } from "./_components/DiffOrderToggle";
import { SmartDiffView } from "./_components/SmartDiffView";
import type { DiffOrder } from "./constants";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  order: DiffOrder;
  onOrderChange: (o: DiffOrder) => void;
  repoFullName?: string | null;
  headSha?: string | null;
}

export function DiffTab({
  prId,
  filesCount,
  files,
  canComment,
  order,
  onOrderChange,
  repoFullName,
  headSha,
}: DiffTabProps) {
  const { commenting, commentCount, showComments, toggleComments } = useDiffComments(
    prId,
    canComment,
  );
  const findingsApi = useDiffFindings(prId, repoFullName, headSha);
  const { data: smart, isLoading, isError } = usePrSmartDiff(prId);

  let body: React.ReactNode;
  if (order === "original") {
    body = <DiffViewer files={files} commenting={commenting} findings={findingsApi} />;
  } else if (isLoading) {
    body = <Skeleton height={120} />;
  } else if (isError || !smart) {
    // Never leave the tab blank — fall back to the flat view.
    body = <DiffViewer files={files} commenting={commenting} findings={findingsApi} />;
  } else {
    body = (
      <SmartDiffView
        groups={resolveGroups(smart.groups, files)}
        commenting={commenting}
        findings={findingsApi}
      />
    );
  }

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <DiffOrderToggle value={order} onChange={onOrderChange} />
            {commentCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={toggleComments}
              >
                {showComments ? "Hide comments" : "Show comments"} ({commentCount})
              </Button>
            )}
          </div>
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>
      {body}
    </section>
  );
}
