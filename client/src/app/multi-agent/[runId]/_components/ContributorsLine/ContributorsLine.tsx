/* ContributorsLine — "Also flagged by X, Y" under a grouped finding (SPEC-05 AC-20). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { MultiAgentColumn, MultiAgentGroup } from "@devdigest/shared";

export function ContributorsLine({
  group,
  columns,
  excludeRunId,
}: {
  group: MultiAgentGroup | undefined;
  columns: MultiAgentColumn[];
  excludeRunId?: string;
}) {
  const t = useTranslations("runs");
  if (!group) return null;
  const names = group.run_ids
    .filter((id) => id !== excludeRunId)
    .map((id) => columns.find((c) => c.run_id === id)?.agent_name ?? t("results.deletedAgent"));
  if (names.length === 0) return null;
  return (
    <div style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 4px" }}>
      {t("results.alsoFlaggedBy", { names: names.join(", ") })}
    </div>
  );
}
