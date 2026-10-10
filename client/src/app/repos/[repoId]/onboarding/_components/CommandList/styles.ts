import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 6,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  code: { flex: 1, minWidth: 0, fontFamily: "var(--font-mono)", fontSize: 13, overflowX: "auto" } satisfies CSSProperties,
} as const;
