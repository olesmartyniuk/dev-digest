/* AgentSelectList — the enabled agents as tickable rows with a per-agent time and
   cost estimate (SPEC-05 M2, AC-8/11). Nothing is pre-ticked. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@devdigest/ui";
import type { Agent, AgentRunEstimate } from "@devdigest/shared";
import { formatCostUsd, formatDurationMs } from "@/lib/format";
import { estimateFor } from "@/components/multi-agent";
import { s } from "./styles";

export function AgentSelectList({
  agents,
  estimates,
  isSelected,
  onToggle,
  onSelectAll,
}: {
  agents: Agent[];
  estimates: AgentRunEstimate[] | undefined;
  isSelected: (id: string) => boolean;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
}) {
  const t = useTranslations("runs");

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <button type="button" style={s.linkBtn} onClick={onSelectAll}>
          {t("configure.selectAll")}
        </button>
      </div>
      {agents.map((a) => {
        const est = estimateFor(estimates, a.id);
        return (
          <div key={a.id} style={s.row}>
            <div>
              <Checkbox checked={isSelected(a.id)} onChange={() => onToggle(a.id)} label={a.name} />
              {a.description.trim() !== "" && <div style={s.desc}>{a.description}</div>}
            </div>
            <div style={s.est}>
              <span>
                {est?.mean_duration_ms != null
                  ? formatDurationMs(est.mean_duration_ms)
                  : t("configure.unavailable")}
              </span>
              <span>
                {est?.mean_cost_usd != null ? formatCostUsd(est.mean_cost_usd) : t("configure.unavailable")}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
