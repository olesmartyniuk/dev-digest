"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox } from "@devdigest/ui";
import type { EvalRunSummary } from "@devdigest/shared";
import { formatCost, formatRate, formatRunDate } from "@/components/eval-metrics";
import { s } from "./styles";

/** RECENT RUNS: ran at, version, recall, precision, citation, pass, cost; a checkbox per finished run. */
export function AgentRunsTable({
  runs,
  selected,
  onToggle,
}: {
  runs: EvalRunSummary[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const t = useTranslations("eval");
  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th} />
          {(["ranAt", "version", "recall", "precision", "citation", "pass", "cost"] as const).map((k) => (
            <th key={k} style={s.th}>
              {t(`dashboard.table.${k}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => {
          const agg = r.aggregate;
          // Only a finished run with an aggregate can be compared.
          const selectable = r.status === "done" && agg != null;
          return (
            <tr key={r.id}>
              <td style={s.td}>
                {selectable ? (
                  <span aria-label={`select run ${formatRunDate(r.started_at)}`}>
                    <Checkbox checked={selected.includes(r.id)} onChange={() => onToggle(r.id)} />
                  </span>
                ) : null}
              </td>
              <td style={s.td}>{formatRunDate(r.started_at)}</td>
              <td style={s.td}>
                v{r.agent_version}
                {r.partial && <Badge style={s.tag}>{t("dashboard.partial")}</Badge>}
                {r.status === "failed" && (
                  <Badge color="var(--crit)" bg="var(--crit-bg)" style={s.tag}>
                    {t("dashboard.failedRun")}
                  </Badge>
                )}
                {r.status === "running" && <Badge style={s.tag}>{t("dashboard.running")}</Badge>}
              </td>
              <td style={s.td} className="tnum">
                {formatRate(agg?.recall, r.na.recall)}
              </td>
              <td style={s.td} className="tnum">
                {formatRate(agg?.precision, r.na.precision)}
              </td>
              <td style={s.td} className="tnum">
                {formatRate(agg?.citation_accuracy, r.na.citation_accuracy)}
              </td>
              <td style={s.td} className="tnum">
                {agg ? `${agg.traces_passed}/${agg.traces_total}` : "—"}
              </td>
              <td style={s.td} className="tnum">
                {formatCost(r.cost_usd)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
