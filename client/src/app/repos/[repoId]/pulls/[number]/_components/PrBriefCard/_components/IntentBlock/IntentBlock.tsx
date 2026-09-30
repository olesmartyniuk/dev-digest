/* IntentBlock — presentational: the derived intent text, confidence,
   in/out-of-scope lists, sources, and a model/cost/classified_at footer.
   `ref` strings render as TEXT ONLY, never as `<a href>` — they come from
   author-controlled PR text. */
"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { IntentSource, IntentSourceKind, PrIntentView } from "@devdigest/shared";
import { formatCostUsd } from "@/lib/format";
import { s } from "./styles";

const CONFIDENCE_COLOR: Record<PrIntentView["confidence"], string> = {
  high: "var(--ok)",
  medium: "var(--warn)",
  low: "var(--crit)",
};

const SOURCE_KIND_LABEL: Record<IntentSourceKind, string> = {
  title: "title",
  description: "description",
  linked_issue: "issue",
  plan: "plan",
  spec: "spec",
  hunk_headers: "hunk headers",
};

const SOURCE_STATUS_GLYPH: Record<IntentSource["status"], string> = {
  used: "✓",
  empty: "·",
  unavailable: "✗",
  skipped: "…",
};

export function IntentBlock({ intent }: { intent: PrIntentView }) {
  const t = useTranslations("brief");
  const unavailable = intent.sources.filter((src) => src.status === "unavailable");

  return (
    <div>
      <p style={s.intentText}>{intent.intent}</p>

      <div style={s.confidenceRow}>
        <Badge color={CONFIDENCE_COLOR[intent.confidence]} bg="var(--bg-hover)">
          {t(`intent.confidence.${intent.confidence}`)}
        </Badge>
        {intent.confidence_reason && (
          <span style={s.confidenceReason}>{intent.confidence_reason}</span>
        )}
      </div>

      <div style={s.scopeGrid}>
        <div>
          <div style={s.scopeLabel}>{t("intent.inScope")}</div>
          {intent.in_scope.length === 0 ? (
            <span style={s.scopeNone}>{t("intent.none")}</span>
          ) : (
            <ul style={s.scopeList}>
              {intent.in_scope.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div style={s.scopeLabel}>{t("intent.outOfScope")}</div>
          {intent.out_of_scope.length === 0 ? (
            <span style={s.scopeNone}>{t("intent.none")}</span>
          ) : (
            <ul style={s.scopeList}>
              {intent.out_of_scope.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div style={s.sourcesRow}>
        <div style={s.scopeLabel}>{t("intent.sources")}</div>
        <div style={s.chipRow}>
          {intent.sources.map((src, i) => (
            <span
              key={i}
              title={src.status === "unavailable" ? (src.note ?? undefined) : undefined}
              style={src.status === "unavailable" ? s.chipUnavailable : s.chip}
            >
              {SOURCE_STATUS_GLYPH[src.status]} {SOURCE_KIND_LABEL[src.kind]}
              {src.ref ? ` ${src.ref}` : ""}
            </span>
          ))}
        </div>
      </div>

      {unavailable.length > 0 && (
        <div style={s.sourcesRow}>
          <div style={s.scopeLabel}>{t("intent.missingContext")}</div>
          <div style={s.chipRow}>
            {unavailable.map((src, i) => (
              <span key={i} title={src.note ?? undefined} style={s.chipUnavailable}>
                {SOURCE_STATUS_GLYPH[src.status]} {SOURCE_KIND_LABEL[src.kind]}
                {src.ref ? ` ${src.ref}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={s.footer}>
        <span className="mono">{intent.model ?? "—"}</span>
        <span>{formatCostUsd(intent.cost_usd)}</span>
        <span>{new Date(intent.classified_at).toLocaleString()}</span>
      </div>
    </div>
  );
}
