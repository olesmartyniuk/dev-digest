"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Agent, CiFailOn, Provider, ReviewStrategy } from "@devdigest/shared";
import { useProviderModels, useUpdateAgent } from "@/lib/hooks/agents";
import { useToast } from "@/lib/toast";
import { modelOptionsFor } from "./helpers";

export interface AgentConfigValues {
  name: string;
  description: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: ReviewStrategy;
  ciFailOn: CiFailOn;
  repoIntel: boolean;
  enabled: boolean;
}

function valuesOf(agent: Agent): AgentConfigValues {
  return {
    name: agent.name,
    description: agent.description,
    provider: agent.provider,
    model: agent.model,
    systemPrompt: agent.system_prompt,
    strategy: agent.strategy,
    ciFailOn: agent.ci_fail_on,
    repoIntel: agent.repo_intel,
    enabled: agent.enabled,
  };
}

/**
 * Edit state for the Config tab: one object rather than nine `useState`s, so
 * switching agents is a single reset and saving is a single read.
 */
export function useAgentConfigForm(agent: Agent) {
  const t = useTranslations("agents");
  const toast = useToast();
  const update = useUpdateAgent();
  const [values, setValues] = React.useState<AgentConfigValues>(() => valuesOf(agent));

  // Reset the form when switching agents (same component, different row).
  const loadedId = React.useRef(agent.id);
  if (loadedId.current !== agent.id) {
    loadedId.current = agent.id;
    setValues(valuesOf(agent));
  }

  const set = React.useCallback(
    <K extends keyof AgentConfigValues>(key: K, value: AgentConfigValues[K]) =>
      setValues((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const { data: models } = useProviderModels(values.provider);
  // Show the price (USD per 1M in/out tokens) in the label when the provider
  // exposes it (OpenRouter) so a cheap model is easy to pick; value stays the id.
  const modelOptions = React.useMemo(
    () => modelOptionsFor(models, values.model),
    [models, values.model],
  );
  // Empty list after load = provider key missing/invalid (listModels failed) —
  // guide the user instead of showing a silent one-item dropdown.
  const noModels = models !== undefined && models.length === 0;

  const save = React.useCallback(() => {
    update.mutate(
      {
        id: agent.id,
        patch: {
          name: values.name,
          description: values.description,
          provider: values.provider,
          model: values.model,
          system_prompt: values.systemPrompt,
          strategy: values.strategy,
          ci_fail_on: values.ciFailOn,
          repo_intel: values.repoIntel,
          enabled: values.enabled,
        },
      },
      {
        // Failures are surfaced by the global mutation error toast; confirm the
        // save with a success toast (not just the inline "Saved (vN)" note).
        onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })),
      },
    );
  }, [update, agent.id, values, toast, t]);

  return { values, set, modelOptions, noModels, save, update };
}
