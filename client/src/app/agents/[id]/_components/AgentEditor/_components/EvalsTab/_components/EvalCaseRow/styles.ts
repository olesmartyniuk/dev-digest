import type { CSSProperties } from "react";
import type { EvalCaseView } from "@devdigest/shared";

export const STATUS_COLOR: Record<EvalCaseView["last_run"]["status"], string> = {
  passed: "var(--ok)",
  failed: "var(--crit)",
  errored: "var(--warn)",
  never_run: "var(--text-muted)",
};

/** Co-located styles for EvalCaseRow. */
export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  status: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minWidth: 92,
    fontSize: 12.5,
    fontWeight: 600,
    color,
  }),
  name: {
    fontSize: 13.5,
    fontWeight: 600,
    flex: 1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  detail: { fontSize: 12.5, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  controls: { display: "flex", gap: 2 } satisfies CSSProperties,
} as const;
