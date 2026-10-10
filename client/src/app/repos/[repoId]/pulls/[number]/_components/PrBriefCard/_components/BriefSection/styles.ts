import type { CSSProperties } from "react";

/** Co-located styles for BriefSection (the divider style itself lives on the
 *  parent, `PrBriefCard/styles.ts` — plan). */
export const s = {
  footer: {
    display: "flex",
    gap: 14,
    fontSize: 12,
    color: "var(--text-muted)",
    flexWrap: "wrap",
  } satisfies CSSProperties,
} as const;
