/* TabsView — one tab per agent (with its score); the selected agent shows its
   summary and expandable FindingCards. Accept/Dismiss on a grouped finding
   apply to every finding in the group (SPEC-05 AC-28..31). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { FindingActionKind, MultiAgentGroup, MultiAgentRunView } from "@devdigest/shared";
import { FindingCard } from "@/app/repos/[repoId]/pulls/[number]/_components/FindingCard";
import { AgentSummaryCard } from "../AgentSummaryCard";
import { ColumnLiveStatus } from "../ColumnLiveStatus";
import { ContributorsLine } from "../ContributorsLine";
import { s } from "./styles";

export function TabsView({
  view,
  agentTab,
  onAgentTab,
  groupOf,
  onOpenTrace,
  onGroupAction,
  onTurnIntoEval,
  pendingFindingIds,
  evalPendingId,
}: {
  view: MultiAgentRunView;
  agentTab: string | null;
  onAgentTab: (runId: string) => void;
  groupOf: (findingId: string) => MultiAgentGroup | undefined;
  onOpenTrace: (runId: string) => void;
  onGroupAction: (findingIds: string[], action: "accept" | "dismiss") => void;
  onTurnIntoEval: (findingId: string) => void;
  pendingFindingIds: Set<string>;
  evalPendingId: string | null;
}) {
  const t = useTranslations("runs");
  const column = view.columns.find((c) => c.run_id === agentTab) ?? view.columns[0];
  if (!column) return null;

  const tabs = view.columns.map((c) => ({
    key: c.run_id,
    label: c.agent_name ?? t("results.deletedAgent"),
    ...(c.score != null ? { count: c.score } : {}),
  }));

  return (
    <div style={s.wrap}>
      <Tabs tabs={tabs} value={column.run_id} onChange={onAgentTab} pad="0" />
      {column.status === "done" ? (
        <>
          <AgentSummaryCard column={column} onOpenTrace={onOpenTrace} />
          <div style={s.list}>
            {column.findings.length === 0 && <div style={s.muted}>{t("column.noFindings")}</div>}
            {column.findings.map((f) => {
              const group = groupOf(f.id);
              return (
                <div key={f.id}>
                  <ContributorsLine group={group} columns={view.columns} excludeRunId={column.run_id} />
                  <FindingCard
                    f={f}
                    onAction={(a: FindingActionKind) =>
                      onGroupAction(group?.finding_ids ?? [f.id], a as "accept" | "dismiss")
                    }
                    onTurnIntoEval={() => onTurnIntoEval(f.id)}
                    pending={pendingFindingIds.has(f.id)}
                    evalPending={evalPendingId === f.id}
                  />
                </div>
              );
            })}
          </div>
        </>
      ) : column.status === "failed" ? (
        <div role="alert" style={s.error}>
          <strong>{t("results.status.failed")}</strong>
          {column.error && <div>{column.error}</div>}
        </div>
      ) : column.status === "cancelled" ? (
        <div style={s.muted}>{t("results.status.cancelled")}</div>
      ) : (
        <ColumnLiveStatus runId={column.run_id} parentId={view.id} queued={column.status === "queued"} />
      )}
    </div>
  );
}
