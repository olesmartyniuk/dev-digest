import type { CSSProperties } from "react";

/** Co-located styles for ResultsHeader. */
export const s = {
  wrap: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  title: { fontSize: 20, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  meta: { fontSize: 13, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
} as const;
