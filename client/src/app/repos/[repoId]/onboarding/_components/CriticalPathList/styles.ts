import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 6,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  textWrap: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  path: { fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-primary)" } satisfies CSSProperties,
  label: { fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2 } satisfies CSSProperties,
} as const;
