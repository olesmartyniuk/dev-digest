import type { CSSProperties } from "react";

/** Co-located styles for the /ci-runs page. */
export const s = {
  page: { padding: 28, display: "flex", flexDirection: "column", gap: 18, maxWidth: 1200 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "flex-start", gap: 16 } satisfies CSSProperties,
  headText: { flex: 1 } satisfies CSSProperties,
  title: { fontSize: 20, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" } satisfies CSSProperties,
  warning: {
    padding: "10px 14px",
    borderRadius: 8,
    fontSize: 13,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
} as const;
