/* /eval/[agentId] — per-agent eval dashboard (L06, SPEC-04): metric tiles with
   deltas, METRIC TREND chart, RECENT RUNS table with a checkbox per run and a
   Compare action (enabled at exactly two selections), regression banner,
   agent switcher and "Run eval". */
"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ErrorState, LineChart, SelectInput, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { EvalMetricTiles } from "@/components/eval-metrics";
import { useAgent } from "@/lib/hooks/agents";
import {
  useAgentEvalDashboard,
  useEvalWorkspaceDashboard,
  useStartEvalRun,
} from "@/lib/hooks/eval";
import { AgentRunsTable } from "./_components/AgentRunsTable";
import { CompareRunsModal } from "./_components/CompareRunsModal";
import { RegressionBanner } from "./_components/RegressionBanner";
import { useEvalRunSelection } from "./_hooks/useEvalRunSelection";
import { trendSeries, trendYMin, latestNa } from "./helpers";
import { s } from "./styles";

export default function AgentEvalDashboardPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const t = useTranslations("eval");
  const router = useRouter();
  const { data: agent } = useAgent(agentId);
  const dash = useAgentEvalDashboard(agentId);
  const workspace = useEvalWorkspaceDashboard();
  const start = useStartEvalRun(agentId);
  const selection = useEvalRunSelection();
  const [comparing, setComparing] = React.useState(false);

  const data = dash.data;
  const isRunning =
    (data?.runs ?? []).some((r) => r.status === "running") ||
    (start.isPending && start.variables === undefined);
  const casesTotal = data?.dashboard.cases_total ?? 0;

  const crumb = [
    { label: t("page.crumbSkillsLab") },
    { label: t("page.crumbEvalDashboard"), href: "/eval" },
    { label: agent?.name ?? t("page.crumbAgent") },
  ];
  const agentOptions = (workspace.data?.agents ?? []).map((a) => ({ value: a.agent_id, label: a.agent_name }));

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.topRow}>
          <Link href="/eval" style={s.back}>
            ← {t("page.allAgents")}
          </Link>
          {agentOptions.length > 1 && (
            <div style={s.switcher} aria-label={t("page.switchAgent")}>
              <SelectInput value={agentId} options={agentOptions} onChange={(id) => router.push(`/eval/${id}`)} mono={false} />
            </div>
          )}
          <div style={s.spacer} />
          <Button
            kind="primary"
            icon="Play"
            loading={isRunning}
            disabled={isRunning || casesTotal === 0}
            onClick={() => start.mutate(undefined)}
          >
            {isRunning ? t("dashboard.running") : t("dashboard.runEval", { count: casesTotal })}
          </Button>
        </div>

        <h1 style={s.title}>{agent?.name ?? t("dashboard.defaultTitle")}</h1>

        {dash.isError ? (
          <ErrorState title={t("dashboard.loadError")} onRetry={() => dash.refetch()} />
        ) : dash.isLoading || !data ? (
          <>
            <Skeleton height={110} />
            <Skeleton height={220} />
          </>
        ) : (
          <>
            {data.regression && <RegressionBanner regression={data.regression} />}

            <EvalMetricTiles
              current={data.dashboard.current}
              delta={data.dashboard.delta}
              na={latestNa(data.runs)}
              trend={data.dashboard.trend}
            />

            <div>
              <div style={s.sectionLabel}>{t("dashboard.metricTrend")}</div>
              {data.dashboard.trend.length < 2 ? (
                <div style={s.muted}>{t("dashboard.noRuns")}</div>
              ) : (
                <LineChart series={trendSeries(data.dashboard.trend, t)} yMin={trendYMin(data.dashboard.trend)} yMax={1} />
              )}
            </div>

            <div>
              <div style={s.tableHeader}>
                <div style={s.sectionLabel}>{t("dashboard.recentRuns")}</div>
                <div style={s.spacer} />
                <span style={s.muted}>{selection.canCompare ? null : t("dashboard.compareHint")}</span>
                <Button
                  kind="secondary"
                  size="sm"
                  icon="GitMerge"
                  disabled={!selection.canCompare}
                  onClick={() => setComparing(true)}
                >
                  {t("dashboard.compare")}
                </Button>
              </div>
              {data.runs.length === 0 ? (
                <div style={s.muted}>{t("dashboard.noRuns")}</div>
              ) : (
                <AgentRunsTable runs={data.runs} selected={selection.selected} onToggle={selection.toggle} />
              )}
            </div>
          </>
        )}
      </div>

      {comparing && selection.canCompare && (
        <CompareRunsModal
          runIds={[selection.selected[0]!, selection.selected[1]!]}
          onClose={() => setComparing(false)}
        />
      )}
    </AppShell>
  );
}
