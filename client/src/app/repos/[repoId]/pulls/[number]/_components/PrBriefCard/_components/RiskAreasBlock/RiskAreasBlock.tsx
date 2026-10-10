/* RiskAreasBlock — presentational: each risk's severity badge, title, and
   file(s), in the server-sorted order (AC-6a) — no client-side re-sort. */
"use client";

import { useTranslations } from "next-intl";
import { SectionLabel, Badge } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { RISK_SEVERITY_COLOR } from "./constants";
import { s } from "./styles";

export function RiskAreasBlock({ risks }: { risks: Risk[] }) {
  const t = useTranslations("brief");
  return (
    <div>
      <SectionLabel icon="AlertTriangle">{t("block.risks")}</SectionLabel>
      {risks.length === 0 ? (
        <div style={s.empty}>{t("noRisks")}</div>
      ) : (
        <ul style={s.list}>
          {risks.map((r, i) => (
            <li key={i} style={s.item}>
              <Badge color={RISK_SEVERITY_COLOR[r.severity]} bg="var(--bg-hover)">
                {r.severity}
              </Badge>
              <span style={s.title}>{r.title}</span>
              <span className="mono">{r.file_refs.join(", ")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
