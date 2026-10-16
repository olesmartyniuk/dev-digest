import type { CSSProperties } from "react";

/** Co-located styles for the Configure run page. */
export const s = {
  page: { padding: 28, display: "flex", flexDirection: "column", gap: 24, maxWidth: 760 } satisfies CSSProperties,
  title: { fontSize: 20, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  step: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  stepLabel: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  placeholder: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "16px 0",
  } satisfies CSSProperties,
} as const;
