"use client";

import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Agent, CiFailOn } from "@devdigest/shared";
import { useActiveRepo } from "@/lib/repo-context";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { useAgentCi, useCiSync } from "@/lib/hooks/ci";

export interface WizardState {
  open: boolean;
  /** 0 = Target ("Add to CI"), 1 = Preview ("Update CI config"). */
  initialStep: 0 | 1;
}

/**
 * Data + orchestration for the agent's CI tab. The active workspace repo is the
 * export target. A sync runs once on mount so a freshly finished CI run shows up
 * without visiting /ci-runs.
 */
export function useAgentCiTab(agent: Agent) {
  const { activeRepo } = useActiveRepo();
  const overview = useAgentCi(agent.id);
  const sync = useCiSync();
  const update = useUpdateAgent();
  const qc = useQueryClient();
  const [wizard, setWizard] = React.useState<WizardState>({ open: false, initialStep: 0 });

  const { mutate: runSync } = sync;
  // No "already ran" ref guard: under StrictMode it leaves `isPending` stuck
  // (the observer unsubscribes before the first mutation settles). Sync is idempotent.
  React.useEffect(() => {
    runSync(agent.id);
  }, [runSync, agent.id]);

  const currentInstallation =
    overview.data?.installations.find((i) => i.repo === activeRepo?.full_name) ?? null;

  const { mutate: updateAgent } = update;
  const setFailOn = React.useCallback(
    (v: CiFailOn) =>
      updateAgent(
        { id: agent.id, patch: { ci_fail_on: v } },
        { onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-ci", agent.id] }) },
      ),
    [updateAgent, qc, agent.id],
  );

  return {
    overview: overview.data,
    isLoading: overview.isLoading,
    isError: overview.isError,
    refetch: overview.refetch,
    repo: activeRepo,
    providerBlocked: agent.provider !== "openrouter",
    currentInstallation,
    failOn: overview.data?.ci_fail_on ?? agent.ci_fail_on,
    savingFailOn: update.isPending,
    syncError: sync.data?.error ?? null,
    wizard,
    openAdd: () => setWizard({ open: true, initialStep: 0 }),
    openUpdate: () => setWizard({ open: true, initialStep: 1 }),
    closeWizard: () => setWizard((w) => ({ ...w, open: false })),
    setFailOn,
  };
}
