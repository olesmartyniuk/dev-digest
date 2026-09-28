import type { SmartDiffRole } from "@devdigest/shared";

/** The "Files changed" tab's file order: Smart (grouped by role) or Original
 *  (GitHub order). Held in the URL (`?order=`), see `usePrDetail`. */
export type DiffOrder = "smart" | "original";

/** `prReview.smartDiff.<x>Label` translation key per role. */
export const ROLE_LABEL_KEY = {
  core: "smartDiff.coreLabel",
  tests: "smartDiff.testsLabel",
  wiring: "smartDiff.wiringLabel",
  docs: "smartDiff.docsLabel",
  boilerplate: "smartDiff.boilerplateLabel",
} as const satisfies Record<SmartDiffRole, string>;

/** Roles that start collapsed in the Smart Diff grouped view. */
export const DEFAULT_COLLAPSED_ROLES: ReadonlySet<SmartDiffRole> = new Set(["docs", "boilerplate"]);
