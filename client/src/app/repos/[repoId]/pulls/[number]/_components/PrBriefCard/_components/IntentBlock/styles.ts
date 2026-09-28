import type { CSSProperties } from "react";

/** Co-located styles for IntentBlock. */
export const s = {
  intentText: {
    fontSize: 14,
    lineHeight: 1.55,
    color: "var(--text-primary)",
    margin: "4px 0 10px",
  } satisfies CSSProperties,
  confidenceRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  confidenceReason: {
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  scopeGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    marginBottom: 14,
  } satisfies CSSProperties,
  scopeLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,
  scopeNone: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  scopeList: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.6,
  } satisfies CSSProperties,
  sourcesRow: {
    marginBottom: 12,
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
  chipUnavailable: {
    display: "inline-flex",
    fontSize: 12,
    padding: "3px 8px",
    borderRadius: 5,
    background: "var(--crit-bg)",
    color: "var(--crit)",
    border: "1px solid var(--crit)",
  } satisfies CSSProperties,
  footer: {
    display: "flex",
    gap: 14,
    fontSize: 12,
    color: "var(--text-muted)",
    paddingTop: 10,
    borderTop: "1px solid var(--border)",
    flexWrap: "wrap",
  } satisfies CSSProperties,
} as const;
