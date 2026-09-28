import type { CSSProperties } from "react";

/** Co-located styles for ImportSkillDrawer. */
export const s = {
  footer: { display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)", marginRight: "auto" } satisfies CSSProperties,
  preview: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: "10px 14px",
    background: "var(--bg-elevated)",
    maxHeight: 260,
    overflow: "auto",
    fontSize: 13,
  } satisfies CSSProperties,
} as const;
