/* /multi-agent/[runId] — multi-agent results (SPEC-05): header, "Where agents
   disagree", and Columns / Tabs layouts. View state lives in the URL. */
"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api";
import { useMultiAgentRun } from "@/lib/hooks/multi-agent";
import RunTraceDrawer from "@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer";
import { useMultiAgentResults } from "./_hooks/useMultiAgentResults";
import { ResultsHeader } from "./_components/ResultsHeader";
import { DisagreementBlock } from "./_components/DisagreementBlock";
import { ColumnsView } from "./_components/ColumnsView";
import { TabsView } from "./_components/TabsView";
import { s } from "./styles";

function ResultsContent({ runId }: { runId: string }) {
  const t = useTranslations("runs");
  const router = useRouter();
  const r = useMultiAgentResults(runId);
  const { data } = r;

  if (r.isError) {
    const notFound = r.error instanceof ApiError && r.error.status === 404;
    return notFound ? (
      <ErrorState title={t("results.notFound")} />
    ) : (
      <ErrorState onRetry={() => r.refetch()} />
    );
  }
  if (r.isLoading || !data) return <Skeleton height={240} />;

  const traceColumn = r.traceRunId ? data.columns.find((c) => c.run_id === r.traceRunId) : undefined;
  const pending = new Set<string>(
    r.groupAction.isPending ? (r.groupAction.variables?.findingIds ?? []) : [],
  );

  return (
    <div style={s.page}>
      <ResultsHeader
        view={data}
        mode={r.view}
        onModeChange={r.setView}
        onConfigure={() => router.push(`/multi-agent/configure?pr=${data.pr_id}`)}
      />
      <DisagreementBlock
        locations={data.locations}
        onlyConflicts={r.onlyConflicts}
        onOnlyConflictsChange={r.setOnlyConflicts}
      />
      {r.view === "tabs" ? (
        <TabsView
          view={data}
          agentTab={r.agentTab}
          onAgentTab={r.setAgentTab}
          groupOf={r.groupOf}
          onOpenTrace={r.setTrace}
          onGroupAction={(findingIds, action) => r.groupAction.mutate({ findingIds, action })}
          onTurnIntoEval={r.turnIntoEval.turn}
          pendingFindingIds={pending}
          evalPendingId={r.turnIntoEval.pendingId}
        />
      ) : (
        <ColumnsView view={data} groupOf={r.groupOf} onOpenTrace={r.setTrace} />
      )}
      {traceColumn && (
        <RunTraceDrawer
          runId={traceColumn.run_id}
          prNumber={data.pr_number}
          agentName={traceColumn.agent_name}
          findings={traceColumn.findings}
          running={traceColumn.status === "running" || traceColumn.status === "queued"}
          onClose={() => r.setTrace(null)}
        />
      )}
    </div>
  );
}

function ResultsPage() {
  const t = useTranslations("runs");
  const { runId } = useParams<{ runId: string }>();
  // Same query as the content (shared cache entry); only needed for the PR number.
  const { data } = useMultiAgentRun(runId);
  const crumb = [
    { label: t("page.crumb"), href: "/multi-agent" },
    ...(data ? [{ label: `#${data.pr_number}`, mono: true }] : []),
  ];
  return (
    <AppShell crumb={crumb}>
      {/* useSearchParams (in the hook) needs a Suspense boundary on a static route. */}
      <React.Suspense fallback={<Skeleton height={240} />}>
        <ResultsContent runId={runId} />
      </React.Suspense>
    </AppShell>
  );
}

export default ResultsPage;
