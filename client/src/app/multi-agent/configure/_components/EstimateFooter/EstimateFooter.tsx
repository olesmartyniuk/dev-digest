/* EstimateFooter — wall-clock (max) and cost (sum) estimate for the ticked agents
   plus the primary Run button (SPEC-05 M3, AC-9/11). The estimate shows only
   while agents are ticked. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { formatCostUsd, formatDurationMs } from "@/lib/format";
import type { FooterEstimate } from "@/components/multi-agent";
import { s } from "./styles";

export function EstimateFooter({
  count,
  estimate,
  disabled,
  pending,
  onRun,
}: {
  count: number;
  estimate: FooterEstimate;
  disabled: boolean;
  pending: boolean;
  onRun: () => void;
}) {
  const t = useTranslations("runs");
  const button = (
    <Button kind="primary" disabled={disabled} loading={pending} onClick={onRun}>
      {t("configure.runMulti", { count })}
    </Button>
  );

  if (count === 0) return <div style={s.btnOnly}>{button}</div>;

  return (
    <div style={s.wrap}>
      <div style={s.stats}>
        <span style={s.muted}>{t("configure.fanOut")}</span>
        <span>
          {t("configure.estTime")}: {formatDurationMs(estimate.durationMs)}
          {estimate.durationIncomplete && ` ${t("configure.incomplete")}`}
        </span>
        <span>
          {t("configure.estCost")}: {formatCostUsd(estimate.costUsd)}
          {estimate.costIncomplete && ` ${t("configure.incomplete")}`}
        </span>
      </div>
      {button}
    </div>
  );
}
