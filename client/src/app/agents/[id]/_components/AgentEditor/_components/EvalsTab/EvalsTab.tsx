"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Skeleton } from "@devdigest/ui";
import { EvalMetricTiles } from "@/components/eval-metrics";
import { EvalCaseRow } from "./_components/EvalCaseRow";
import { EvalCaseEditorModal } from "./_components/EvalCaseEditorModal";
import { latestFullNa } from "./helpers";
import { NEW_CASE, useAgentEvalsTab } from "./useAgentEvalsTab";
import { s } from "./styles";

const EMPTY_CURRENT = {
  recall: 0,
  precision: 0,
  citation_accuracy: 0,
  traces_passed: 0,
  traces_total: 0,
  cost_usd: null,
};
const EMPTY_DELTA = { recall: 0, precision: 0, citation_accuracy: 0 };

/**
 * Agent Editor — Evals tab (SPEC-04): metric tiles for the agent's latest full
 * eval run, the eval-case list (run / edit / delete per row), "Run all evals"
 * and "New eval case". Case editor opens from `?case=`.
 */
export function EvalsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("eval");
  const tab = useAgentEvalsTab(agentId);
  const dash = tab.dashboard?.dashboard;

  const confirmDelete = (id: string, name: string) => {
    if (window.confirm(t("evalsTab.confirmDelete", { name }))) tab.deleteCase(id);
  };

  return (
    <div style={s.wrap}>
      <div style={s.headerRow}>
        <div style={s.headerText}>
          <h2 style={s.h2}>{t("evalsTab.metricsTitle")}</h2>
          <p style={s.subtitle}>{t("evalsTab.metricsSubtitle")}</p>
        </div>
        <Link href={`/eval/${agentId}`} style={s.link}>
          {t("evalsTab.viewDashboard")}
        </Link>
      </div>

      <EvalMetricTiles
        current={dash?.current ?? EMPTY_CURRENT}
        delta={dash?.delta ?? EMPTY_DELTA}
        na={latestFullNa(tab.runs)}
        trend={dash?.trend ?? []}
        showTraces
      />

      <div>
        <div style={s.casesHeader}>
          <h3 style={s.casesTitle}>{t("evalsTab.casesHeading")}</h3>
          {tab.cases.length > 0 && (
            <span style={s.summary}>
              {t("evalsTab.passingSummary", { passed: tab.passing, total: tab.cases.length })}
            </span>
          )}
          <div style={s.actions}>
            <Button
              kind="primary"
              size="sm"
              icon="Play"
              loading={tab.isRunningAll}
              disabled={tab.isRunningAll || tab.cases.length === 0}
              onClick={tab.runAll}
            >
              {tab.isRunningAll
                ? t("evalsTab.running")
                : t("evalsTab.runAll", { count: tab.cases.length })}
            </Button>
            <Button kind="secondary" size="sm" icon="Plus" onClick={() => tab.editor.open(NEW_CASE)}>
              {t("caseEditor.newCase")}
            </Button>
          </div>
        </div>

        <div style={{ ...s.list, marginTop: 12 }}>
          {tab.isLoading ? (
            <>
              <Skeleton height={44} />
              <Skeleton height={44} />
              <span style={s.summary}>{t("evalsTab.loadingCases")}</span>
            </>
          ) : tab.isError ? (
            <div style={s.error}>{t("evalsTab.loadError")}</div>
          ) : tab.cases.length === 0 ? (
            <div style={s.empty}>{t("evalsTab.emptyCases")}</div>
          ) : (
            tab.cases.map((c) => (
              <EvalCaseRow
                key={c.id}
                c={c}
                running={tab.runningCaseId === c.id}
                disabled={tab.isRunningAll || tab.runningCaseId !== null}
                onRun={() => tab.runCase(c.id)}
                onEdit={() => tab.editor.open(c.id)}
                onDelete={() => confirmDelete(c.id, c.name)}
              />
            ))
          )}
        </div>
      </div>

      {tab.editor.current && (
        <EvalCaseEditorModal
          agentId={agentId}
          caseId={tab.editor.current === NEW_CASE ? null : tab.editor.current}
          running={tab.runningCaseId === tab.editor.current}
          onRunCase={tab.runCase}
          onClose={tab.editor.close}
        />
      )}
    </div>
  );
}
