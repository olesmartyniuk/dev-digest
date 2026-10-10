import type { CSSProperties } from "react";

/** Co-located styles for DocList. */
export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 6,
    maxHeight: "70vh",
    overflow: "auto",
  } satisfies CSSProperties,
  row: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "8px 10px",
    borderRadius: 6,
    cursor: "pointer",
    border: "1px solid transparent",
  } satisfies CSSProperties,
  rowActive: {
    background: "var(--bg-hover)",
    borderColor: "var(--border-strong)",
  } satisfies CSSProperties,
  path: {
    fontFamily: "var(--font-mono)",
    fontSize: 12.5,
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  meta: { display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
