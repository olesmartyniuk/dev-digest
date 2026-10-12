import type { CSSProperties } from "react";

/** Co-located styles for the /eval (all agents) page. */
export const s = {
  page: { padding: 28, display: "flex", flexDirection: "column", gap: 28, maxWidth: 1100 } satisfies CSSProperties,
  title: { fontSize: 20, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 } satisfies CSSProperties,
  sectionLabel: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    marginBottom: 10,
  } satisfies CSSProperties,
} as const;
