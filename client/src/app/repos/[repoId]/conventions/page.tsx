/* Conventions — /repos/:repoId/conventions.
   Scan the cloned repo for house rules, judge each one against the evidence it
   was verified with, then merge the accepted ones into a Skill. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ConventionCard } from "./_components/ConventionCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { ScanSummary } from "./_components/ScanSummary";
import { useConventionsPage } from "./_hooks/useConventionsPage";
import { SKELETON_CARDS, SKELETON_CARD_HEIGHT } from "./constants";
import { s } from "./styles";

export default function ConventionsPage() {
  const t = useTranslations("conventions");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const page = useConventionsPage(repoId);

  const repoName = activeRepo?.full_name ?? repoId;
  const shortName = repoName.split("/").pop() ?? repoName;
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const { counts } = page;
  const empty = !page.isLoading && !page.isError && page.conventions.length === 0;

  return (
    <AppShell crumb={crumb}>
      {page.modalOpen && (
        <CreateSkillModal
          repoId={repoId}
          acceptedCount={counts.accepted}
          onClose={page.closeModal}
        />
      )}

      <div style={s.page}>
        <div style={s.headerRow}>
          <div style={s.headerText}>
            <h1 style={s.title}>
              {t("page.headingPrefix")}
              <span style={s.titleRepo}>{shortName}</span>
            </h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
          <Button
            kind="secondary"
            icon="RefreshCw"
            loading={page.scanning}
            disabled={page.scanning}
            onClick={() => page.scan()}
          >
            {page.scanning
              ? t("page.scanning")
              : page.conventions.length > 0
                ? t("page.rescan")
                : t("page.runExtraction")}
          </Button>
        </div>

        {page.scanError && (
          <div style={s.error}>
            <ErrorState
              title={t("page.extractionFailed")}
              body={
                page.scanError instanceof Error ? page.scanError.message : t("page.extractionFailed")
              }
              onRetry={() => page.scan()}
            />
          </div>
        )}

        {page.scanResult && <ScanSummary result={page.scanResult} />}

        {!empty && !page.isError && (
          <div style={s.toolbar}>
            <span style={s.toolbarCount}>
              {t("page.candidateCount", { count: counts.total })} ·{" "}
              {t("page.acceptedCount", { accepted: counts.accepted, total: counts.total })}
            </span>
            <Button
              kind="ghost"
              size="sm"
              icon="Check"
              disabled={counts.pending === 0}
              onClick={page.acceptAllPending}
            >
              {t("page.acceptAll")}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              icon="X"
              disabled={counts.accepted === 0}
              onClick={page.deselectAll}
            >
              {t("page.deselectAll")}
            </Button>
            <Button
              kind="primary"
              size="sm"
              icon="Sparkles"
              disabled={counts.accepted === 0}
              onClick={page.openModal}
            >
              {t("page.createSkill")}
            </Button>
          </div>
        )}

        {page.isLoading && (
          <div style={s.list}>
            {Array.from({ length: SKELETON_CARDS }, (_, i) => (
              <Skeleton key={i} height={SKELETON_CARD_HEIGHT} />
            ))}
          </div>
        )}

        {page.isError && (
          <ErrorState body={t("page.loadError")} onRetry={() => page.refetch()} />
        )}

        {empty && (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={page.scanning ? t("page.scanning") : t("page.empty.cta")}
            onCta={() => page.scan()}
          />
        )}

        <div style={s.list}>
          {page.conventions.map((c) => (
            <ConventionCard
              key={c.id}
              convention={c}
              busy={page.busyId === c.id}
              onStatusChange={(status) => page.setStatus(c.id, status)}
              onEdit={(patch) => page.editRule(c.id, patch)}
            />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
