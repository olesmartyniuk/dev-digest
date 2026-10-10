/* BriefSection — the generated brief: summary, Risk areas, Review focus
   (L05 / SPEC-03). A divider separates it from IntentSection above (D6). */
"use client";

import { useTranslations } from "next-intl";
import { Skeleton, ErrorState, EmptyState, Button } from "@devdigest/ui";
import type { PrBriefView } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { formatCostUsd } from "@/lib/format";
import { SummaryBlock } from "../SummaryBlock";
import { RiskAreasBlock } from "../RiskAreasBlock";
import { ReviewFocusBlock } from "../ReviewFocusBlock";
import { s as cardStyles } from "../../styles";
import { s } from "./styles";

export function BriefSection({
  brief,
  isLoading,
  isError,
  refetch,
  generate,
  isGenerating,
  generateError,
  onOpenFile,
}: {
  brief: PrBriefView | null | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  generate: () => void;
  isGenerating: boolean;
  generateError: unknown;
  onOpenFile: (path: string) => void;
}) {
  const t = useTranslations("brief");

  if (isLoading) {
    return (
      <div style={cardStyles.divider}>
        <Skeleton height={16} width={280} />
        <Skeleton height={60} />
      </div>
    );
  }

  if (isError) {
    return (
      <div style={cardStyles.divider}>
        <ErrorState title={t("generate.loadFailed")} onRetry={refetch} />
      </div>
    );
  }

  const errorMessage = generateError instanceof ApiError ? generateError.message : "";

  return (
    <div style={cardStyles.divider}>
      {!!generateError && (
        <ErrorState
          title={t("generate.failed")}
          body={t("generate.failedHint", { message: errorMessage })}
          onRetry={generate}
        />
      )}

      {brief === null && !generateError && (
        <EmptyState
          icon="Sparkles"
          title={t("generate.empty")}
          body={t("generate.emptyHint")}
          cta={t("generate.cta")}
          onCta={generate}
          ctaLoading={isGenerating}
        />
      )}

      {brief && (
        <>
          <SummaryBlock summary={brief.summary} />
          <RiskAreasBlock risks={brief.risks} />
          <ReviewFocusBlock items={brief.review_focus} onOpenFile={onOpenFile} />
          <div style={s.footer}>
            <span className="mono">{brief.model}</span>
            <span>{formatCostUsd(brief.cost_usd)}</span>
            <span>{t("meta.generatedAt", { when: new Date(brief.generated_at).toLocaleString() })}</span>
          </div>
          <Button kind="ghost" size="sm" icon="RefreshCw" loading={isGenerating} onClick={generate}>
            {t("generate.regenerate")}
          </Button>
        </>
      )}
    </div>
  );
}
