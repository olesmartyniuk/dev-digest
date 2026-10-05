import type { CSSProperties } from "react";

/** Co-located styles for PrBriefCard (the card shell; IntentSection/BriefSection own their own). */
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
  /** Separates the L03 Intent section from the L05 generated-brief section (BriefSection). */
  divider: {
    marginTop: 14,
    paddingTop: 14,
    borderTop: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
} as const;
