import type { CSSProperties } from "react";

/** Co-located styles for PrBriefCard (the card shell; IntentBlock owns its own). */
export const s = {
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: 18,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  rerunRow: {
    marginTop: 10,
  } satisfies CSSProperties,
  skipped: {
    marginTop: 10,
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  stale: {
    marginTop: 6,
    fontSize: 13,
    color: "var(--warn)",
  } satisfies CSSProperties,
} as const;
