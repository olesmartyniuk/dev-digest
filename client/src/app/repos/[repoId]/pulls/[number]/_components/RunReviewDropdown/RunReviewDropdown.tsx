/* RunReviewDropdown — the PR page's multi-agent picker (SPEC-05, M1).
   Ticks enabled agents, then kicks off ONE multi-agent review
   (POST /pulls/:id/review {agentIds}), hands the runIds up so the parent can
   stream SSE live status, and navigates to the results page. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Icon, Popover } from "@devdigest/ui";
import { useAgents } from "../../../../../../../lib/hooks/agents";
import { useAgentEstimates, useStartMultiAgentReview } from "../../../../../../../lib/hooks/multi-agent";
import { formatDurationMs } from "../../../../../../../lib/format";
import { estimateFor, useAgentSelection } from "../../../../../../../components/multi-agent";
import { PICKER_WIDTH } from "./constants";
import { s } from "./styles";

export function RunReviewDropdown({
  prId,
  size = "sm",
  kind = "primary",
  warnMerged = false,
  onRunStart,
  onRunsStarted,
  onRunSettled,
}: {
  prId: string;
  size?: "sm" | "md" | "lg";
  kind?: "primary" | "secondary";
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** Fired the moment a run is kicked off (before it completes). */
  onRunStart?: () => void;
  onRunsStarted?: (runIds: string[]) => void;
  /** Fired when the run request settles (success or error). */
  onRunSettled?: () => void;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const { data: agents } = useAgents();
  const { data: estimates } = useAgentEstimates();
  const start = useStartMultiAgentReview();
  const selection = useAgentSelection();
  const enabled = (agents ?? []).filter((a) => a.enabled);

  const run = async () => {
    onRunStart?.();
    try {
      const res = await start.mutateAsync({ prId, agentIds: selection.selected });
      onRunsStarted?.(res.runs.map((r) => r.run_id));
      router.push(`/multi-agent/${res.multi_agent_run_id}`);
    } catch {
      /* the global mutation toast reports it; stay on the PR page */
    } finally {
      onRunSettled?.();
    }
  };

  return (
    <Popover
      label={t("runReview.pickerLabel")}
      align="end"
      width={PICKER_WIDTH}
      trigger={
        <span
          title={warnMerged ? t("runReview.mergedTooltip") : undefined}
          style={{
            ...s.trigger,
            ...(kind === "primary" ? s.triggerPrimary : s.triggerSecondary),
            ...(size === "lg" ? { padding: "10px 18px", fontSize: 14 } : {}),
            ...(size === "md" ? { padding: "7px 13px", fontSize: 13 } : {}),
            ...(warnMerged ? { opacity: 0.6 } : {}),
          }}
        >
          <Icon.Sparkles size={14} />
          {start.isPending ? t("runReview.running") : t("runReview.runReview")}
          <Icon.ChevronDown size={14} />
        </span>
      }
    >
      <div style={s.panel}>
        <div style={s.title}>{t("runReview.pickTitle")}</div>
        {warnMerged && <div style={s.warning}>{t("runReview.mergedWarning")}</div>}
        {enabled.length === 0 ? (
          <>
            <div style={s.emptyText}>{t("runReview.noAgents")}</div>
            <Button kind="secondary" size="sm" onClick={() => router.push("/agents")}>
              {t("runReview.createAgent")}
            </Button>
          </>
        ) : (
          <>
            <div style={s.list}>
              {enabled.map((a) => {
                const ms = estimateFor(estimates, a.id)?.mean_duration_ms;
                return (
                  <div key={a.id} style={s.row}>
                    <Checkbox
                      checked={selection.isSelected(a.id)}
                      onChange={() => selection.toggle(a.id)}
                      label={a.name}
                    />
                    <span style={s.estimate}>
                      {ms != null ? formatDurationMs(ms) : t("runReview.estimateUnavailable")}
                    </span>
                  </div>
                );
              })}
            </div>
            <div style={s.footer}>
              <button type="button" style={s.linkBtn} onClick={selection.clear}>
                {t("runReview.clear")}
              </button>
              <Button
                kind="primary"
                size="sm"
                full
                disabled={selection.count === 0 || start.isPending}
                onClick={run}
              >
                {t("runReview.runMulti", { count: selection.count })}
              </Button>
            </div>
          </>
        )}
        <button
          type="button"
          style={s.linkBtn}
          onClick={() => router.push(`/multi-agent/configure?pr=${prId}`)}
        >
          {t("runReview.configureAgents")}
        </button>
      </div>
    </Popover>
  );
}
