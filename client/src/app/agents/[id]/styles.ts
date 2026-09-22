import type { CSSProperties } from "react";

/** Co-located layout styles for the agent editor route. */
export const s = {
  // 52px is the app-shell header.
  page: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  editorPane: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
  } satisfies CSSProperties,
  editorBody: { flex: 1, minHeight: 0, overflow: "auto" } satisfies CSSProperties,
  loadingPane: {
    flex: 1,
    padding: 28,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,
};
