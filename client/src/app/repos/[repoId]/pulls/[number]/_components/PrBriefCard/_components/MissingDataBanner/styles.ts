import type { CSSProperties } from "react";

/** Co-located styles for MissingDataBanner — warn-coloured, per plan. */
export const s = {
  banner: {
    fontSize: 13,
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid var(--warn)",
    color: "var(--warn)",
    background: "var(--bg-hover)",
  } satisfies CSSProperties,
} as const;
