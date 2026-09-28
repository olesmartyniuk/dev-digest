/* /agents/:id — Agent Editor (A2, L03). Left agent list + Config editor
   (model + system prompt). Tab state lives in ?tab=. Ported from
   screen_agents.jsx. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api";
import { useAgent, useAgents } from "@/lib/hooks/agents";
import { AgentEditor } from "./_components/AgentEditor";
import { AgentSidebar } from "./_components/AgentSidebar";
import { AgentDetailHeader } from "./_components/AgentDetailHeader";
import { useAgentTab } from "./_hooks/useAgentTab";
import { s } from "./styles";

export default function AgentEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { data: agents } = useAgents();
  const { data: agent, isLoading, isError, error, refetch } = useAgent(id);
  const { tab, setTab } = useAgentTab(id);

  const crumb = [
    { label: "Skills Lab" },
    { label: "Agents", href: "/agents" },
    { label: agent?.name ?? "Agent" },
  ];

  if (isError || (!isLoading && !agent)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title="Couldn’t load this agent"
          body={error instanceof ApiError ? error.message : "The agent could not be loaded."}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <AgentSidebar agents={agents ?? []} activeId={id} tab={tab} />

        {isLoading || !agent ? (
          <div style={s.loadingPane}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={s.editorPane}>
            <AgentDetailHeader agent={agent} />
            <div style={s.editorBody}>
              <AgentEditor agent={agent} tab={tab} onTab={setTab} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
