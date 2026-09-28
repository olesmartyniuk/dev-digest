"use client";

import React from "react";
import type { Skill } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills } from "@/lib/hooks/agents";
import { useSkills } from "@/lib/hooks/skills";

export interface SkillTabRow {
  skill: Skill;
  linked: boolean;
  /** Position among LINKED skills (0-based); -1 when not linked. */
  order: number;
}

/**
 * Data + attach/reorder orchestration for the Skills tab. A skill's ATTACH
 * state is this agent's `agent_skills` link (toggled here); a skill's own
 * `enabled` flag (vetting gate) is edited on the Skill itself in the Skills
 * Lab — this tab only surfaces it as a "needs vetting" hint.
 */
export function useAgentSkillsTab(agentId: string) {
  const { data: skills, isLoading: skillsLoading } = useSkills();
  const { data: links, isLoading: linksLoading } = useAgentSkills(agentId);
  const setSkills = useSetAgentSkills(agentId);
  const [filter, setFilter] = React.useState("");

  const linkedIds = React.useMemo(
    () =>
      (links ?? [])
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((l) => l.skill_id),
    [links],
  );

  const rows: SkillTabRow[] = React.useMemo(() => {
    const all = skills ?? [];
    const byId = new Map(all.map((sk) => [sk.id, sk]));
    const linkedRows: SkillTabRow[] = linkedIds
      .map((id, i) => (byId.has(id) ? { skill: byId.get(id)!, linked: true, order: i } : undefined))
      .filter((r): r is SkillTabRow => !!r);
    const unlinkedRows: SkillTabRow[] = all
      .filter((sk) => !linkedIds.includes(sk.id))
      .map((sk) => ({ skill: sk, linked: false, order: -1 }));
    const needle = filter.trim().toLowerCase();
    const matches = (r: SkillTabRow) => !needle || r.skill.name.toLowerCase().includes(needle);
    return [...linkedRows.filter(matches), ...unlinkedRows.filter(matches)];
  }, [skills, linkedIds, filter]);

  const toggle = React.useCallback(
    (skillId: string, next: boolean) => {
      const nextIds = next ? [...linkedIds, skillId] : linkedIds.filter((id) => id !== skillId);
      setSkills.mutate(nextIds);
    },
    [linkedIds, setSkills],
  );

  const move = React.useCallback(
    (skillId: string, dir: -1 | 1) => {
      const idx = linkedIds.indexOf(skillId);
      if (idx < 0) return;
      const swapWith = idx + dir;
      if (swapWith < 0 || swapWith >= linkedIds.length) return;
      const next = [...linkedIds];
      [next[idx], next[swapWith]] = [next[swapWith]!, next[idx]!];
      setSkills.mutate(next);
    },
    [linkedIds, setSkills],
  );

  return {
    rows,
    filter,
    setFilter,
    linkedCount: linkedIds.length,
    totalCount: (skills ?? []).length,
    toggle,
    move,
    isLoading: skillsLoading || linksLoading,
  };
}
