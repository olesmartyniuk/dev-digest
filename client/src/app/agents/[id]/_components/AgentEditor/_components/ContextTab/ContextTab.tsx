"use client";

import { useTranslations } from "next-intl";
import { ContextPicker } from "@/components/context-picker";
import { useAgentContextTab } from "./useAgentContextTab";
import { s } from "./styles";

/**
 * Agent Editor — Context tab (L05 / SPEC-01). Documents inherited from linked
 * skills come first, then this agent's own, in prompt order (AC-12a). Saves
 * through its own mutation, independent of the Config tab's Save button.
 */
export function ContextTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const { repoId, attached, inherited, effective, setAttached, busy } = useAgentContextTab(agentId);

  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("context.title")}</h2>
      <p style={s.hint}>{t("context.hint")}</p>
      <ContextPicker
        repoId={repoId}
        attached={attached}
        onChange={setAttached}
        inherited={inherited}
        effective={effective}
        busy={busy}
      />
    </div>
  );
}
