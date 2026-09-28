import type { CSSProperties } from "react";

/** Co-located styles for AgentDetailHeader (extracted from inline styles). */
export const s = {
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "16px 28px 0",
    flexShrink: 0,
  } satisfies CSSProperties,
  icon: { color: "var(--accent)" } satisfies CSSProperties,
  name: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  actions: { marginLeft: "auto" } satisfies CSSProperties,
};
