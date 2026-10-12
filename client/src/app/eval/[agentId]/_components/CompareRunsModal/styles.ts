import type { CSSProperties } from "react";

const DIFF_BG = { add: "var(--ok-bg)", del: "var(--crit-bg)", same: "transparent" } as const;

/** Co-located styles for CompareRunsModal. */
export const s = {
  body: { padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 } satisfies CSSProperties,
  notice: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  warning: { fontSize: 13, color: "var(--warn)" } satisfies CSSProperties,
  error: { padding: 24, fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  metrics: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  metricRow: {
    display: "grid",
    gridTemplateColumns: "120px 1fr 110px",
    alignItems: "center",
    gap: 12,
    fontSize: 14,
  } satisfies CSSProperties,
  label: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.04em" } satisfies CSSProperties,
  values: { fontWeight: 600 } satisfies CSSProperties,
  delta: (direction: 1 | -1 | 0): CSSProperties => ({
    fontWeight: 600,
    textAlign: "right",
    color: direction > 0 ? "var(--ok)" : direction < 0 ? "var(--crit)" : "var(--text-muted)",
  }),
  diffLabel: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.04em", marginBottom: 6 } satisfies CSSProperties,
  diff: {
    margin: 0,
    padding: 10,
    maxHeight: 280,
    overflow: "auto",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 12,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
  } satisfies CSSProperties,
  diffLine: (kind: "same" | "add" | "del"): CSSProperties => ({ background: DIFF_BG[kind] }),
} as const;
