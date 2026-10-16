"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { CiExport, CiPreview } from "@devdigest/shared";
import type { InstallMode } from "../../useExportWizard";
import { SETUP_DOCS_URL } from "../../constants";
import { s } from "../../styles";

export interface InstallStepProps {
  preview: CiPreview | null;
  mode: InstallMode;
  onMode: (m: InstallMode) => void;
  error: string | null;
  result: CiExport | null;
  zipped: boolean;
}

/** Step 4 — open a PR (recommended) or download a zip. Shows the outcome once installed. */
export function InstallStep({ preview, mode, onMode, error, result, zipped }: InstallStepProps) {
  const t = useTranslations("ci.exportWizard");
  return (
    <>
      <div role="radiogroup" aria-label={t("steps.install")} style={s.grid}>
        <button
          type="button"
          role="radio"
          aria-checked={mode === "open_pr"}
          disabled={!!result}
          onClick={() => onMode("open_pr")}
          style={{ ...s.card, ...(mode === "open_pr" ? s.cardActive : null) }}
        >
          <span style={s.cardTitle}>
            {t("installCardTitle")}
            <Badge>{t("recommended")}</Badge>
          </span>
          <span style={s.cardBody}>
            {t("installCardBody", { repo: preview?.repo ?? "", count: preview?.files.length ?? 0 })}
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === "zip"}
          disabled={!!result}
          onClick={() => onMode("zip")}
          style={{ ...s.card, ...(mode === "zip" ? s.cardActive : null) }}
        >
          <span style={s.cardTitle}>{t("zipCardTitle")}</span>
          <span style={s.cardBody}>{t("zipCardBody")}</span>
        </button>
      </div>

      {error && (
        <div role="alert" style={s.error}>
          {error}
        </div>
      )}

      {result && (
        <div role="status" style={s.success}>
          {result.pr_url ? (
            <>
              {t("prOpened")}{" "}
              <a href={result.pr_url} target="_blank" rel="noopener noreferrer" style={s.link}>
                {t("viewPr")}
              </a>
            </>
          ) : (
            zipped && t("zipDone")
          )}
        </div>
      )}

      <a href={SETUP_DOCS_URL} target="_blank" rel="noopener noreferrer" style={s.link}>
        {t("setupDocs")}
      </a>
    </>
  );
}
