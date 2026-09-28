"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, CircularScore, Icon } from "@devdigest/ui";
import type { FindingRecord, RunSummary } from "@devdigest/shared";
import { RunCostBadge } from "@/components/run-cost-badge";
import { outcomeOf } from "../../helpers";
import { s } from "../../styles";
import { RunFindings } from "../RunFindings";

/** One agent run in the timeline: outcome badge, score, findings and actions. */
export function RunRow({
  run,
  findings,
  onOpenTrace,
  onGoToReview,
  onDelete,
}: {
  run: RunSummary;
  /** This run's findings, when the caller has them (see FindingsTab). */
  findings?: FindingRecord[];
  onOpenTrace: (runId: string) => void;
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}) {
  const t = useTranslations("prReview");
  const outcome = outcomeOf(run);
  const settled = run.status === "done";

  return (
    <div style={s.runRow}>
      <Badge color={outcome.color} bg={outcome.bg} icon={outcome.icon}>
        {t(`runStatus.${outcome.key}`)}
      </Badge>
      {settled && run.score != null && <CircularScore score={run.score} size={30} stroke={3} />}
      <div style={s.runMain}>
        <div style={s.runTitle}>
          <button
            type="button"
            onClick={() => onGoToReview?.(run.run_id)}
            title={t("timeline.goToReview")}
            style={s.agentNameButton(Boolean(onGoToReview))}
          >
            {run.agent_name ?? "Agent"}
          </button>{" "}
          <span className="mono" style={s.runModel}>
            {run.provider}/{run.model}
          </span>
        </div>
        {run.status === "failed" && run.error && (
          <div style={s.runError} title={run.error}>
            {run.error}
          </div>
        )}
        {settled && (
          <div style={s.runMeta}>
            <RunFindings findings={findings} run={run} />
            {(run.blockers ?? 0) > 0 ? (
              <span>{t("runStatus.blockers", { count: run.blockers ?? 0 })}</span>
            ) : null}
          </div>
        )}
      </div>
      <div style={s.runAside}>
        {settled && (
          <RunCostBadge
            variant="full"
            costUsd={run.cost_usd}
            tokensIn={run.tokens_in}
            tokensOut={run.tokens_out}
          />
        )}
        {run.ran_at && <span>{new Date(run.ran_at).toLocaleTimeString()}</span>}
      </div>
      <button
        type="button"
        title={t("timeline.openTrace")}
        aria-label={t("timeline.openTrace")}
        onClick={() => onOpenTrace(run.run_id)}
        style={s.iconBtn}
      >
        <Icon.FileText size={13} />
      </button>
      {onDelete && run.status !== "running" && (
        <span
          role="button"
          aria-label={t("timeline.deleteRun")}
          title={t("timeline.deleteRun")}
          onClick={() => onDelete(run.run_id)}
          style={s.deleteBtn}
        >
          <Icon.Trash size={13} />
        </span>
      )}
    </div>
  );
}
