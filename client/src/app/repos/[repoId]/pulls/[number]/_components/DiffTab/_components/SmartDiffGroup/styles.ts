import type { CSSProperties } from "react";

/** Co-located styles for the Smart Diff role group header. */
export const s = {
  group: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "8px 4px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  filesCount: { fontSize: 12, fontWeight: 400, color: "var(--text-muted)" } satisfies CSSProperties,
  findingsStat: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    fontWeight: 400,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  dot: { display: "inline-block", width: 8, height: 8, borderRadius: 99, flexShrink: 0 } satisfies CSSProperties,
  files: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
} as const;

/** Chevron rotates 90deg when the group is open (same convention as FileCard). */
export function chevronFor(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  };
}
