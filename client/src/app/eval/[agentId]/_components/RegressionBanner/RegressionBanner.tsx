"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalRegression } from "@devdigest/shared";

const LEGEND_KEY = {
  recall: "recall",
  precision: "precision",
  citation_accuracy: "citation",
} as const;

/** Warning banner for a metric regression of >= 2 pts vs the previous full run (AC-36). Copy lives in eval.json. */
export function RegressionBanner({ regression }: { regression: EvalRegression }) {
  const t = useTranslations("eval");
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 8,
        border: "1px solid var(--warn)",
        background: "var(--warn-bg)",
        color: "var(--text-primary)",
        fontSize: 13.5,
      }}
    >
      <Icon.AlertTriangle size={16} style={{ color: "var(--warn)" }} />
      {t("dashboard.regression", {
        metric: t(`dashboard.legend.${LEGEND_KEY[regression.metric]}`),
        pp: (regression.drop * 100).toFixed(1),
        version: regression.version,
        previous: regression.previous_version,
      })}
    </div>
  );
}
