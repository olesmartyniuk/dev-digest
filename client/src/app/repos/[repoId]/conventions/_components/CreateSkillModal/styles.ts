import type { CSSProperties } from "react";

/** Co-located styles for the "Create skill from conventions" modal. */
export const s = {
  body: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  notice: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: "10px 14px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--accent-bg)",
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  row: { display: "flex", gap: 16 } satisfies CSSProperties,
  rowItem: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  agents: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  agentRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 13,
    cursor: "pointer",
  } satisfies CSSProperties,
  agentName: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  agentModel: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  footerNote: { flex: 1, fontSize: 12, color: "var(--text-muted)", alignSelf: "center" } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)" } satisfies CSSProperties,
} as const;
