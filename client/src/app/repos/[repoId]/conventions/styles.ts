import type { CSSProperties } from "react";

/** Co-located layout styles for the Conventions route. */
export const s = {
  page: { padding: 28, maxWidth: 1080 } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 20,
  } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  title: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  titleRepo: { color: "var(--accent)", fontFamily: "var(--font-mono)" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", marginTop: 6 } satisfies CSSProperties,
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  toolbarCount: { fontSize: 13, color: "var(--text-muted)", flex: 1 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  summary: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 12,
    color: "var(--text-muted)",
    marginBottom: 16,
  } satisfies CSSProperties,
  summaryStrong: { color: "var(--text-primary)", fontWeight: 600 } satisfies CSSProperties,
  summaryDrops: { display: "flex", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  degraded: {
    fontSize: 12,
    color: "var(--warn)",
    marginTop: -8,
    marginBottom: 16,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  error: { marginBottom: 16 } satisfies CSSProperties,
} as const;
