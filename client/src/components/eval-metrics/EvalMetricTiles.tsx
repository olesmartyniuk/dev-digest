/* EvalMetricTiles — the recall / precision / citation KPI row (+ an optional
   "traces passed N/M" tile) shared by the AgentEditor Evals tab and the
   per-agent eval dashboard. Deltas are server-computed fractions shown in pts. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MetricCard } from "@devdigest/ui";
import type { EvalDashboard, EvalMetricNa, EvalTrendPoint } from "@devdigest/shared";
import { formatRate } from "./helpers";

const NO_NA: EvalMetricNa = { recall: false, precision: false, citation_accuracy: false };

export function EvalMetricTiles({
  current,
  delta,
  na = NO_NA,
  trend,
  showTraces,
}: {
  current: EvalDashboard["current"];
  delta: EvalDashboard["delta"];
  na?: EvalMetricNa;
  trend: EvalTrendPoint[];
  showTraces?: boolean;
}) {
  const t = useTranslations("eval");
  const hasRuns = current.traces_total > 0;
  const tiles = [
    { key: "recall", label: t("dashboard.metrics.recall"), color: "var(--ok)" },
    { key: "precision", label: t("dashboard.metrics.precision"), color: "var(--accent)" },
    { key: "citation_accuracy", label: t("dashboard.metrics.citationAccuracy"), color: "var(--warn)" },
  ] as const;

  return (
    <div style={{ display: "flex", gap: 14 }}>
      {tiles.map((m) => (
        <MetricCard
          key={m.key}
          label={m.label}
          value={hasRuns ? formatRate(current[m.key], na[m.key]) : "—"}
          delta={hasRuns ? delta[m.key] * 100 : undefined}
          color={m.color}
          trend={trend.length > 1 ? trend.map((p) => p[m.key]) : undefined}
        />
      ))}
      {showTraces && (
        <MetricCard
          label={t("dashboard.metrics.tracesPassed")}
          value={hasRuns ? `${current.traces_passed}/${current.traces_total}` : "—"}
        />
      )}
    </div>
  );
}
