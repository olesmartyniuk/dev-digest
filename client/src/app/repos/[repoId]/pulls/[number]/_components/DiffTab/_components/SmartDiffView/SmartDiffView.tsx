"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { findingsByPath, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import type { ResolvedGroup } from "../../helpers";
import { SmartDiffGroup } from "../SmartDiffGroup";

/** The Smart Diff grouped view: one `SmartDiffGroup` per role. */
export function SmartDiffView({
  groups,
  commenting,
  findings,
  focusPath,
}: {
  groups: ResolvedGroup[];
  commenting?: DiffCommentApi;
  findings: DiffFindingApi;
  focusPath?: string | null;
}) {
  const t = useTranslations("prReview");
  const byPath = React.useMemo(() => findingsByPath(findings.findings), [findings.findings]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", color: "var(--text-muted)", textTransform: "uppercase" }}>
        {t("smartDiff.groupedByRole")}
      </div>
      {groups.map((g) => (
        <SmartDiffGroup
          key={g.role}
          role={g.role}
          files={g.files}
          commenting={commenting}
          findings={findings}
          byPath={byPath}
          focusPath={focusPath}
        />
      ))}
    </div>
  );
}
