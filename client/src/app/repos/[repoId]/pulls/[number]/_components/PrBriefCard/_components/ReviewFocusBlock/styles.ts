import type { CSSProperties } from "react";

/** Co-located styles for ReviewFocusBlock. */
export const s = {
  list: {
    margin: 0,
    paddingLeft: 18,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 13,
  } satisfies CSSProperties,
  button: {
    background: "none",
    border: "none",
    padding: 0,
    color: "inherit",
    textAlign: "left",
    cursor: "pointer",
    font: "inherit",
  } satisfies CSSProperties,
  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
