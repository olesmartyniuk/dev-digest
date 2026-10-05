/* Onboarding Tour (SPEC-02) — /repos/:repoId/onboarding.
   A 5-section guided tour generated from the repo's index + Project Context
   documents: architecture, critical paths, how to run locally, a reading
   path, and first tasks. Generation requires a fully-indexed repo (AC-4).
   Not to be confused with /onboarding, the unrelated add-repository page. */
"use client";

import { useParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { SectionCard } from "./_components/SectionCard";
import { SectionBody } from "./_components/SectionBody";
import { SourceFileDrawer } from "./_components/SourceFileDrawer";
import { useOnboardingPage } from "./_hooks/useOnboardingPage";
import { orderedSections } from "./helpers";
import { s } from "./styles";

export default function OnboardingTourPage() {
  const t = useTranslations("onboarding");
  const format = useFormatter();
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const page = useOnboardingPage(repoId);

  const repoName = activeRepo?.full_name ?? repoId;
  const shortName = repoName.split("/").pop() ?? repoName;
  const crumb = [{ label: t("title") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const notReady = !page.indexReady || page.blockedByServer;
  const showGenerateError = page.generateError && !page.blockedByServer;

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.headerRow}>
          <div style={s.headerText}>
            <h1 style={s.title}>
              {t("title")}
              <span style={s.titleRepo}> {shortName}</span>
            </h1>
            {page.status === "ready" && page.generatedAt && (
              <div style={s.subtitle}>
                {t("lastRefreshed", {
                  when: format.dateTime(new Date(page.generatedAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }),
                })}
              </div>
            )}
          </div>
          {page.status === "ready" && (
            <div style={s.headerActions}>
              <Button
                kind="secondary"
                icon="RefreshCw"
                loading={page.generating}
                disabled={!page.indexReady || page.generating}
                onClick={page.generate}
              >
                {page.generating ? t("regenerating") : t("regenerate")}
              </Button>
            </div>
          )}
        </div>

        {page.isLoading && <Skeleton height={400} />}

        {page.isError && (
          <div style={s.error}>
            <ErrorState title={t("loadError.title")} onRetry={() => page.refetch()} />
          </div>
        )}

        {!page.isLoading && !page.isError && notReady && (
          <div style={s.notice}>
            <Icon.AlertTriangle size={18} style={s.noticeIcon} />
            <div>
              <div style={s.noticeTitle}>{t("blocked.title")}</div>
              <div style={s.noticeBody}>{t("blocked.body", { status: page.indexStatus ?? "" })}</div>
              {page.status === "not_generated" && (
                <>
                  <div style={s.noticeBody}>{t("generate.body")}</div>
                  <div style={{ marginTop: 10 }}>
                    <Button kind="primary" disabled>
                      {t("generate.cta")}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {!page.isLoading &&
          !page.isError &&
          !notReady &&
          page.status === "not_generated" && (
            <EmptyState
              icon="Lightbulb"
              title={t("generate.title")}
              body={t("generate.body")}
              cta={t("generate.cta")}
              onCta={page.generate}
              ctaLoading={page.generating}
            />
          )}

        {showGenerateError && (
          <div style={s.error}>
            <ErrorState
              title={t("generateError.title")}
              body={(page.generateError as Error).message}
              onRetry={page.generate}
            />
          </div>
        )}

        {!page.isLoading && !page.isError && page.limitedData && page.status === "ready" && (
          <div style={s.notice}>
            <Icon.Info size={18} style={s.noticeIcon} />
            <div>
              <div style={s.noticeTitle}>{t("limitedData.title")}</div>
              <div style={s.noticeBody}>{t("limitedData.body")}</div>
            </div>
          </div>
        )}

        {!page.isLoading && !page.isError && page.status === "ready" && page.tour && (
          <div style={s.sections}>
            {orderedSections(page.tour).map((section) => (
              <SectionCard key={section.kind} kind={section.kind} title={t(`sectionTitles.${section.kind}`)}>
                <SectionBody section={section} onOpenFile={page.openFile} />
              </SectionCard>
            ))}
          </div>
        )}
      </div>

      <SourceFileDrawer
        repoId={repoId}
        path={page.filePath}
        mode={page.viewerMode}
        onMode={page.setViewerMode}
        onClose={page.closeFile}
      />
    </AppShell>
  );
}
