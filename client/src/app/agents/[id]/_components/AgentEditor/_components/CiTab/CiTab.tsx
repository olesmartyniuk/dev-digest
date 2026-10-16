"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Icon, SelectInput, Skeleton } from "@devdigest/ui";
import type { Agent, CiFailOn, CiInstallationView } from "@devdigest/shared";
import { CiRunsTable, verdictColors, verdictKey } from "@/components/ci-runs-table";
import { ExportWizard } from "./_components/ExportWizard";
import { FAIL_ON_OPTIONS, relativeTime } from "./helpers";
import { useAgentCiTab } from "./useAgentCiTab";
import { s } from "./styles";

/** The agent's CI tab: where it is deployed, its latest runs, the gate level, and the export wizard. */
export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci");
  const c = useAgentCiTab(agent);
  const installations = c.overview?.installations ?? [];
  const disabled = !c.repo || c.providerBlocked;

  return (
    <div style={s.wrap}>
      <div style={s.headerRow}>
        <h2 style={s.h2}>{t("ciTab.deployHeading")}</h2>
        <Badge>{t("ciTab.activeIn", { count: installations.length })}</Badge>
        <div style={s.actions}>
          <Button disabled={disabled || !c.currentInstallation} onClick={c.openUpdate}>
            {t("ciTab.updateConfig")}
          </Button>
          <Button kind="primary" icon="Plus" disabled={disabled} onClick={c.openAdd}>
            {t("ciTab.addToCi")}
          </Button>
        </div>
      </div>

      {c.providerBlocked && (
        <div role="alert" style={s.notice}>
          {t("ciTab.providerBlocked")}
        </div>
      )}
      {!c.repo && <div style={s.meta}>{t("ciTab.noRepo")}</div>}
      {c.syncError && <div role="status" style={s.notice}>{t("runs.syncError", { message: c.syncError })}</div>}

      {c.isError ? (
        <ErrorState title={t("ciTab.loadError")} onRetry={() => c.refetch()} />
      ) : c.isLoading ? (
        <Skeleton height={120} />
      ) : (
        <>
          <div style={s.list}>
            {installations.map((i) => (
              <InstallationRow key={i.id} installation={i} />
            ))}
            <button type="button" style={s.addRow} disabled={disabled} onClick={c.openAdd}>
              <Icon.Plus size={14} />
              {t("ciTab.addRepository")}
            </button>
          </div>

          <div style={s.failOn}>
            <span style={s.failOnLabel}>{t("ciTab.failOnLabel")}</span>
            <div style={s.failOnSelect}>
              <SelectInput
                mono={false}
                value={c.failOn}
                onChange={(v) => c.setFailOn(v as CiFailOn)}
                options={FAIL_ON_OPTIONS.map((v) => ({ value: v, label: t(`ciTab.failOn.${v}`) }))}
              />
            </div>
          </div>

          <div>
            <div style={s.sectionLabel}>{t("ciTab.history").toUpperCase()}</div>
            {(c.overview?.runs.length ?? 0) === 0 ? (
              <div style={s.meta}>{t("runs.emptyBody")}</div>
            ) : (
              <CiRunsTable runs={c.overview?.runs ?? []} />
            )}
          </div>
        </>
      )}

      {c.wizard.open && c.repo && (
        <ExportWizard agent={agent} repo={c.repo} initialStep={c.wizard.initialStep} onClose={c.closeWizard} />
      )}
    </div>
  );
}

function InstallationRow({ installation: i }: { installation: CiInstallationView }) {
  const t = useTranslations("ci");
  const run = i.latest_run;
  const colors = run ? verdictColors(run.status) : null;
  return (
    <div style={s.row}>
      <span style={s.repoName}>{i.repo}</span>
      <Badge>{t("ciTab.githubActions")}</Badge>
      {run && colors ? (
        <>
          <Badge color={colors.color} bg={colors.bg}>
            {t(`runs.status.${verdictKey(run.status)}`)}
          </Badge>
          <span style={s.meta}>{relativeTime(run.ran_at)}</span>
        </>
      ) : (
        <span style={s.meta}>{t("ciTab.noRunsYet")}</span>
      )}
      <span style={s.meta}>
        {i.workflow_version != null ? t("ciTab.workflowVersion", { version: i.workflow_version }) : ""}
      </span>
      {i.out_of_date && (
        <Badge color="var(--warn)" bg="var(--warn-bg)">
          {t("ciTab.outOfDate")}
        </Badge>
      )}
      {i.pr_url && (
        <a href={i.pr_url} target="_blank" rel="noopener noreferrer" style={s.link}>
          {t("ciTab.viewPr")}
        </a>
      )}
    </div>
  );
}
