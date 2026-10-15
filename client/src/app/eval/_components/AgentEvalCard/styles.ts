import type { CSSProperties } from "react";

/** Co-located styles for AgentEvalCard. */
export const s = {
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 16,
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    textDecoration: "none",
  } satisfies CSSProperties,
  top: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  name: { fontSize: 14.5, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  meta: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  spark: { minHeight: 28 } satisfies CSSProperties,
  metrics: { display: "flex", gap: 18 } satisfies CSSProperties,
  metric: { display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  metricLabel: { fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.04em" } satisfies CSSProperties,
  metricValue: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
} as const;
