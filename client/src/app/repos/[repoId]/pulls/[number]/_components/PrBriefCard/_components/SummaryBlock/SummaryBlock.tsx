/* SummaryBlock — presentational: the generated 2-4 sentence "what + why" summary. */
"use client";

import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";

export function SummaryBlock({ summary }: { summary: string }) {
  const t = useTranslations("brief");
  return (
    <div>
      <SectionLabel icon="Sparkles">{t("block.summary")}</SectionLabel>
      <p>{summary}</p>
    </div>
  );
}
