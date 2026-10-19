import type { CSSProperties } from "react";

/** Co-located styles for AgentSelectList. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  header: { display: "flex", justifyContent: "flex-end" } satisfies CSSProperties,
  linkBtn: {
    background: "none",
    border: "none",
    padding: 0,
    font: "inherit",
    fontSize: 12.5,
    color: "var(--accent)",
    cursor: "pointer",
  } satisfies CSSProperties,
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  desc: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 4, marginLeft: 26 } satisfies CSSProperties,
  est: {
    display: "flex",
    gap: 14,
    fontSize: 12,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
} as const;
