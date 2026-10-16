/* ColumnLiveStatus — live status line for a queued/running column, from the
   run's SSE stream (SPEC-05 AC-27). Polling the run view stays the authority:
   when the stream closes this nudges that query to refetch. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { useRunEvents } from "@/lib/hooks/reviews";

export function ColumnLiveStatus({
  runId,
  parentId,
  queued = false,
}: {
  runId: string;
  parentId: string;
  queued?: boolean;
}) {
  const t = useTranslations("runs");
  const qc = useQueryClient();
  const { events, running } = useRunEvents([runId]);
  const wasRunning = React.useRef(false);

  React.useEffect(() => {
    if (wasRunning.current && !running) {
      qc.invalidateQueries({ queryKey: ["multi-agent-run", parentId] });
    }
    wasRunning.current = running;
  }, [running, qc, parentId]);

  const last = events[events.length - 1];
  const fallback = queued ? t("results.status.queued") : t("results.status.running");
  return (
    <div role="status" style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 0" }}>
      {last?.msg || fallback}
    </div>
  );
}
