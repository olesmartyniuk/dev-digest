"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { ConventionExtractResult } from "@devdigest/shared";
import { groupDrops } from "../../helpers";
import { s } from "../../styles";

/**
 * What the last scan actually did: how much was sampled, how much the
 * proposers proposed, how much survived the evidence gate — and why the rest
 * did not.
 *
 * Surfacing the drops is the point. "The scan found three rules" is unreadable
 * on its own; "proposed 11, kept 3, seven snippets were not in the file" tells
 * the user whether to re-scan, widen the sample, or pick a better model.
 */
export function ScanSummary({ result }: { result: ConventionExtractResult }) {
  const t = useTranslations("conventions");
  const { stats } = result;
  const drops = groupDrops(result.drops);

  return (
    <>
      <div style={s.summary}>
      <Icon.Activity size={13} />
      <span>
        {t("summary.line", {
          sampled: stats.sampled_files,
          configs: stats.config_files,
          proposed: stats.proposed,
          kept: stats.kept,
        })}
      </span>
      {stats.line_corrected > 0 && (
        <Badge color="var(--warn)" bg="var(--warn-bg)">
          {t("summary.lineCorrected", { count: stats.line_corrected })}
        </Badge>
      )}
      {stats.model && <span className="mono">{stats.model}</span>}
      {stats.model_skipped && (
        <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
          {t("summary.modelSkipped")}
        </Badge>
      )}
      {stats.cost_usd != null && (
        <span className="mono tnum">${stats.cost_usd.toFixed(4)}</span>
      )}
      {drops.length > 0 && (
        <span style={s.summaryDrops}>
          {drops.map((d) => (
            <Badge key={d.reason}>
              {t(`summary.dropReason.${d.reason}`)} · {d.count}
            </Badge>
          ))}
        </span>
      )}
      </div>
      {/* The reason itself is actionable ("add a key in Settings"), so it is
          spelled out rather than hidden behind the badge. */}
      {stats.model_skipped && <div style={s.degraded}>{stats.model_skipped}</div>}
    </>
  );
}
