import type { CSSProperties } from "react";

/** Co-located styles for AgentSummaryCard. */
export const s = {
  card: {
    display: "flex",
    gap: 16,
    alignItems: "flex-start",
    padding: 16,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0, fontSize: 13.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  meta: { display: "flex", gap: 12, alignItems: "center", fontSize: 12, color: "var(--text-muted)", marginTop: 8 } satisfies CSSProperties,
  linkBtn: {
    background: "none",
    border: "none",
    padding: 0,
    font: "inherit",
    fontSize: 12.5,
    color: "var(--accent)",
    cursor: "pointer",
  } satisfies CSSProperties,
} as const;
