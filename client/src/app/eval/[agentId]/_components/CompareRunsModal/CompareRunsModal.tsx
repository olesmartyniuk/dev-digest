"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, Skeleton } from "@devdigest/ui";
import { diffLines, metricDeltas, sameCaseSet } from "./helpers";
import { useCompareRuns } from "./useCompareRuns";
import { s } from "./styles";

const PREFIX = { add: "+ ", del: "− ", same: "  " } as const;

/**
 * Compare two eval runs old -> new (SPEC-04, mockup 4): recall / precision /
 * citation / cost as `old -> new` with a signed delta, and a SYSTEM PROMPT DIFF
 * read from the runs' own config snapshots. The diff is rendered as PLAIN TEXT
 * (React text nodes in a <pre>) — never markdown or HTML.
 */
export function CompareRunsModal({
  runIds,
  onClose,
}: {
  runIds: [string, string];
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const { isLoading, isError, older, newer } = useCompareRuns(runIds);

  return (
    <Modal
      width={720}
      title={
        older && newer
          ? t("compare.title", { old: older.agent_version, new: newer.agent_version })
          : t("compare.titleLoading")
      }
      onClose={onClose}
      footer={
        <Button kind="secondary" onClick={onClose}>
          {t("compare.close")}
        </Button>
      }
    >
      {isError ? (
        <div style={s.error}>{t("compare.loadError")}</div>
      ) : isLoading || !older || !newer ? (
        <div style={s.body}>
          <Skeleton height={80} />
          <Skeleton height={160} />
        </div>
      ) : (
        <div style={s.body}>
          {!sameCaseSet(older.case_ids, newer.case_ids) && <div style={s.warning}>{t("compare.caseSetWarning")}</div>}

          <div style={s.metrics}>
            {metricDeltas(older, newer).map((row) => (
              <div key={row.key} style={s.metricRow}>
                <span style={s.label}>{t(`compare.${row.key}`)}</span>
                <span className="tnum" style={s.values}>
                  {row.old} → {row.next}
                </span>
                <span className="tnum" style={s.delta(row.direction)}>
                  {row.delta}
                </span>
              </div>
            ))}
          </div>

          <div>
            <div style={s.diffLabel}>{t("compare.promptDiff")}</div>
            {older.agent_version === newer.agent_version ? (
              <div style={s.notice}>{t("compare.noPromptChange")}</div>
            ) : (
              <pre className="mono" style={s.diff}>
                {diffLines(older.config.system_prompt, newer.config.system_prompt).map((line, i) => (
                  <div key={i} style={s.diffLine(line.kind)}>
                    {PREFIX[line.kind]}
                    {line.text}
                  </div>
                ))}
              </pre>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
