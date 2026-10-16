"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox } from "@devdigest/ui";
import type { CiPostAs, CiPreview, CiTrigger } from "@devdigest/shared";
import { OPENROUTER_KEY_NAME, POST_AS_OPTIONS, TRIGGER_OPTIONS } from "../../constants";
import { s } from "../../styles";

export interface ConfigureStepProps {
  preview: CiPreview | null;
  triggers: CiTrigger[];
  postAs: CiPostAs;
  onToggleTrigger: (t: CiTrigger) => void;
  onPostAs: (v: CiPostAs) => void;
  /** True when the user has edited the workflow (changes will replace the edit). */
  hasDraft: boolean;
}

/** Step 3 — triggers, expected secrets, and where results are posted. */
export function ConfigureStep({ preview, triggers, postAs, onToggleTrigger, onPostAs, hasDraft }: ConfigureStepProps) {
  const t = useTranslations("ci.exportWizard");
  const keyReady = preview?.openrouter_key_ready ?? false;
  return (
    <>
      <div style={s.rowGap}>
        <div style={s.label}>{t("triggerLabel").toUpperCase()}</div>
        {TRIGGER_OPTIONS.map((o) => (
          <Checkbox
            key={o.value}
            checked={triggers.includes(o.value)}
            onChange={() => onToggleTrigger(o.value)}
            label={t(o.labelKey)}
          />
        ))}
        {hasDraft && <div style={s.caption}>{t("regenerateWarning")}</div>}
      </div>

      <div style={s.rowGap}>
        <div style={s.label}>{t("secretsLabel").toUpperCase()}</div>
        <div style={s.secretRow}>
          <span className="mono">{OPENROUTER_KEY_NAME}</span>
          <Badge color={keyReady ? "var(--ok)" : "var(--warn)"} bg={keyReady ? "var(--ok-bg)" : "var(--warn-bg)"}>
            {keyReady ? t("ready") : t("notSet")}
          </Badge>
        </div>
        <div style={s.secretRow}>
          <span className="mono">GITHUB_TOKEN</span>
          <span style={s.caption}>{t("autoProvided")}</span>
          <Badge color="var(--ok)" bg="var(--ok-bg)">
            {t("ready")}
          </Badge>
        </div>
        <div style={s.caption}>{t("secretsCaption")}</div>
      </div>

      <div style={s.rowGap}>
        <div style={s.label}>{t("postResultsLabel").toUpperCase()}</div>
        <div role="radiogroup" aria-label={t("postResultsLabel")} style={s.grid}>
          {POST_AS_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={postAs === o.value}
              onClick={() => onPostAs(o.value)}
              style={{ ...s.card, ...(postAs === o.value ? s.cardActive : null) }}
            >
              <span style={s.cardTitle}>
                {t(`postAs.${o.labelKey}`)}
                {o.recommended && <Badge>{t("recommended")}</Badge>}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={s.caption}>
        <strong>{t("failCiNoteTitle")}.</strong> {t("failCiNoteBody")}
      </div>
    </>
  );
}
