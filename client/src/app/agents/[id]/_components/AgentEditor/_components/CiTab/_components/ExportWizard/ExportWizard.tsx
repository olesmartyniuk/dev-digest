"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { Agent, Repo } from "@devdigest/shared";
import { LAST_STEP, STEP_KEYS } from "./constants";
import { useExportWizard } from "./useExportWizard";
import { ConfigureStep } from "./_components/ConfigureStep";
import { InstallStep } from "./_components/InstallStep";
import { PreviewStep } from "./_components/PreviewStep";
import { Stepper } from "./_components/Stepper";
import { TargetStep } from "./_components/TargetStep";
import { s } from "./styles";

export interface ExportWizardProps {
  agent: Agent;
  repo: Repo;
  /** 0 = Target ("Add to CI"), 1 = Preview ("Update CI config"). */
  initialStep: 0 | 1;
  onClose: () => void;
}

/** Four-step Export-to-CI wizard rendered in a modal. */
export function ExportWizard({ agent, repo, initialStep, onClose }: ExportWizardProps) {
  const t = useTranslations("ci.exportWizard");
  const w = useExportWizard({ agentId: agent.id, repoId: repo.id, initialStep });
  const labels = STEP_KEYS.map((k) => t(`steps.${k}`));
  const notOpenRouter = agent.provider !== "openrouter";
  const blockedMessage = notOpenRouter || w.providerBlocked ? (w.previewError?.message ?? t("providerBlocked")) : null;
  const done = !!w.result;

  const footer = (
    <div style={s.footer}>
      {w.step > 0 && !done && (
        <Button kind="ghost" onClick={w.back}>
          {t("back")}
        </Button>
      )}
      <span style={s.spacer} />
      {done ? (
        <Button kind="primary" onClick={onClose}>
          {t("close")}
        </Button>
      ) : w.step < LAST_STEP ? (
        <Button
          kind="primary"
          loading={w.previewing && w.step === 0}
          disabled={notOpenRouter || !w.canContinue}
          onClick={() => void w.next()}
        >
          {t("continue")}
        </Button>
      ) : (
        <Button kind="primary" loading={w.installing} disabled={!w.preview || w.installing} onClick={() => void w.install()}>
          {w.installing ? t("installing") : t("install")}
        </Button>
      )}
    </div>
  );

  return (
    <Modal
      width={860}
      title={t("title")}
      subtitle={t("subtitle", { agentName: agent.name })}
      onClose={onClose}
      footer={footer}
    >
      <div style={s.stepper}>
        <Stepper labels={labels} step={w.step} />
        <div aria-live="polite" style={s.srOnly}>
          {t("stepAnnounce", { n: w.step + 1, label: labels[w.step] ?? "" })}
        </div>
      </div>
      <div style={s.body}>
        {w.step === 0 && <TargetStep blockedMessage={blockedMessage} />}
        {w.step === 1 && (
          <PreviewStep
            preview={w.preview}
            loading={w.previewing}
            error={w.previewError?.message ?? null}
            selectedPath={w.selectedPath}
            onSelect={w.setSelectedPath}
            workflowDraft={w.workflowDraft}
            onDraftChange={w.setWorkflowDraft}
          />
        )}
        {w.step === 2 && (
          <ConfigureStep
            preview={w.preview}
            triggers={w.triggers}
            postAs={w.postAs}
            onToggleTrigger={w.toggleTrigger}
            onPostAs={w.setPostAs}
            hasDraft={w.workflowDraft != null}
          />
        )}
        {w.step === 3 && (
          <InstallStep
            preview={w.preview}
            mode={w.installMode}
            onMode={w.setInstallMode}
            error={w.installError}
            result={w.result}
            zipped={w.zipped}
          />
        )}
      </div>
    </Modal>
  );
}
