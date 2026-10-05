/**
 * Onboarding Tour (SPEC-02 / L05) — tunables. No I/O, no imports outside this
 * file: `constants.ts` is domain-layer (see .dependency-cruiser.cjs `no-domain-outward`).
 */

export const ONBOARDING_PROMPT_FILE = 'onboarding.system.md';
export const ONBOARDING_SCHEMA_NAME = 'OnboardingTour';
export const ONBOARDING_LANGUAGE = 'English';

/** The workspace settings key holding per-feature model overrides. */
export const FEATURE_MODELS_SETTING_KEY = 'feature_models';
/** This feature's id inside that setting. */
export const FEATURE_MODEL_ID = 'onboarding' as const;

/** The 5 fixed onboarding sections, in display/generation order. */
export const SECTION_ORDER = [
  'architecture',
  'critical_paths',
  'how_to_run',
  'reading_path',
  'first_tasks',
] as const;

/** Only these section kinds may carry a non-null `diagram`. */
export const DIAGRAM_SECTION_KINDS = ['architecture'] as const;

/** Mirrors the prompt's "up to 4 links" rule. */
export const MAX_LINKS_PER_SECTION = 4;

/** How many top-ranked files (by repo-intel rank) are given to the model. */
export const TOP_FILES_COUNT = 15;

/**
 * Wall-clock ceiling for the model pass. Enforced by the caller with
 * `withTimeout`, NOT by the provider: OpenRouterProvider fixes its HTTP
 * timeout at construction and ignores `StructuredRequest.timeoutMs`
 * (`server/INSIGHTS.md` 2026-09-23), so an inline request needs its own cap.
 */
export const ONBOARDING_TIMEOUT_MS = 120_000;
/** Reprompt attempts when the model's JSON fails the schema. */
export const ONBOARDING_MAX_REPAIRS = 1;
export const ONBOARDING_MAX_TOKENS = 6_000;
export const ONBOARDING_TEMPERATURE = 0.2;

/** `isLimitedData` boundaries (AC-14). */
export const LIMITED_MIN_FILES_INDEXED = 10;
export const LIMITED_MIN_TOP_FILES = 5;

/** A source file above this size is rejected (422), not read, by the viewer. */
export const ONBOARDING_MAX_FILE_BYTES = 1_000_000;

/**
 * The text substituted into the prompt's caller-filled `{{sections}}`
 * placeholder — a numbered list of the 5 kinds in `SECTION_ORDER`, each with
 * its own formatting contract. The prompt file itself is unchanged (spec
 * says don't touch `onboarding.system.md`); this is the per-feature
 * formatting slot it already exposes.
 */
export const SECTIONS_SPEC = `1. architecture — kind: "architecture". An overview body (what the system is, its main pieces, how they talk to each other) plus exactly one mermaid \`diagram\` showing how the pieces connect, and up to 4 links to the key files that define that architecture.
2. critical_paths — kind: "critical_paths". A short intro body (one or two sentences). Each link is ONE critical file from the CRITICAL PATHS or TOP FILES facts; \`label\` is ONE line on why that file matters. Never invent a path not present in those facts. \`diagram\` is always null.
3. how_to_run — kind: "how_to_run". The body MUST contain exactly one fenced code block with one shell command per line, taken ONLY from commands that are literally present in the provided context documents. If no run command can be grounded that way, say so in prose instead and emit NO code block. \`links\` may be empty or point at config/entry files; \`diagram\` is always null.
4. reading_path — kind: "reading_path". Links in the order a newcomer should read them, drawn from TOP FILES; \`label\` is a one-line rationale for reading that file at that point. \`diagram\` is always null.
5. first_tasks — kind: "first_tasks". 3 to 4 links, each a real file or directory from the facts; \`label\` is a short, concrete starter task a newcomer could attempt there. \`diagram\` is always null.

Every section's \`kind\` field must be exactly the snake_case id shown above (e.g. "critical_paths", not "Critical Paths").`;
