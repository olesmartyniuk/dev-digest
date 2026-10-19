import type { CSSProperties } from "react";

/** Co-located styles for the multi-agent results page. */
export const s = {
  page: { padding: 28, display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
} as const;
