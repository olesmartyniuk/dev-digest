import type { CSSProperties } from "react";

/** Co-located styles for BlastRadiusBlock + its SymbolImpactRow child. */
export const s = {
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
  statsLine: {
    fontSize: 13,
    color: "var(--text-secondary)",
    marginBottom: 10,
  } satisfies CSSProperties,
  degradedNotice: {
    marginBottom: 12,
    padding: "8px 12px",
    borderRadius: 6,
    background: "var(--bg-hover)",
    border: "1px solid var(--border)",
    fontSize: 13,
  } satisfies CSSProperties,
  degradedTitle: {
    fontWeight: 700,
    color: "var(--warn)",
    marginBottom: 2,
  } satisfies CSSProperties,
  emptyText: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  resultsList: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    listStyle: "none",
    margin: 0,
    padding: 0,
  } satisfies CSSProperties,
  rowCard: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 12,
  } satisfies CSSProperties,
  symbolHeader: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 8,
  } satisfies CSSProperties,
  symbolName: {
    fontSize: 13,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  callerCount: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  callerList: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.6,
  } satisfies CSSProperties,
  factsLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginTop: 8,
    marginBottom: 4,
  } satisfies CSSProperties,
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  } satisfies CSSProperties,
  chip: {
    display: "inline-flex",
    fontSize: 12,
    padding: "3px 8px",
    borderRadius: 5,
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
