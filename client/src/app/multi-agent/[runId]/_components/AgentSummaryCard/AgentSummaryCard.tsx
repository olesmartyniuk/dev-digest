/* AgentSummaryCard — Tabs-mode header for the selected agent: score, summary
   (markdown; LLM output, never raw HTML), trace link, time and cost. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CircularScore, Markdown } from "@devdigest/ui";
import type { MultiAgentColumn } from "@devdigest/shared";
import { formatCostUsd, formatDurationMs } from "@/lib/format";
import { s } from "./styles";

export function AgentSummaryCard({
  column,
  onOpenTrace,
}: {
  column: MultiAgentColumn;
  onOpenTrace: (runId: string) => void;
}) {
  const t = useTranslations("runs");
  return (
    <div style={s.card}>
      {column.score != null && <CircularScore score={column.score} size={56} />}
      <div style={s.main}>
        {column.summary ? <Markdown>{column.summary}</Markdown> : <div>{t("tabs.noSummary")}</div>}
        <div style={s.meta}>
          <span>{formatDurationMs(column.duration_ms)}</span>
          <span>{formatCostUsd(column.cost_usd)}</span>
          <button type="button" style={s.linkBtn} onClick={() => onOpenTrace(column.run_id)}>
            {t("viewTrace")}
          </button>
        </div>
      </div>
    </div>
  );
}
