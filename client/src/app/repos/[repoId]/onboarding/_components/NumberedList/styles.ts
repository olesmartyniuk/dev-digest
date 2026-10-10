import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  item: { display: "flex", gap: 12, alignItems: "flex-start" } satisfies CSSProperties,
  badge: {
    flexShrink: 0,
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
    display: "grid",
    placeItems: "center",
    fontSize: 12,
    fontWeight: 650,
  } satisfies CSSProperties,
  textWrap: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  primary: { fontFamily: "var(--font-mono)", fontSize: 13.5, color: "var(--text-primary)" } satisfies CSSProperties,
  secondary: { fontSize: 13, color: "var(--text-secondary)", marginTop: 2 } satisfies CSSProperties,
} as const;
