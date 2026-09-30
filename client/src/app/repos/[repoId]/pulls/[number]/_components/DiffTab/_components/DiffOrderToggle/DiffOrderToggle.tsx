"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { DiffOrder } from "../../constants";

/** Smart/Original order toggle for the "Files changed" tab. `Button.active`
 *  already gives the segmented look — no new vendored primitive needed. */
export function DiffOrderToggle({
  value,
  onChange,
}: {
  value: DiffOrder;
  onChange: (o: DiffOrder) => void;
}) {
  const t = useTranslations("prReview");

  return (
    <div role="group" aria-label={t("smartDiff.orderLabel")} style={{ display: "flex", gap: 4 }}>
      <Button
        kind="ghost"
        size="sm"
        active={value === "smart"}
        aria-pressed={value === "smart"}
        onClick={() => onChange("smart")}
      >
        {t("smartDiff.smartOrder")}
      </Button>
      <Button
        kind="ghost"
        size="sm"
        active={value === "original"}
        aria-pressed={value === "original"}
        onClick={() => onChange("original")}
      >
        {t("smartDiff.originalOrder")}
      </Button>
    </div>
  );
}
