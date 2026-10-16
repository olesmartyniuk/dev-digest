"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import { TARGETS } from "../../constants";
import { s } from "../../styles";

export interface TargetStepProps {
  /** Message to show when the agent cannot be exported (e.g. not an OpenRouter agent). */
  blockedMessage: string | null;
}

/** Step 1 — pick where to export. GitHub Actions is preselected; the others are disabled. */
export function TargetStep({ blockedMessage }: TargetStepProps) {
  const t = useTranslations("ci.exportWizard");
  return (
    <>
      <div style={s.grid}>
        {TARGETS.map((target) => {
          const selected = target.key === "gha";
          return (
            <button
              key={target.key}
              type="button"
              disabled={!target.enabled}
              aria-disabled={!target.enabled}
              aria-pressed={target.enabled ? selected : undefined}
              style={{
                ...s.card,
                ...(selected ? s.cardActive : null),
                ...(!target.enabled ? s.cardDisabled : null),
              }}
            >
              <span style={s.cardTitle}>
                {t(`targets.${target.key}`)}
                {target.recommended && <Badge>{t("recommended")}</Badge>}
                {!target.enabled && <Badge>{t("comingSoon")}</Badge>}
              </span>
              <span style={s.cardBody}>{t(`targets.${target.key}Desc`)}</span>
            </button>
          );
        })}
      </div>
      {blockedMessage && (
        <div role="alert" style={s.notice}>
          {blockedMessage}
        </div>
      )}
    </>
  );
}
