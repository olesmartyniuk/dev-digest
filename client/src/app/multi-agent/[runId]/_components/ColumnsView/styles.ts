import type { CSSProperties } from "react";

/** Co-located styles for ColumnsView. */
export const s = {
  row: { display: "flex", gap: 14, overflowX: "auto", alignItems: "flex-start", paddingBottom: 8 } satisfies CSSProperties,
} as const;
