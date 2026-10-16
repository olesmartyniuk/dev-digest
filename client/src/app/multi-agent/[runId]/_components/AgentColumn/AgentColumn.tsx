/* AgentColumn — one agent's results in Columns mode: header (name, time, cost,
   score), a body that depends on run status, and a footer (trace + count). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CircularScore, SeverityBadge, type Severity } from "@devdigest/ui";
import type { MultiAgentColumn, MultiAgentGroup } from "@devdigest/shared";
import { formatCostUsd, formatDurationMs } from "@/lib/format";
import { ColumnLiveStatus } from "../ColumnLiveStatus";
import { ContributorsLine } from "../ContributorsLine";
import { lineLabel } from "./helpers";
import { s } from "./styles";

export function AgentColumn({
  column,
  columns,
  parentId,
  groupOf,
  onOpenTrace,
}: {
  column: MultiAgentColumn;
  columns: MultiAgentColumn[];
  parentId: string;
  groupOf: (findingId: string) => MultiAgentGroup | undefined;
  onOpenTrace: (runId: string) => void;
}) {
  const t = useTranslations("runs");

  const body = () => {
    switch (column.status) {
      case "queued":
      case "running":
        return <ColumnLiveStatus runId={column.run_id} parentId={parentId} queued={column.status === "queued"} />;
      case "failed":
        return (
          <div role="alert" style={s.error}>
            <strong>{t("results.status.failed")}</strong>
            {column.error && <div>{column.error}</div>}
          </div>
        );
      case "cancelled":
        return <div style={s.muted}>{t("results.status.cancelled")}</div>;
      default:
        return column.findings.length === 0 ? (
          <div style={s.muted}>{t("column.noFindings")}</div>
        ) : (
          column.findings.map((f) => (
            <div key={f.id} style={s.item}>
              <SeverityBadge severity={f.severity as Severity} compact />
              <div style={s.itemTitle}>{f.title}</div>
              <div style={s.itemLoc}>
                {f.file}:{lineLabel(f)}
              </div>
              <ContributorsLine group={groupOf(f.id)} columns={columns} excludeRunId={column.run_id} />
            </div>
          ))
        );
    }
  };

  return (
    <section style={s.col} aria-label={column.agent_name ?? t("results.deletedAgent")}>
      <div style={s.header}>
        <div>
          <div style={s.name}>{column.agent_name ?? t("results.deletedAgent")}</div>
          <div style={s.meta}>
            <span>{formatDurationMs(column.duration_ms)}</span>
            <span>{formatCostUsd(column.cost_usd)}</span>
          </div>
        </div>
        {column.score != null && <CircularScore score={column.score} size={40} />}
      </div>
      <div style={s.body}>{body()}</div>
      <div style={s.footer}>
        <button type="button" style={s.linkBtn} onClick={() => onOpenTrace(column.run_id)}>
          {t("viewTrace")}
        </button>
        <span>{t("column.findingsCount", { count: column.findings.length })}</span>
      </div>
    </section>
  );
}
