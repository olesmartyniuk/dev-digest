"use client";

import React from "react";
import type { ConventionSkillDraft } from "@devdigest/shared";

/**
 * The modal's form state, seeded from the SERVER-rendered draft.
 *
 * The draft arrives asynchronously, so the fields seed on first arrival and
 * then stop: re-seeding on every render of the query would wipe whatever the
 * user has typed the moment anything refetches.
 */
export interface SkillDraftForm {
  name: string;
  description: string;
  body: string;
  enabled: boolean;
  agentIds: string[];
  seeded: boolean;
  setName: (v: string) => void;
  setDescription: (v: string) => void;
  setBody: (v: string) => void;
  setEnabled: (v: boolean) => void;
  toggleAgent: (id: string) => void;
}

export function useSkillDraftForm(draft: ConventionSkillDraft | undefined): SkillDraftForm {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [body, setBody] = React.useState("");
  const [enabled, setEnabled] = React.useState(true);
  const [agentIds, setAgentIds] = React.useState<string[]>([]);
  const [seeded, setSeeded] = React.useState(false);

  React.useEffect(() => {
    if (!draft || seeded) return;
    setName(draft.name);
    setDescription(draft.description);
    setBody(draft.body);
    setSeeded(true);
  }, [draft, seeded]);

  const toggleAgent = React.useCallback((id: string) => {
    setAgentIds((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  }, []);

  return {
    name,
    description,
    body,
    enabled,
    agentIds,
    seeded,
    setName,
    setDescription,
    setBody,
    setEnabled,
    toggleAgent,
  };
}
