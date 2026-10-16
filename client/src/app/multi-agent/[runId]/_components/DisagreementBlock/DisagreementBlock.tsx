/* DisagreementBlock — "Where agents disagree" (SPEC-05 AC-21..24): per overlap
   location, each finished agent's take (severity, or "did not flag" + a scope
   reason). Hidden when there is nothing to compare. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SeverityBadge, Toggle, type Severity } from "@devdigest/ui";
import type { MultiAgentLocation } from "@devdigest/shared";
import { visibleLocations } from "./helpers";
import { s } from "./styles";

export function DisagreementBlock({
  locations,
  onlyConflicts,
  onOnlyConflictsChange,
}: {
  locations: MultiAgentLocation[];
  onlyConflicts: boolean;
  onOnlyConflictsChange: (v: boolean) => void;
}) {
  const t = useTranslations("runs");
  if (locations.length === 0) return null;
  const shown = visibleLocations(locations, onlyConflicts);

  return (
    <section style={s.wrap} aria-label={t("conflicts.title")}>
      <div style={s.header}>
        <div style={s.title}>{t("conflicts.title")}</div>
        <label style={s.toggle}>
          {t("conflicts.onlyConflicts")}
          <Toggle on={onlyConflicts} onChange={onOnlyConflictsChange} size={16} />
        </label>
      </div>
      {shown.length === 0 ? (
        <div style={s.empty}>{t("conflicts.empty")}</div>
      ) : (
        shown.map((loc) => (
          <div key={loc.group_id} style={s.row}>
            <div style={s.loc}>
              {loc.file}:{loc.line}
            </div>
            <div style={s.rowTitle}>{loc.title}</div>
            <div style={s.takes}>
              {loc.takes.map((take) => (
                <div key={take.run_id} style={s.take}>
                  <strong>{take.agent_name ?? t("results.deletedAgent")}</strong>
                  {take.verdict === "did_not_flag" ? (
                    <>
                      <span>{t("conflicts.didNotFlag")}</span>
                      <span style={s.reason}>{t(`conflicts.reason.${take.scope ?? "general"}`)}</span>
                    </>
                  ) : (
                    <SeverityBadge severity={take.verdict as Severity} compact />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
