import type { CSSProperties } from "react";

/** Co-located layout styles for the Project Context route. */
export const s = {
  page: { padding: 28, maxWidth: 1200 } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 20,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  title: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  titleRepo: { color: "var(--accent)", fontFamily: "var(--font-mono)" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", marginTop: 6 } satisfies CSSProperties,
  roots: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  headerActions: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  split: { display: "grid", gridTemplateColumns: "320px 1fr", gap: 20, alignItems: "start" } satisfies CSSProperties,
  error: { marginBottom: 16 } satisfies CSSProperties,
} as const;
