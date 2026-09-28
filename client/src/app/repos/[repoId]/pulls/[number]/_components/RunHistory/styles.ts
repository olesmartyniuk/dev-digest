import type { CSSProperties } from "react";

/** Co-located styles for the PR timeline (extracted from inline styles). */
export const s = {
  timeline: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,

  runRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    textAlign: "left",
  } satisfies CSSProperties,
  runMain: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    flex: 1,
    minWidth: 0,
  } satisfies CSSProperties,
  runTitle: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  runModel: { fontSize: 12, fontWeight: 400, color: "var(--text-muted)" } satisfies CSSProperties,
  runError: {
    fontSize: 12,
    color: "var(--crit)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  runMeta: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  runAside: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 2,
    fontSize: 11,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,

  iconBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
    borderRadius: 5,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-muted)",
    cursor: "pointer",
    flexShrink: 0,
  } satisfies CSSProperties,
  deleteBtn: {
    display: "inline-flex",
    padding: 3,
    borderRadius: 5,
    color: "var(--text-muted)",
    flexShrink: 0,
    cursor: "pointer",
  } satisfies CSSProperties,

  // Commits are markers, not actions — lighter (dashed, transparent) so they
  // read as separators between the runs they sit chronologically between.
  commitRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "8px 14px",
    borderRadius: 8,
    border: "1px dashed var(--border)",
    background: "transparent",
  } satisfies CSSProperties,
  commitIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  commitSha: {
    fontSize: 12,
    color: "var(--text-secondary)",
    flexShrink: 0,
  } satisfies CSSProperties,
  commitMessage: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  commitMuted: { fontSize: 11, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,

  /** The agent name doubles as the "jump to this run's review" control. */
  agentNameButton: (clickable: boolean): CSSProperties => ({
    background: "none",
    border: "none",
    padding: 0,
    font: "inherit",
    fontWeight: 600,
    color: "var(--text-primary)",
    cursor: clickable ? "pointer" : "default",
    textDecoration: clickable ? "underline" : "none",
    textDecorationStyle: "dotted",
    textUnderlineOffset: 3,
  }),
};
