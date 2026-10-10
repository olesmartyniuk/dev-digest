import type { OnboardingSectionKind } from "@devdigest/shared";

/**
 * Constants for the Onboarding Tour route. `SECTION_ORDER` is a type-only
 * import of `OnboardingSectionKind` — never the zod value — so this module
 * never pulls zod's runtime into the client bundle (`client/INSIGHTS.md`
 * 2026-09-22).
 */
export const SECTION_ORDER = [
  "architecture",
  "critical_paths",
  "how_to_run",
  "reading_path",
  "first_tasks",
] as const satisfies readonly OnboardingSectionKind[];

export const FILE_PARAM = "file";
export const VIEWER_MODE_PARAM = "mode";

export type ViewerMode = "preview" | "raw";
export const DEFAULT_VIEWER_MODE: ViewerMode = "preview";
