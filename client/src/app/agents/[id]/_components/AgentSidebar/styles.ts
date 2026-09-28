import type { CSSProperties } from "react";

/** Co-located styles for AgentSidebar (extracted from inline styles). */
export const s = {
  sidebar: {
    width: 280,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  header: { padding: "16px 16px 12px" } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  list: { flex: 1, overflow: "auto", padding: "0 12px 12px" } satisfies CSSProperties,
};
