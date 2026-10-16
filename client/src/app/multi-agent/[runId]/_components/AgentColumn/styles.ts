import type { CSSProperties } from "react";

/** Co-located styles for AgentColumn. */
export const s = {
  col: {
    flex: "0 0 320px",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    maxHeight: "70vh",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "12px 14px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  name: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)", display: "flex", gap: 10 } satisfies CSSProperties,
  body: { padding: 12, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  item: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  itemTitle: { fontSize: 13, fontWeight: 500 } satisfies CSSProperties,
  itemLoc: { fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  footer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 14px",
    borderTop: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
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
