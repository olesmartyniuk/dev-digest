"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button, Dropdown } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { AgentCard } from "../../../_components/AgentCard";
import { s } from "./styles";

/** Left rail: every agent, with the current one highlighted. */
export function AgentSidebar({
  agents,
  activeId,
  tab,
}: {
  agents: Agent[];
  activeId: string;
  /** Carried into the link so switching agents keeps the open tab. */
  tab: string;
}) {
  const router = useRouter();
  const update = useUpdateAgent();

  return (
    <div style={s.sidebar}>
      <div style={s.header}>
        <div style={s.headerRow}>
          <h1 style={s.title}>Agents</h1>
          <Dropdown
            width={210}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus">
                Add
              </Button>
            }
            items={[
              { label: "Create from scratch", icon: "Edit", onClick: () => router.push("/agents") },
            ]}
          />
        </div>
      </div>
      <div style={s.list}>
        {agents.map((a) => (
          <AgentCard
            key={a.id}
            ag={a}
            active={a.id === activeId}
            onClick={() => router.push(`/agents/${a.id}?tab=${tab}`)}
            onToggle={(enabled) => update.mutate({ id: a.id, patch: { enabled } })}
          />
        ))}
      </div>
    </div>
  );
}
