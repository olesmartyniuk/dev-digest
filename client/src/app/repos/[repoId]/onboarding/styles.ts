import type { CSSProperties } from "react";

/** Co-located layout styles for the Onboarding Tour route. */
export const s = {
  page: { padding: 28, maxWidth: 900 } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 20,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  title: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  titleRepo: { color: "var(--accent)", fontFamily: "var(--font-mono)" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", marginTop: 6 } satisfies CSSProperties,
  headerActions: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  error: { marginBottom: 16 } satisfies CSSProperties,
  notice: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: "14px 16px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    marginBottom: 16,
  } satisfies CSSProperties,
  noticeIcon: { color: "var(--text-muted)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  noticeTitle: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  noticeBody: { fontSize: 13, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.5 } satisfies CSSProperties,
  sections: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
} as const;
