import type { CSSProperties } from "react";

/** Co-located styles for DocViewer. */
export const s = {
  wrap: { border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" } satisfies CSSProperties,
  body: { padding: 20, maxHeight: "70vh", overflow: "auto" } satisfies CSSProperties,
  hint: { fontSize: 13.5, color: "var(--text-muted)", padding: "40px 20px", textAlign: "center" } satisfies CSSProperties,
  source: {
    margin: 0,
    fontFamily: "var(--font-mono)",
    fontSize: 12.5,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  } satisfies CSSProperties,
} as const;
