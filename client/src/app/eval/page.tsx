/* /eval — Eval Dashboard, all agents (L06, SPEC-04): one card per agent that
   owns eval cases + a "recent eval runs · all agents" table. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useEvalWorkspaceDashboard } from "@/lib/hooks/eval";
import { AgentEvalCard } from "./_components/AgentEvalCard";
import { RecentEvalRunsTable } from "./_components/RecentEvalRunsTable";
import { s } from "./styles";

export default function EvalDashboardPage() {
  const t = useTranslations("eval");
  const { data, isLoading, isError, refetch } = useEvalWorkspaceDashboard();
  const crumb = [{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }];

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <h1 style={s.title}>{t("dashboard.defaultTitle")}</h1>

        {isError ? (
          <ErrorState title={t("dashboard.loadError")} onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <>
            <Skeleton height={120} />
            <Skeleton height={200} />
          </>
        ) : (
          <>
            {data.agents.length > 0 && (
              <div style={s.grid}>
                {data.agents.map((card) => (
                  <AgentEvalCard key={card.agent_id} card={card} />
                ))}
              </div>
            )}

            <div>
              <div style={s.sectionLabel}>{t("dashboard.recentAllAgents")}</div>
              {data.recent_runs.length === 0 ? (
                <EmptyState icon="BarChart" title={t("dashboard.noRuns")} />
              ) : (
                <RecentEvalRunsTable runs={data.recent_runs} />
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
