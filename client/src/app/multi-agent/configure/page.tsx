/* /multi-agent/configure?pr=<prId> — Configure run (SPEC-05, M2/M3): pick a PR,
   tick agents, see the estimate, start one multi-agent review. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, SearchableSelect } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { estimateFor, footerEstimate } from "@/components/multi-agent";
import { useConfigureRun } from "./_hooks/useConfigureRun";
import { AgentSelectList } from "./_components/AgentSelectList";
import { EstimateFooter } from "./_components/EstimateFooter";
import { s } from "./styles";

function ConfigureContent() {
  const t = useTranslations("runs");
  const router = useRouter();
  const { prId, setPrId, pulls, agents, estimates, selection, start, run } = useConfigureRun();

  const ticked = selection.selected.map((id) => estimateFor(estimates, id));

  return (
    <div style={s.page}>
      <h1 style={s.title}>{t("configure.title")}</h1>

      <div style={s.step}>
        <div style={s.stepLabel}>{t("configure.step1")}</div>
        <SearchableSelect
          mono={false}
          value={prId ?? ""}
          onChange={setPrId}
          placeholder={t("page.selectPr")}
          options={pulls.flatMap((p) =>
            p.id ? [{ value: p.id, label: t("page.prItem", { number: p.number, title: p.title }) }] : [],
          )}
        />
      </div>

      <div style={s.step}>
        <div style={s.stepLabel}>{t("configure.step2")}</div>
        {!prId ? (
          <div style={s.placeholder}>{t("configure.pickPrFirst")}</div>
        ) : agents.length === 0 ? (
          <EmptyState
            icon="Cpu"
            title={t("page.noAgents.title")}
            body={t("page.noAgents.body")}
            cta={t("page.noAgents.cta")}
            onCta={() => router.push("/agents")}
          />
        ) : (
          <AgentSelectList
            agents={agents}
            estimates={estimates}
            isSelected={selection.isSelected}
            onToggle={selection.toggle}
            onSelectAll={() => selection.selectAll(agents.map((a) => a.id))}
          />
        )}
      </div>

      <EstimateFooter
        count={selection.count}
        estimate={footerEstimate(ticked)}
        disabled={!prId || selection.count === 0 || start.isPending}
        pending={start.isPending}
        onRun={run}
      />
    </div>
  );
}

export default function ConfigureRunPage() {
  const t = useTranslations("runs");
  return (
    <AppShell crumb={[{ label: t("page.crumb"), href: "/multi-agent" }, { label: t("configure.title") }]}>
      {/* useSearchParams on a static route needs a Suspense boundary (CSR bailout). */}
      <React.Suspense fallback={null}>
        <ConfigureContent />
      </React.Suspense>
    </AppShell>
  );
}
