"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Sparkline } from "@devdigest/ui";
import type { EvalAgentCard } from "@devdigest/shared";
import { formatRate, formatRunDate } from "@/components/eval-metrics";
import { s } from "./styles";

/** One agent's eval summary: name, model chip, last run, pass x/y, recall sparkline, RECALL/PREC/CITE. */
export function AgentEvalCard({ card }: { card: EvalAgentCard }) {
  const t = useTranslations("eval");
  const run = card.last_run;
  const agg = run?.aggregate ?? null;

  return (
    <Link href={`/eval/${card.agent_id}`} style={s.card}>
      <div style={s.top}>
        <span style={s.name}>{card.agent_name}</span>
        <Badge mono>{card.model}</Badge>
      </div>
      <div style={s.meta}>
        {run
          ? `v${run.agent_version} · ${formatRunDate(run.started_at)}`
          : t("dashboard.neverRun")}
        {agg && ` · ${t("dashboard.passXofY", { passed: agg.traces_passed, total: agg.traces_total })}`}
      </div>
      <div style={s.spark}>
        {card.trend.length > 1 ? <Sparkline data={card.trend.map((p) => p.recall)} w={260} h={28} /> : null}
      </div>
      <div style={s.metrics}>
        <Metric label={t("dashboard.metricShort.recall")} value={formatRate(agg?.recall, run?.na.recall)} />
        <Metric label={t("dashboard.metricShort.precision")} value={formatRate(agg?.precision, run?.na.precision)} />
        <Metric label={t("dashboard.metricShort.cite")} value={formatRate(agg?.citation_accuracy, run?.na.citation_accuracy)} />
      </div>
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.metric}>
      <span style={s.metricLabel}>{label}</span>
      <span className="tnum" style={s.metricValue}>
        {value}
      </span>
    </div>
  );
}
