/* Project Context — /repos/:repoId/context.
   Browse the .md documents discovered under this repo's configured roots
   (specs/, docs/, insights/ by default, any depth). Read-only: nothing here
   ever writes to the clone (D3). */
"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { DocList } from "./_components/DocList";
import { DocViewer } from "./_components/DocViewer";
import { IndexStatusLine } from "./_components/IndexStatusLine";
import { useContextPage } from "./_hooks/useContextPage";
import { s } from "./styles";

export default function ProjectContextPage() {
  const t = useTranslations("context");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const page = useContextPage(repoId);

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

  const listing = page.listing;
  const empty = !page.isLoading && !page.isError && listing?.clone_status === "ready" && page.documents.length === 0;

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.headerRow}>
          <div style={s.headerText}>
            <h1 style={s.title}>
              {t("title")}
              <span style={s.titleRepo}> {shortName}</span>
            </h1>
            {listing && <div style={s.subtitle}><IndexStatusLine count={page.documents.length} scannedAt={listing.scanned_at} /></div>}
            {listing && <div style={s.roots}>{t("roots", { roots: listing.roots.join(", ") })}</div>}
          </div>
          <div style={s.headerActions}>
            <Button
              kind="secondary"
              icon="RefreshCw"
              loading={page.rescanning}
              disabled={page.rescanning}
              onClick={page.rescan}
            >
              {page.rescanning ? t("status.rescanning") : t("status.rescan")}
            </Button>
          </div>
        </div>

        {page.isLoading && <Skeleton height={400} />}

        {page.isError && (
          <div style={s.error}>
            <ErrorState body={t("loadError")} onRetry={() => page.refetch()} />
          </div>
        )}

        {listing?.clone_status === "not_cloned" && (
          <EmptyState icon="FileText" title={t("empty.notClonedTitle")} body={t("empty.notClonedBody")} />
        )}
        {listing?.clone_status === "missing" && (
          <EmptyState icon="FileText" title={t("empty.title")} body={t("empty.missingBody")} />
        )}
        {empty && <EmptyState icon="FileText" title={t("empty.title")} body={t("empty.body")} />}

        {listing?.clone_status === "ready" && page.documents.length > 0 && (
          <div style={s.split}>
            <DocList documents={page.documents} selectedPath={page.selectedPath} onSelect={page.select} />
            <DocViewer repoId={repoId} path={page.selectedPath} mode={page.mode} onMode={page.setMode} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
