import type { CSSProperties } from "react";

/** Co-located styles for EvalCaseEditorModal. */
export const s = {
  body: { padding: "20px 24px", display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  tabs: { marginBottom: 12 } satisfies CSSProperties,
  metaGrid: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  expectedHeader: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  warning: { fontSize: 12.5, color: "var(--warn)", marginTop: 8 } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)", marginTop: 8 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  lastRun: { flex: 1, fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  loading: { padding: 24, fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
