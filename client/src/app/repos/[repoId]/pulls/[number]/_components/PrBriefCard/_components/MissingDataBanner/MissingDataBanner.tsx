/* MissingDataBanner — the ONE top-of-card banner naming every data source the
   cached brief was generated without (AC-5), instead of a per-block message. */
"use client";

import { useTranslations } from "next-intl";
import type { BriefMissingSource } from "@devdigest/shared";
import { s } from "./styles";

export function MissingDataBanner({ sources }: { sources: BriefMissingSource[] }) {
  const t = useTranslations("brief");
  return (
    <div role="status" style={s.banner}>
      {t("missing.banner", { sources: sources.map((x) => t(`missing.${x}`)).join(", ") })}
    </div>
  );
}
