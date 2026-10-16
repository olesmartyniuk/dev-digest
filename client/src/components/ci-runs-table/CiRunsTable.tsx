"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { CiRunRow } from "@devdigest/shared";
import { formatCostUsd } from "@/lib/format";
import { formatRunDate } from "@/components/eval-metrics";
import { formatDuration, safeJobUrl, verdictColors, verdictKey } from "./helpers";
import { s } from "./styles";

const COLUMNS = ["timestamp", "repository", "pullRequest", "agent", "verdict", "findings", "cost", "duration", "job"] as const;

/** Ingested CI runs, rendered in the order the server returns them (newest first). */
export function CiRunsTable({ runs }: { runs: CiRunRow[] }) {
  const t = useTranslations("ci.runs");
  const header: Record<(typeof COLUMNS)[number], string> = {
    timestamp: t("table.timestamp"),
    repository: t("repository"),
    pullRequest: t("table.pullRequest"),
    agent: t("agent"),
    verdict: t("verdict"),
    findings: t("table.findings"),
    cost: t("table.cost"),
    duration: t("duration"),
    job: t("job"),
  };
  return (
    <table style={s.table}>
      <thead>
        <tr>
          {COLUMNS.map((c) => (
            <th key={c} style={s.th}>
              {header[c]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => {
          const url = safeJobUrl(r.job_url);
          const colors = verdictColors(r.status);
          return (
            <tr key={r.id}>
              <td style={s.td}>{formatRunDate(r.ran_at)}</td>
              <td style={s.td}>{r.repo ?? "—"}</td>
              <td style={s.td} className="tnum">
                {r.pr_number != null ? `#${r.pr_number}` : "—"}
              </td>
              <td style={s.td}>{r.agent_name ?? <span style={s.muted}>{t("unknownAgent")}</span>}</td>
              <td style={s.td}>
                <Badge color={colors.color} bg={colors.bg}>
                  {t(`status.${verdictKey(r.status)}`)}
                </Badge>
                {r.blocking && (
                  <Badge color="var(--crit)" bg="var(--crit-bg)" style={s.tag}>
                    {t("blocking")}
                  </Badge>
                )}
              </td>
              <td style={s.td} className="tnum">
                {r.findings_count ?? "—"}
              </td>
              <td style={s.td} className="tnum">
                {formatCostUsd(r.cost_usd)}
              </td>
              <td style={s.td} className="tnum">
                {formatDuration(r.duration_ms)}
              </td>
              <td style={s.td}>
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" style={s.link}>
                    {t("view")}
                  </a>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
