"use client";

import React from "react";
import type { FindingRecord, PrCommit, RunSummary } from "@devdigest/shared";
import { buildTimeline } from "./helpers";
import { s } from "./styles";
import { CommitRow } from "./_components/CommitRow";
import { RunRow } from "./_components/RunRow";

/**
 * PR timeline — every agent run interleaved with the PR's commits, newest-first
 * and DB-backed so it survives reload. Showing commits between runs makes it
 * clear which commit each review ran against. Failed runs show their error
 * inline; clicking a run row opens its trace.
 */
export function RunHistory({
  runs,
  commits = [],
  findingsByRun,
  onOpenTrace,
  onGoToReview,
  onDelete,
}: {
  runs: RunSummary[];
  commits?: PrCommit[];
  /** run_id → that run's findings, resolved by the caller (see FindingsTab). */
  findingsByRun?: Map<string, FindingRecord[]>;
  /** Open the trace + log drawer for a run (the logs icon). */
  onOpenTrace: (runId: string) => void;
  /** Jump to this run's inline review accordion below (clicking the agent name). */
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}) {
  const items = React.useMemo(() => buildTimeline(runs, commits), [runs, commits]);
  if (items.length === 0) return null;

  return (
    <div style={s.timeline}>
      {items.map((item) =>
        item.kind === "commit" ? (
          <CommitRow key={`commit:${item.commit.sha}`} commit={item.commit} />
        ) : (
          <RunRow
            key={`run:${item.run.run_id}`}
            run={item.run}
            findings={findingsByRun?.get(item.run.run_id)}
            onOpenTrace={onOpenTrace}
            onGoToReview={onGoToReview}
            onDelete={onDelete}
          />
        ),
      )}
    </div>
  );
}
