"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Icon } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { s } from "./styles";

/** Editor pane header: which agent is open, on what model, and its run action. */
export function AgentDetailHeader({ agent }: { agent: Agent }) {
  const router = useRouter();

  return (
    <div style={s.header}>
      <Icon.Cpu size={18} style={s.icon} />
      <h1 style={s.name}>{agent.name}</h1>
      <Badge color="var(--text-secondary)" mono>
        {agent.provider}/{agent.model}
      </Badge>
      {!agent.enabled && <Badge color="var(--text-muted)">disabled</Badge>}
      <div style={s.actions}>
        <Button kind="secondary" size="sm" icon="GitPullRequest" onClick={() => router.push("/")}>
          Run on a PR…
        </Button>
      </div>
    </div>
  );
}
