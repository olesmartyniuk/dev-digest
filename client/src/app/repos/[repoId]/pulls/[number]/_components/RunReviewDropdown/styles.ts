import type { CSSProperties } from "react";

/** Co-located styles for RunReviewDropdown (the agent-picker popover). */
export const s = {
  // Popover supplies the real <button>; the trigger must be inert content, so
  // this mimics a Button without nesting one.
  trigger: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "5px 9px",
    fontSize: 12.5,
    fontWeight: 500,
    borderRadius: 6,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
  },
  triggerPrimary: {
    background: "var(--accent)",
    color: "#fff",
    border: "1px solid var(--accent)",
  },
  triggerSecondary: {
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-strong)",
  },
  panel: { display: "flex", flexDirection: "column", gap: 10 },
  title: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
  },
  warning: { fontSize: 12, color: "var(--warn)" },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  estimate: { fontSize: 12, color: "var(--text-muted)", flexShrink: 0 },
  footer: { display: "flex", flexDirection: "column", gap: 8 },
  linkBtn: {
    background: "none",
    border: "none",
    padding: 0,
    font: "inherit",
    fontSize: 12.5,
    color: "var(--accent)",
    cursor: "pointer",
    textAlign: "left",
  },
  emptyText: { fontSize: 13, color: "var(--text-secondary)" },
} satisfies Record<string, CSSProperties>;
