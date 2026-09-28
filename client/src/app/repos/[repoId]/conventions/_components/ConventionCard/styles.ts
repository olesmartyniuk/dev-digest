import type { CSSProperties } from "react";
import type { Convention } from "@devdigest/shared";

/** Co-located styles for a single convention candidate card. */

/** The status stripe: accepted reads as kept, rejected as set aside. */
function accent(status: Convention["status"]): string {
  if (status === "accepted") return "var(--ok)";
  if (status === "rejected") return "var(--border-strong)";
  return "var(--accent)";
}

export const s = {
  card: (status: Convention["status"]): CSSProperties => ({
    display: "flex",
    gap: 16,
    padding: 16,
    borderRadius: 8,
    border: "1px solid var(--border)",
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: accent(status),
    background: "var(--bg-elevated)",
    opacity: status === "rejected" ? 0.55 : 1,
    transition: "opacity .12s, border-color .12s",
  }),
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  badges: { display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" } satisfies CSSProperties,
  rule: {
    fontSize: 15,
    fontWeight: 600,
    fontStyle: "italic",
    lineHeight: 1.45,
    marginBottom: 10,
  } satisfies CSSProperties,
  rationale: { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 10 } satisfies CSSProperties,
  evidence: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--bg-primary)",
    overflow: "hidden",
  } satisfies CSSProperties,
  evidenceHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderBottom: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  evidencePath: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  snippet: {
    margin: 0,
    padding: "10px 12px",
    fontSize: 12.5,
    lineHeight: 1.6,
    overflowX: "auto",
    whiteSpace: "pre",
  } satisfies CSSProperties,
  confidenceRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  confidenceBar: { width: 140 } satisfies CSSProperties,
  actions: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    width: 150,
    flexShrink: 0,
  } satisfies CSSProperties,
  editRow: { display: "flex", gap: 8, marginTop: 10 } satisfies CSSProperties,
  editFields: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 10 } satisfies CSSProperties,
} as const;
