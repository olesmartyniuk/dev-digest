import type { SeverityCounts } from "@devdigest/shared";

/** Display order of the severity count badges, worst first. */
export const SEVERITY_DISPLAY_ORDER = [
  "CRITICAL",
  "WARNING",
  "SUGGESTION",
] as const satisfies readonly (keyof SeverityCounts)[];

/** Rationale is clamped to this many lines in the popover. */
export const RATIONALE_CLAMP_LINES = 3;
