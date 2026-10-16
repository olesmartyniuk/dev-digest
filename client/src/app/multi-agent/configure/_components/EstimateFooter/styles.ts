import type { CSSProperties } from "react";

/** Co-located styles for EstimateFooter. */
export const s = {
  wrap: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: "12px 14px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  stats: { display: "flex", gap: 18, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  btnOnly: { display: "flex", justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
