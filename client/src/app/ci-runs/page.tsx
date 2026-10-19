/* /ci-runs — CI Runs (SPEC-05): every agent review that ran inside CI, ingested
   from GitHub Actions artifacts. Syncs on open and on Refresh; filters are
   client-side. Local runs never appear here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { CiRunsTable } from "@/components/ci-runs-table";
import { CiRunsFilters } from "./_components/CiRunsFilters";
import { useCiRunsPage } from "./_hooks/useCiRunsPage";
import { s } from "./styles";

export default function CiRunsPage() {
  const t = useTranslations("ci");
  const p = useCiRunsPage();
  const crumb = [{ label: t("page.crumb") }];

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.head}>
          <div style={s.headText}>
            <h1 style={s.title}>{t("runs.title")}</h1>
            <p style={s.subtitle}>{t("runs.subtitle")}</p>
          </div>
          <Button icon="RefreshCw" loading={p.syncing} disabled={p.syncing} onClick={p.refresh}>
            {p.syncing ? t("runs.refreshing") : t("runs.refresh")}
          </Button>
        </div>

        {p.syncError && (
          <div role="status" style={s.warning}>
            {t("runs.syncError", { message: p.syncError })}
          </div>
        )}

        {p.isError ? (
          <ErrorState title={t("runs.loadError")} onRetry={() => p.refetch()} />
        ) : p.isLoading ? (
          <Skeleton height={200} />
        ) : p.totalCount === 0 ? (
          <EmptyState icon="Workflow" title={t("runs.emptyTitle")} body={t("runs.emptyBody")} />
        ) : (
          <>
            <CiRunsFilters filters={p.filters} options={p.options} onChange={p.setFilter} />
            <CiRunsTable runs={p.runs} />
          </>
        )}
      </div>
    </AppShell>
  );
}
