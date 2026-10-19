import type { CSSProperties } from "react";

/** Co-located styles for DisagreementBlock. */
export const s = {
  wrap: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" } satisfies CSSProperties,
  title: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  toggle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  row: { display: "flex", flexDirection: "column", gap: 6, paddingTop: 10, borderTop: "1px solid var(--border)" } satisfies CSSProperties,
  loc: { fontSize: 12.5, fontFamily: "var(--font-mono, monospace)", color: "var(--text-muted)" } satisfies CSSProperties,
  rowTitle: { fontSize: 13, fontWeight: 500 } satisfies CSSProperties,
  takes: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  take: { display: "flex", alignItems: "center", gap: 8, fontSize: 13 } satisfies CSSProperties,
  reason: { color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
