import type { CSSProperties } from "react";

/** Co-located styles for SkillContextSection. */
export const s = {
  wrap: { maxWidth: 760, marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border)" } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)", margin: "4px 0 14px" } satisfies CSSProperties,
  serializesAs: { marginTop: 16 } satisfies CSSProperties,
  pre: {
    margin: "8px 0 0",
    padding: "12px 14px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    maxHeight: 320,
    overflow: "auto",
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", marginTop: 8 } satisfies CSSProperties,
} as const;
