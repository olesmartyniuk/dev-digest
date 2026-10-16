/* ResultsHeader — PR title, neutral run summary (count · parallel · time · cost),
   Configure run link and the Columns/Tabs switch (SPEC-05, D8/D10/AC-33). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { MultiAgentRunView } from "@devdigest/shared";
import { formatCostUsd, formatDurationMs } from "@/lib/format";
import { ModeSwitch } from "../ModeSwitch";
import { s } from "./styles";

export function ResultsHeader({
  view,
  mode,
  onModeChange,
  onConfigure,
}: {
  view: MultiAgentRunView;
  mode: "columns" | "tabs";
  onModeChange: (m: "columns" | "tabs") => void;
  onConfigure: () => void;
}) {
  const t = useTranslations("runs");
  return (
    <div style={s.wrap}>
      <div>
        <h1 style={s.title}>
          #{view.pr_number} {view.pr_title}
        </h1>
        <div style={s.meta}>{t("results.selected", { count: view.agent_count })}</div>
        <div style={s.meta}>
          {t("results.meta", {
            count: view.agent_count,
            duration: formatDurationMs(view.total_duration_ms),
            cost: formatCostUsd(view.total_cost_usd),
          })}
          {!view.cost_complete && ` ${t("results.costIncomplete")}`}
        </div>
      </div>
      <div style={s.actions}>
        <Button kind="secondary" size="sm" onClick={onConfigure}>
          {t("results.configureRun")}
        </Button>
        <ModeSwitch value={mode} onChange={onModeChange} />
      </div>
    </div>
  );
}
