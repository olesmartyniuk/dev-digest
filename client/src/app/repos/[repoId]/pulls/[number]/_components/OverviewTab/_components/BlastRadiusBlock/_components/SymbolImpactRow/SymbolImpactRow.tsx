/* SymbolImpactRow — presentational: one changed symbol's callers plus the
   endpoints/crons reachable from them. */
"use client";

import { useTranslations } from "next-intl";
import type { DownstreamImpact } from "@devdigest/shared";
import { callerHref } from "../../helpers";
import { s } from "../../styles";

export function SymbolImpactRow({
  impact,
  repoFullName,
  headSha,
}: {
  impact: DownstreamImpact;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("blast");

  return (
    <li style={s.rowCard}>
      <div style={s.symbolHeader}>
        <span className="mono" style={s.symbolName}>
          {impact.symbol}
        </span>
        <span style={s.callerCount}>{t("callerCount", { count: impact.callers.length })}</span>
      </div>

      <ul style={s.callerList}>
        {impact.callers.map((c) => {
          const href = callerHref(repoFullName, headSha, c.file, c.line);
          const label = `${c.name} — ${c.file}:${c.line}`;
          return (
            <li key={`${c.file}:${c.line}:${c.name}`}>
              {href ? (
                <a
                  className="mono"
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("openCaller", { file: c.file, line: c.line })}
                >
                  {label}
                </a>
              ) : (
                <span className="mono">{label}</span>
              )}
            </li>
          );
        })}
      </ul>

      {impact.endpoints_affected.length > 0 && (
        <>
          <div style={s.factsLabel}>{t("endpointsAffected")}</div>
          <div style={s.chipRow}>
            {impact.endpoints_affected.map((e) => (
              <span key={e} className="mono" style={s.chip}>
                {e}
              </span>
            ))}
          </div>
        </>
      )}

      {impact.crons_affected.length > 0 && (
        <>
          <div style={s.factsLabel}>{t("cronsAffected")}</div>
          <div style={s.chipRow}>
            {impact.crons_affected.map((c) => (
              <span key={c} className="mono" style={s.chip}>
                {c}
              </span>
            ))}
          </div>
        </>
      )}
    </li>
  );
}
