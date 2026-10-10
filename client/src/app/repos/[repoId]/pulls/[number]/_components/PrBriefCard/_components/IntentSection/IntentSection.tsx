/* IntentSection — the L03 intent block, moved out of PrBriefCard verbatim
   (plan D6) so its own loading/error/empty states no longer hide the L05
   brief section below it, and vice versa. */
"use client";

import { useTranslations } from "next-intl";
import { Skeleton, ErrorState, EmptyState, Button, SectionLabel } from "@devdigest/ui";
import { usePrIntent, useClassifyIntent } from "@/lib/hooks";
import { IntentBlock } from "../IntentBlock";
import { s } from "./styles";

export function IntentSection({ prId }: { prId: string }) {
  const t = useTranslations("brief");
  const { data, isLoading, isError, refetch } = usePrIntent(prId);
  const mutation = useClassifyIntent(prId);

  if (isLoading) {
    return (
      <div>
        <SectionLabel icon="Sparkles">{t("block.intent")}</SectionLabel>
        <Skeleton height={16} width={320} />
        <Skeleton height={14} width={220} style={{ marginTop: 8 }} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div>
        <ErrorState title={t("unavailable")} body={t("unavailableHint")} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div>
      <SectionLabel icon="Sparkles">{t("block.intent")}</SectionLabel>

      {data.intent === null ? (
        <EmptyState
          icon="Sparkles"
          title={t("intent.empty")}
          body={t("intent.emptyHint")}
          cta={t("intent.classify")}
          onCta={() => mutation.mutate()}
          ctaLoading={mutation.isPending}
        />
      ) : (
        <>
          <IntentBlock intent={data.intent} />
          <div style={s.rerunRow}>
            <Button
              kind="ghost"
              size="sm"
              icon="RefreshCw"
              loading={mutation.isPending}
              aria-label={t("intent.rerun")}
              onClick={() => mutation.mutate()}
            >
              {t("intent.rerun")}
            </Button>
          </div>
        </>
      )}

      {data.skipped && (
        <div role="status" style={s.skipped}>
          {t("intent.skipped", { reason: data.skipped })}
        </div>
      )}
      {data.intent?.stale && <div style={s.stale}>{t("intent.stale")}</div>}
    </div>
  );
}
