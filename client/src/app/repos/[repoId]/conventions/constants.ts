import type { ConventionCategory } from "@devdigest/shared";

/** Constants for the Conventions route. */

/** Skeleton cards shown while the stored candidates load. */
export const SKELETON_CARDS = 3;

/** Card height for the loading skeleton (matches a typical card). */
export const SKELETON_CARD_HEIGHT = 190;

/**
 * The category list the edit form offers, restated here rather than derived
 * from the Zod enum: importing a schema VALUE from `@devdigest/shared` would
 * pull the whole zod runtime into this route's bundle. `satisfies` keeps the
 * list checked against the contract with no runtime import.
 */
export const CONVENTION_CATEGORIES = [
  "naming",
  "structure",
  "error_handling",
  "async",
  "typing",
  "imports",
  "testing",
  "api",
  "logging",
  "security",
  "formatting",
] as const satisfies readonly ConventionCategory[];

/** Confidence at or above this reads as strong (green); below `WARN`, muted. */
export const CONFIDENCE_STRONG = 0.85;
export const CONFIDENCE_WARN = 0.65;
