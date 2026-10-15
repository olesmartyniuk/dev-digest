import type { CSSProperties } from "react";

/** Co-located styles for RecentEvalRunsTable. */
export const s = {
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: {
    textAlign: "left",
    padding: "8px 10px",
    fontSize: 11.5,
    fontWeight: 600,
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  td: { padding: "9px 10px", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  link: { color: "var(--text-primary)", fontWeight: 600, textDecoration: "none" } satisfies CSSProperties,
  tag: { marginLeft: 8 } satisfies CSSProperties,
  rate: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  track: { width: 64, height: 6, borderRadius: 3, background: "var(--bg-hover)", overflow: "hidden" } satisfies CSSProperties,
  fill: { height: "100%", borderRadius: 3 } satisfies CSSProperties,
} as const;
