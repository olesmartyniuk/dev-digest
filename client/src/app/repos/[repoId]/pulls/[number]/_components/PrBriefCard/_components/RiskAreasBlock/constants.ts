import type { RiskSeverity } from "@devdigest/shared";

/** Risk severity → badge colour. Distinct from `src/lib/severity.ts`, which
 *  keys findings severity in UPPERCASE (`client/INSIGHTS.md` 2026-09-22). */
export const RISK_SEVERITY_COLOR = {
  high: "var(--crit)",
  medium: "var(--warn)",
  low: "var(--ok)",
} as const satisfies Record<RiskSeverity, string>;
