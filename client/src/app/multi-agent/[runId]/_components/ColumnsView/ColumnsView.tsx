/* ColumnsView — one AgentColumn per agent, side by side (SPEC-05 AC-26). */
"use client";

import React from "react";
import type { MultiAgentGroup, MultiAgentRunView } from "@devdigest/shared";
import { AgentColumn } from "../AgentColumn";
import { s } from "./styles";

export function ColumnsView({
  view,
  groupOf,
  onOpenTrace,
}: {
  view: MultiAgentRunView;
  groupOf: (findingId: string) => MultiAgentGroup | undefined;
  onOpenTrace: (runId: string) => void;
}) {
  return (
    <div style={s.row}>
      {view.columns.map((c) => (
        <AgentColumn
          key={c.run_id}
          column={c}
          columns={view.columns}
          parentId={view.id}
          groupOf={groupOf}
          onOpenTrace={onOpenTrace}
        />
      ))}
    </div>
  );
}
