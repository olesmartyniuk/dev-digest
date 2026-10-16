"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SelectInput } from "@devdigest/ui";
import type { CiRunFilters, PeriodFilter } from "../../_hooks/helpers";
import { s } from "./styles";

const STATUSES = ["succeeded", "no_findings", "failed"] as const;

export interface CiRunsFiltersProps {
  filters: CiRunFilters;
  options: { agents: { value: string; label: string }[]; repos: string[] };
  onChange: <K extends keyof CiRunFilters>(key: K, value: CiRunFilters[K]) => void;
}

/** Period / agent / repo / status selects (client-side filtering). */
export function CiRunsFilters({ filters, options, onChange }: CiRunsFiltersProps) {
  const t = useTranslations("ci.runs");
  return (
    <div style={s.row}>
      <div style={s.cell}>
        <SelectInput
          mono={false}
          value={filters.period}
          onChange={(v) => onChange("period", v as PeriodFilter)}
          options={[
            { value: "7d", label: t("filters.last7Days") },
            { value: "30d", label: t("filters.last30Days") },
            { value: "all", label: t("filters.allTime") },
          ]}
        />
      </div>
      <div style={s.cell}>
        <SelectInput
          mono={false}
          value={filters.agent}
          onChange={(v) => onChange("agent", v)}
          options={[{ value: "all", label: t("filters.allAgents") }, ...options.agents]}
        />
      </div>
      <div style={s.cell}>
        <SelectInput
          mono={false}
          value={filters.repo}
          onChange={(v) => onChange("repo", v)}
          options={[
            { value: "all", label: t("filters.allRepos") },
            ...options.repos.map((r) => ({ value: r, label: r })),
          ]}
        />
      </div>
      <div style={s.cell}>
        <SelectInput
          mono={false}
          value={filters.status}
          onChange={(v) => onChange("status", v)}
          options={[
            { value: "all", label: t("filters.allStatuses") },
            ...STATUSES.map((st) => ({
              value: st,
              label: t(`status.${st === "no_findings" ? "noFindings" : st}`),
            })),
          ]}
        />
      </div>
    </div>
  );
}
