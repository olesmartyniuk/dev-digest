import type { CSSProperties } from "react";

/** Co-located styles for SkillDetailPane. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", marginBottom: 16, gap: 10 } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  untrustedNotice: {
    fontSize: 12.5,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn)",
    borderRadius: 7,
    padding: "10px 12px",
    marginBottom: 18,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, marginTop: 10 } satisfies CSSProperties,
} as const;
