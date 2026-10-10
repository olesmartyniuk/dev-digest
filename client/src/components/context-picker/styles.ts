import type { CSSProperties } from "react";

/** Co-located styles for ContextPicker. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 } satisfies CSSProperties,
  headerCount: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  headerMuted: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,

  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    margin: "4px 0 2px",
  } satisfies CSSProperties,

  inheritedGroup: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  inheritedRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 6,
    background: "var(--bg-elevated)",
    fontSize: 13,
  } satisfies CSSProperties,
  inheritedRowDisabled: { opacity: 0.55 } satisfies CSSProperties,
  inheritedPath: { fontFamily: "var(--font-mono)", fontSize: 12.5, flex: 1 } satisfies CSSProperties,
  inheritedBadge: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,

  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  rowPath: {
    fontFamily: "var(--font-mono)",
    fontSize: 12.5,
    flex: 1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  rowActions: { display: "flex", gap: 2 } satisfies CSSProperties,

  docCell: { display: "flex", flexDirection: "column", gap: 1, flex: 1, minWidth: 0 } satisfies CSSProperties,
  docName: {
    fontSize: 13.5,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  docPath: {
    fontFamily: "var(--font-mono)",
    fontSize: 11.5,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  docUsedBy: { fontSize: 11.5, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
} as const;
