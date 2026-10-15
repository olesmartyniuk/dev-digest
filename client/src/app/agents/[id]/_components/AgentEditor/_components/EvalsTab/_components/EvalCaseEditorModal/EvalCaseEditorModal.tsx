"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, Tabs, TextInput, Textarea, FormField, Badge, Button } from "@devdigest/ui";
import { formatRate } from "@/components/eval-metrics";
import { useEvalCaseEditor } from "./useEvalCaseEditor";
import { s } from "./styles";

/**
 * Eval case editor (SPEC-04, mockup 6): Name, Input tabs (Diff / PR meta), the
 * Expected-output JSON editor with a valid/invalid badge and a "Finding
 * skeleton" button, the last-run status line, and Cancel / Run case / Save.
 * Save and Run case are disabled while the JSON is invalid (AC-28).
 */
export function EvalCaseEditorModal({
  agentId,
  caseId,
  running,
  onRunCase,
  onClose,
}: {
  agentId: string;
  /** null = a new case. */
  caseId: string | null;
  running?: boolean;
  onRunCase: (caseId: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const ed = useEvalCaseEditor(agentId, caseId, onClose);
  const title = ed.isNew ? t("caseEditor.newCase") : t("caseEditor.caseTitle", { name: ed.name });

  const tabs = [
    { key: "diff", label: t("caseEditor.tabs.diff") },
    { key: "prMeta", label: t("caseEditor.tabs.prMeta") },
  ];

  const last = ed.existing?.last_run;
  const lastRunLine = !last
    ? null
    : last.status === "never_run"
      ? t("caseEditor.neverRun")
      : last.status === "errored"
        ? t("evalsTab.errored")
        : `${last.status === "passed" ? t("caseEditor.lastRunPassed") : t("caseEditor.lastRunFailed")} · ${t(
            "caseEditor.resultSummary",
            {
              recall: formatRate(last.recall).replace("%", ""),
              precision: formatRate(last.precision).replace("%", ""),
              citation: formatRate(last.citation_accuracy).replace("%", ""),
              duration: ((last.duration_ms ?? 0) / 1000).toFixed(1),
            },
          )}`;

  return (
    <Modal
      width={760}
      title={title}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.lastRun}>{lastRunLine}</span>
          <Button kind="ghost" onClick={onClose}>
            {t("caseEditor.cancel")}
          </Button>
          <span title={!ed.canRun && !ed.isNew ? t("caseEditor.runCaseNeedsSave") : undefined}>
            <Button
              kind="secondary"
              icon="Play"
              loading={running}
              disabled={!ed.canRun || running}
              onClick={() => caseId && onRunCase(caseId)}
            >
              {running ? t("caseEditor.running") : t("caseEditor.runCase")}
            </Button>
          </span>
          <Button kind="primary" disabled={!ed.canSave || ed.isSaving} onClick={ed.save}>
            {ed.isSaving ? t("caseEditor.saving") : t("caseEditor.save")}
          </Button>
        </div>
      }
    >
      {ed.isLoadingCase ? (
        <div style={s.loading}>{t("evalsTab.loadingCases")}</div>
      ) : ed.loadFailed ? (
        <div style={s.loading}>{t("evalsTab.loadError")}</div>
      ) : (
        <div style={s.body}>
          <FormField label={t("caseEditor.nameLabel")} required>
            <TextInput
              value={ed.name}
              onChange={ed.setName}
              placeholder={t("caseEditor.namePlaceholder")}
              aria-label={t("caseEditor.nameLabel")}
              mono
            />
          </FormField>

          <FormField label={t("caseEditor.inputLabel")}>
            <div style={s.tabs}>
              <Tabs tabs={tabs} value={ed.tab} onChange={(k) => ed.setTab(k as "diff" | "prMeta")} pad="0" />
            </div>
            {ed.tab === "diff" ? (
              <Textarea
                value={ed.diff}
                onChange={ed.setDiff}
                placeholder={t("caseEditor.diffPlaceholder")}
                rows={10}
                mono
              />
            ) : (
              <div style={s.metaGrid}>
                <FormField label={t("caseEditor.titleLabel")}>
                  <TextInput
                    value={ed.title}
                    onChange={ed.setTitle}
                    placeholder={t("caseEditor.titlePlaceholder")}
                    aria-label={t("caseEditor.titleLabel")}
                  />
                </FormField>
                <FormField label={t("caseEditor.bodyLabel")}>
                  <Textarea
                    value={ed.body}
                    onChange={ed.setBody}
                    placeholder={t("caseEditor.bodyPlaceholder")}
                    rows={4}
                  />
                </FormField>
              </div>
            )}
          </FormField>

          <FormField
            label={t("caseEditor.expectedOutput")}
            right={
              <div style={s.expectedHeader}>
                {ed.parsed.ok ? (
                  <Badge color="var(--ok)" bg="var(--ok-bg)" icon="Check">
                    {t("caseEditor.validJson")}
                  </Badge>
                ) : (
                  <Badge color="var(--crit)" bg="var(--crit-bg)" icon="X">
                    {t("caseEditor.invalidJson")}
                  </Badge>
                )}
                <Button kind="ghost" size="sm" icon="Plus" onClick={ed.addSkeleton}>
                  {t("caseEditor.findingSkeleton")}
                </Button>
              </div>
            }
          >
            <Textarea value={ed.expectedText} onChange={ed.setExpectedText} rows={9} mono />
            {!ed.parsed.ok && ed.parsed.reason === "schema" && (
              <div style={s.error}>{t("caseEditor.schemaInvalid")}</div>
            )}
            {ed.contradictory && <div style={s.warning}>{t("caseEditor.contradictoryWarning")}</div>}
            {ed.error && <div style={s.error}>{ed.error}</div>}
          </FormField>
        </div>
      )}
    </Modal>
  );
}
