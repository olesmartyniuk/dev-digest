"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { EvalRunSummary } from "@devdigest/shared";
import { formatRate, formatRunDate } from "@/components/eval-metrics";
import { s } from "./styles";

/** RECENT EVAL RUNS · ALL AGENTS — newest first (the server already orders them). */
export function RecentEvalRunsTable({ runs }: { runs: EvalRunSummary[] }) {
  const t = useTranslations("eval");
  return (
    <table style={s.table}>
      <thead>
        <tr>
          {(["agent", "date", "version", "recall", "precision", "citation", "passCol"] as const).map((k) => (
            <th key={k} style={s.th}>
              {t(`dashboard.table.${k}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => {
          const agg = r.aggregate;
          return (
            <tr key={r.id}>
              <td style={s.td}>
                <Link href={`/eval/${r.agent_id}`} style={s.link}>
                  {r.agent_name}
                </Link>
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
              <Rate value={agg?.recall} na={r.na.recall} color="var(--ok)" />
              <Rate value={agg?.precision} na={r.na.precision} color="var(--accent)" />
              <Rate value={agg?.citation_accuracy} na={r.na.citation_accuracy} color="var(--warn)" />
              <td style={s.td} className="tnum">
                {agg ? `${agg.traces_passed}/${agg.traces_total}` : "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Rate cell: a thin bar + the percentage ("n/a" when not applicable). */
function Rate({ value, na, color }: { value: number | null | undefined; na: boolean; color: string }) {
  const shown = value != null && !na;
  return (
    <td style={s.td}>
      <div style={s.rate}>
        <div style={s.track}>{shown && <div style={{ ...s.fill, width: `${Math.round(value * 100)}%`, background: color }} />}</div>
        <span className="tnum">{formatRate(value, na)}</span>
      </div>
    </td>
  );
}
