import type { CSSProperties } from "react";

/** Co-located styles for EvalsTab. */
export const s = {
  wrap: { maxWidth: 980, display: "flex", flexDirection: "column", gap: 24 } satisfies CSSProperties,
  headerRow: { display: "flex", alignItems: "flex-start", gap: 12 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  subtitle: { fontSize: 12.5, color: "var(--text-muted)", margin: "4px 0 0" } satisfies CSSProperties,
  link: { fontSize: 13, color: "var(--accent)", textDecoration: "none", whiteSpace: "nowrap" } satisfies CSSProperties,
  casesHeader: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  casesTitle: { fontSize: 15, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  summary: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { marginLeft: "auto", display: "flex", gap: 8 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "20px 0" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", padding: "20px 0" } satisfies CSSProperties,
} as const;
