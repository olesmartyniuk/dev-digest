/**
 * PR Why + Risk Brief (SPEC-03 / L05) — tunables. No I/O, no imports outside
 * this file: `constants.ts` is domain-layer (see .dependency-cruiser.cjs
 * `no-domain-outward`).
 */

export const BRIEF_PROMPT_FILE = 'risk-brief.system.md';
export const BRIEF_SCHEMA_NAME = 'RiskBrief';

/** The workspace settings key holding per-feature model overrides. */
export const FEATURE_MODELS_SETTING_KEY = 'feature_models';
/** This feature's id inside that setting. */
export const FEATURE_MODEL_ID = 'risk_brief' as const;

/**
 * Wall-clock ceiling for the model pass. Enforced by the caller with
 * `withTimeout`, NOT by the provider: OpenRouterProvider fixes its HTTP
 * timeout at construction and ignores `StructuredRequest.timeoutMs`
 * (`server/INSIGHTS.md` 2026-09-23), so an inline request needs its own cap.
 */
export const BRIEF_TIMEOUT_MS = 120_000;
/** Reprompt attempts when the model's JSON fails the schema. */
export const BRIEF_MAX_REPAIRS = 1;
export const BRIEF_MAX_TOKENS = 3_000;
export const BRIEF_TEMPERATURE = 0.2;

/** Caps applied AFTER the model responds (AC-6a/AC-7), not prompted limits the model could ignore. */
export const BRIEF_MAX_RISKS = 6;
export const BRIEF_MAX_FOCUS = 8;

export const MAX_DESCRIPTION_CHARS = 4_000;
export const MAX_INTENT_ITEMS = 8;

export const MAX_FILES_IN_PROMPT = 300;
export const MAX_CALLERS_IN_PROMPT = 200;

/** AC-6a severity sort order — lower sorts first. */
export const RISK_SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;
