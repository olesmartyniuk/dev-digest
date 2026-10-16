import type { CSSProperties } from "react";

/** Co-located styles for ModeSwitch. */
export const s = {
  group: {
    display: "inline-flex",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    overflow: "hidden",
  } satisfies CSSProperties,
  btn: (on: boolean): CSSProperties => ({
    padding: "5px 12px",
    fontSize: 12.5,
    fontWeight: 500,
    border: "none",
    cursor: "pointer",
    background: on ? "var(--accent)" : "transparent",
    color: on ? "#fff" : "var(--text-secondary)",
  }),
} as const;
