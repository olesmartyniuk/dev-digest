"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, Badge, IconBtn } from "@devdigest/ui";
import { useAgentSkillsTab } from "./useAgentSkillsTab";
import { s } from "./styles";

/**
 * Agent Editor — Skills tab. Attaching a skill here writes `agent_skills`
 * (via `POST /agents/:id/skills`, replace-whole-list semantics); a skill's
 * own `enabled` flag (vetted or not) is edited in the Skills Lab, not here —
 * a linked-but-unvetted skill shows a hint and contributes nothing to the
 * prompt until enabled there.
 */
export function SkillsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const ts = useTranslations("skills");
  const { rows, filter, setFilter, linkedCount, totalCount, toggle, move, isLoading } =
    useAgentSkillsTab(agentId);

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.count}>{t("skills.enabledCount", { linked: linkedCount, total: totalCount })}</span>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t("skills.filterPlaceholder")}
        style={s.filterInput}
      />
      <div style={s.list}>
        {!isLoading && rows.length === 0 && <div style={s.empty}>{ts("page.empty.title")}</div>}
        {rows.map(({ skill, linked }) => (
          <div key={skill.id} style={s.row}>
            <Toggle on={linked} onChange={(v) => toggle(skill.id, v)} size={14} />
            <span style={s.name}>{skill.name}</span>
            <Badge>{ts(`listItem.type.${skill.type}`)}</Badge>
            {!skill.enabled && (
              <span title={ts("listItem.vettingTitle")}>
                <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
                  {ts("listItem.needsVetting")}
                </Badge>
              </span>
            )}
            {linked && (
              <div style={s.reorder}>
                <IconBtn icon="ArrowUp" label="Move up" size={22} onClick={() => move(skill.id, -1)} />
                <IconBtn icon="ArrowDown" label="Move down" size={22} onClick={() => move(skill.id, 1)} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
