import type { CSSProperties } from "react";

/** Co-located styles for ContextTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, marginBottom: 6 } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 14px" } satisfies CSSProperties,
} as const;
