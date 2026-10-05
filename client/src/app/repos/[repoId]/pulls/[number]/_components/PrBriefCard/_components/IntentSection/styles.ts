import type { CSSProperties } from "react";

/** Co-located styles for IntentSection (moved from PrBriefCard/styles.ts, plan D6). */
export const s = {
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
