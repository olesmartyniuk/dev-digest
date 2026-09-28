import type { CSSProperties } from "react";

/** Co-located layout styles for the Skills Lab route (master-detail). */
export const s = {
  // 52px is the app-shell header.
  page: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  listPane: {
    width: 320,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
    minHeight: 0,
  } satisfies CSSProperties,
  listHeader: { padding: "16px 16px 12px" } satisfies CSSProperties,
  listHeaderRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    marginBottom: 4,
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  list: { flex: 1, overflow: "auto", padding: "8px 12px 12px", display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  detailPane: { flex: 1, minWidth: 0, minHeight: 0, overflow: "auto", padding: 28 } satisfies CSSProperties,
} as const;
