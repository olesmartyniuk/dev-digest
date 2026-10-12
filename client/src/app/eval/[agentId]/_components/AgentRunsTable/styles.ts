import type { CSSProperties } from "react";

/** Co-located styles for AgentRunsTable. */
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
  tag: { marginLeft: 8 } satisfies CSSProperties,
} as const;
