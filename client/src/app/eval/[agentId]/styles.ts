import type { CSSProperties } from "react";

/** Co-located styles for the /eval/[agentId] page. */
export const s = {
  page: { padding: 28, display: "flex", flexDirection: "column", gap: 22, maxWidth: 1100 } satisfies CSSProperties,
  topRow: { display: "flex", alignItems: "center", gap: 14 } satisfies CSSProperties,
  back: { fontSize: 13, color: "var(--accent)", textDecoration: "none" } satisfies CSSProperties,
  switcher: { width: 220 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  title: { fontSize: 20, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  sectionLabel: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    marginBottom: 10,
  } satisfies CSSProperties,
  tableHeader: { display: "flex", alignItems: "center", gap: 12, marginBottom: 10 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
