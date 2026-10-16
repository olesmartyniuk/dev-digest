/* /multi-agent — sidebar entry point. Redirects to the latest multi-agent run,
   or to Configure run when none exists yet (SPEC-05, D7). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useLatestMultiAgentRun } from "@/lib/hooks/multi-agent";

export default function MultiAgentEntryPage() {
  const t = useTranslations("runs");
  const router = useRouter();
  const { data, isError, refetch } = useLatestMultiAgentRun();

  React.useEffect(() => {
    if (!data) return;
    router.replace(data.id ? `/multi-agent/${data.id}` : "/multi-agent/configure");
  }, [data, router]);

  return (
    <AppShell crumb={[{ label: t("page.crumb") }]}>
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div style={{ padding: 28 }}>
          <Skeleton height={120} />
        </div>
      )}
    </AppShell>
  );
}
