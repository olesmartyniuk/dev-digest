/* diff-viewer — unified-diff viewer with optional inline GitHub comments and
   findings. Public surface: the DiffViewer + FileCard components, the
   DiffCommentApi/DiffFindingApi adapter contracts, and the findings helpers
   a grouped (Smart Diff) view needs to compute its own header stats. */
export { DiffViewer } from "./DiffViewer";
export { FileCard } from "./FileCard";
export type { DiffCommentApi } from "./comments";
export type { DiffFindingApi } from "./findings";
export { findingsByPath, worstSeverity } from "./findings";
