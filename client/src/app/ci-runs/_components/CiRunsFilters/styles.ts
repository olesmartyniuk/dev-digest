import type { CSSProperties } from "react";

/** Co-located styles for CiRunsFilters. */
export const s = {
  row: { display: "flex", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  cell: { minWidth: 160 } satisfies CSSProperties,
} as const;
