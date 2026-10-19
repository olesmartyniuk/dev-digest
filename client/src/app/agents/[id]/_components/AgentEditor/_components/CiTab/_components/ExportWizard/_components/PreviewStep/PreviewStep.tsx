"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Skeleton, Textarea } from "@devdigest/ui";
import type { CiPreview } from "@devdigest/shared";
import { s } from "../../styles";

export interface PreviewStepProps {
  preview: CiPreview | null;
  loading: boolean;
  error: string | null;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  /** The user's edit of the workflow, or null when untouched. */
  workflowDraft: string | null;
  onDraftChange: (text: string) => void;
}

/** Step 2 — the exact files that will be created. Only the workflow is editable. */
export function PreviewStep({
  preview,
  loading,
  error,
  selectedPath,
  onSelect,
  workflowDraft,
  onDraftChange,
}: PreviewStepProps) {
  const t = useTranslations("ci.exportWizard");
  if (error) {
    return (
      <div role="alert" style={s.error}>
        {error}
      </div>
    );
  }
  if (!preview || loading) {
    return (
      <div role="status" aria-live="polite">
        <span style={s.caption}>{t("generating")}</span>
        <Skeleton height={220} />
      </div>
    );
  }
  const selected = preview.files.find((f) => f.path === selectedPath) ?? preview.files[0];
  return (
    <div style={s.split}>
      <div>
        <div style={{ ...s.label, marginBottom: 8 }}>{t("filesToCreate")}</div>
        <div style={s.fileList}>
          {preview.files.map((f) => (
            <button
              key={f.path}
              type="button"
              aria-pressed={f.path === selected?.path}
              onClick={() => onSelect(f.path)}
              style={{ ...s.fileBtn, ...(f.path === selected?.path ? s.fileBtnActive : null) }}
            >
              <span className="mono">{f.path}</span>
              {f.editable && <Badge>{t("editable")}</Badge>}
              {f.exists && (
                <Badge color="var(--warn)" bg="var(--warn-bg)">
                  {t("willOverwrite")}
                </Badge>
              )}
            </button>
          ))}
        </div>
      </div>
      <div style={s.pane}>
        {selected?.editable ? (
          <Textarea mono rows={16} value={workflowDraft ?? selected.contents} onChange={onDraftChange} />
        ) : (
          <pre className="mono" style={s.pre}>
            {selected?.contents}
          </pre>
        )}
      </div>
    </div>
  );
}
