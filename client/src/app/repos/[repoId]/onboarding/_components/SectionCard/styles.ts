import type { CSSProperties } from "react";

export const s = {
  card: { padding: 0, overflow: "hidden" } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "14px 18px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
    fontSize: 15,
    fontWeight: 650,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  chevron: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  body: { padding: "0 18px 18px" } satisfies CSSProperties,
} as const;
