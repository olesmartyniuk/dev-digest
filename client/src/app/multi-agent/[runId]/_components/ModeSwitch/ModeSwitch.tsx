/* ModeSwitch — Columns / Tabs layout toggle. Native buttons with aria-pressed,
   so it is keyboard operable. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { s } from "./styles";

const MODES = ["columns", "tabs"] as const;

export function ModeSwitch({
  value,
  onChange,
}: {
  value: "columns" | "tabs";
  onChange: (v: "columns" | "tabs") => void;
}) {
  const t = useTranslations("runs");
  return (
    <div role="group" aria-label={t("results.modeLabel")} style={s.group}>
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={value === m}
          style={s.btn(value === m)}
          onClick={() => onChange(m)}
        >
          {t(`page.view.${m}`)}
        </button>
      ))}
    </div>
  );
}
