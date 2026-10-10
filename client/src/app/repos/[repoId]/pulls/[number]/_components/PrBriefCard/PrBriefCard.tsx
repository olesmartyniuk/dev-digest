/* PrBriefCard — the PR-page brief card, container.
   Intent (L03) + generated brief: summary, Risk areas, Review focus (L05 /
   SPEC-03). Blast radius stays in OverviewTab (plan D6). */
"use client";

import { usePrBrief, useGeneratePrBrief } from "@/lib/hooks";
import { IntentSection } from "./_components/IntentSection";
import { MissingDataBanner } from "./_components/MissingDataBanner";
import { BriefSection } from "./_components/BriefSection";
import { s } from "./styles";

export function PrBriefCard({
  prId,
  onOpenFile,
}: {
  prId: string;
  onOpenFile: (path: string) => void;
}) {
  const { data, isLoading, isError, refetch } = usePrBrief(prId);
  const mutation = useGeneratePrBrief(prId);
  const brief = data?.brief;

  return (
    <div style={s.card}>
      {brief && brief.missing_sources.length > 0 && <MissingDataBanner sources={brief.missing_sources} />}

      <IntentSection prId={prId} />

      <BriefSection
        brief={brief}
        isLoading={isLoading}
        isError={isError}
        refetch={() => refetch()}
        generate={() => mutation.mutate()}
        isGenerating={mutation.isPending}
        generateError={mutation.error}
        onOpenFile={onOpenFile}
      />
    </div>
  );
}
