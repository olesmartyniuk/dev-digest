/* BlastRadiusBlock — PR Overview block, container.
   Per changed symbol: its callers (file:line, clickable to GitHub) and the
   HTTP endpoints/cron jobs reachable from them. Pure reshape of the
   repo-intel facade, no LLM call. The ripgrep fallback reports `degraded`
   even when it found real callers, so the degraded notice renders ALONGSIDE
   results, never instead of them. */
"use client";

import { useTranslations } from "next-intl";
import { SectionLabel, Skeleton, ErrorState } from "@devdigest/ui";
import { usePrBlastRadius } from "@/lib/hooks";
import { SymbolImpactRow } from "./_components/SymbolImpactRow";
import { blastStats, degradedMessageKey } from "./helpers";
import { s } from "./styles";

export function BlastRadiusBlock({
  prId,
  repoFullName,
  headSha,
}: {
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("blast");
  const { data, isLoading, isError, refetch } = usePrBlastRadius(prId);

  if (isLoading) {
    return (
      <section>
        <SectionLabel>{t("title")}</SectionLabel>
        <Skeleton height={16} width={320} />
        <Skeleton height={14} width={220} style={{ marginTop: 8 }} />
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section>
        <ErrorState title={t("unavailable")} body={t("unavailableHint")} onRetry={() => refetch()} />
      </section>
    );
  }

  const stats = blastStats(data);

  return (
    <section style={s.section}>
      <SectionLabel>{t("title")}</SectionLabel>

      <div style={s.statsLine}>
        {stats.symbols} {t("stat.symbols")} · {stats.callers} {t("stat.callers")} · {stats.endpoints}{" "}
        {t("stat.endpoints")} · {stats.crons} {t("stat.crons")}
      </div>

      {data.degraded && (
        <div role="status" style={s.degradedNotice}>
          <div style={s.degradedTitle}>{t("degraded.title")}</div>
          <div>{t(degradedMessageKey(data.degraded_reason))}</div>
        </div>
      )}

      {data.changed_symbols.length === 0 ? (
        <div style={s.emptyText}>{t("noSymbols")}</div>
      ) : data.downstream.length === 0 ? (
        <div style={s.emptyText}>{t("noDownstream", { count: data.changed_symbols.length })}</div>
      ) : (
        <ul style={s.resultsList}>
          {data.downstream.map((d) => (
            <SymbolImpactRow key={d.symbol} impact={d} repoFullName={repoFullName} headSha={headSha} />
          ))}
        </ul>
      )}
    </section>
  );
}
