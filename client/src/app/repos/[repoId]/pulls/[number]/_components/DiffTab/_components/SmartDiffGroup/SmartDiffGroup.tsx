"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { FindingRecord, PrFile, SmartDiffRole } from "@devdigest/shared";
import { FileCard, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import { severityColor } from "@/lib/severity";
import { DEFAULT_COLLAPSED_ROLES, ROLE_LABEL_KEY } from "../../constants";
import { groupFindingStats } from "../../helpers";
import { s, chevronFor } from "./styles";

/** One role group in the Smart Diff view — a collapsible header (role,
 *  file count, findings stat) plus its files, rendered with the shared
 *  `FileCard` so inline findings/comments work exactly as in Original order. */
export function SmartDiffGroup({
  role,
  files,
  commenting,
  findings,
  byPath,
  focusPath,
}: {
  role: SmartDiffRole;
  files: PrFile[];
  commenting?: DiffCommentApi;
  findings: DiffFindingApi;
  byPath: Map<string, FindingRecord[]>;
  focusPath?: string | null;
}) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(
    !DEFAULT_COLLAPSED_ROLES.has(role) || (focusPath != null && files.some((f) => f.path === focusPath)),
  );
  const { withFindings, worst } = React.useMemo(
    () => groupFindingStats(files, byPath),
    [files, byPath],
  );

  return (
    <div style={s.group}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={s.header}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <span>{t(ROLE_LABEL_KEY[role])}</span>
        <span style={s.filesCount}>{t("smartDiff.filesCount", { count: files.length })}</span>
        {withFindings > 0 && (
          <span style={s.findingsStat}>
            <span style={{ ...s.dot, background: severityColor(worst ?? "") }} />
            {t("smartDiff.filesWithFindings", { withFindings, count: files.length })}
          </span>
        )}
      </button>
      {open && (
        <div style={s.files}>
          {files.map((f) => (
            <FileCard
              key={f.path}
              file={f}
              commenting={commenting}
              findings={findings}
              focused={f.path === focusPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}
