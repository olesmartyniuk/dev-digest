import type { CSSProperties } from "react";

export const s = {
  body: { paddingTop: 12 } satisfies CSSProperties,
  source: {
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  } satisfies CSSProperties,
} as const;
