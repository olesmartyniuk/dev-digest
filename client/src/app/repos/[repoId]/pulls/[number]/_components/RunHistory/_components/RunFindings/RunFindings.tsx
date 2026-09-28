"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Popover } from "@devdigest/ui";
import type { FindingRecord, RunSummary } from "@devdigest/shared";
import {
  FindingsList,
  SeverityCountBadges,
  panelFindings,
  tallySeverities,
} from "@/components/findings-list";

/**
 * One run's severity breakdown, opening that run's findings on click.
 *
 * Counts are derived from the findings themselves (dismissed ones excluded), so
 * after triage this can read lower than the run's own `findings_count`, which is
 * frozen at completion. The live number is the right one to show here.
 *
 * Falls back to the frozen count when the caller has no findings for this run —
 * a review deleted independently of its run row, or a run that never produced
 * one — so the row never silently loses its findings line.
 */
export function RunFindings({ findings, run }: { findings?: FindingRecord[]; run: RunSummary }) {
  const t = useTranslations("prReview");
  if (!findings) {
    return <span>{t("runStatus.findings", { count: run.findings_count ?? 0 })}</span>;
  }
  const outstanding = panelFindings(findings);
  const counts = tallySeverities(outstanding);
  const total = outstanding.length;
  if (total === 0) return <span>{t("runStatus.findings", { count: 0 })}</span>;

  return (
    <Popover
      label={t("findings.open", { count: total })}
      trigger={<SeverityCountBadges counts={counts} />}
      width={480}
    >
      <FindingsList findings={outstanding} scope="run" />
    </Popover>
  );
}
