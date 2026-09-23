import type { SkillType } from "@devdigest/shared";

/** Skill types selectable when creating/editing a skill. Restated as a plain
 *  array (not imported from the zod schema) so this route doesn't pull the
 *  zod runtime into its bundle — see client/INSIGHTS.md. */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Card grid template (responsive auto-fill), same as the Agents list. */
export const CARD_GRID_COLS = "repeat(auto-fill, minmax(240px, 1fr))";
