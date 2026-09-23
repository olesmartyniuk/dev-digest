/**
 * Conventions Extractor — tunables. No I/O, no imports outside this file:
 * `constants.ts` is domain-layer (see .dependency-cruiser.cjs `no-domain-outward`).
 */

/** How many top-ranked source files are sampled for the model. */
export const SAMPLE_FILE_COUNT = 12;

/**
 * Per-sample caps. A sample is truncated, never skipped, when it exceeds them.
 *
 * 120 lines, not 160: house style shows itself in a file's opening — imports,
 * the namespace or class header, the first method — and the tail mostly buys
 * input tokens. A 12-file C# scan at this cap produced 14 well-evidenced
 * rules, so the trim costs no measured recall.
 */
export const MAX_SAMPLE_LINES = 120;
export const MAX_SAMPLE_CHARS = 6_000;
export const MAX_CONFIG_CHARS = 2_500;

/**
 * Config files read by the deterministic (no-model) pass, in priority order.
 * Read from the clone root only — a nested package's config belongs to that
 * package, not to the repo's house style.
 */
export const CONFIG_FILES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc',
  'tsconfig.json',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  'prettier.config.js',
  'prettier.config.cjs',
  'biome.json',
  '.editorconfig',
  'package.json',
] as const;

/**
 * Extensions the walker treats as source.
 *
 * Deliberately wider than repo-intel's `SUPPORTED_EXT`: that list bounds what
 * ast-grep can PARSE, while this one bounds what a model can read for house
 * style — which is every language the repo is written in. Template-ish
 * extensions (`.razor`, `.cshtml`, `.vue`, `.svelte`) earn their place because
 * in those stacks most of the UI conventions live there and nowhere else.
 */
export const SOURCE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
  '.py',
  '.go',
  '.rb',
  '.java',
  '.kt',
  '.cs',
  '.razor',
  '.cshtml',
  '.php',
  '.swift',
  '.rs',
] as const;

/** Directories the fallback walker never descends into. */
export const SKIP_DIRECTORIES = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  'coverage',
  'vendor',
  '__pycache__',
  'target',
] as const;

/** MSBuild project files, discovered by pattern because their name varies. */
export const PROJECT_FILE_PATTERN = /\.(csproj|fsproj|vbproj)$|^Directory\.Build\.props$/i;

/** Cap on discovered project files, so a large solution can't flood the pass. */
export const MAX_PROJECT_FILES = 4;

/** Depth limit for the fallback walker, so a monorepo clone can't blow the budget. */
export const WALK_MAX_DEPTH = 6;
/** File-count limit for the fallback walker. */
export const WALK_MAX_FILES = 2_000;

/** A candidate below this confidence is dropped as `low_confidence`. */
export const MIN_CONFIDENCE = 0.4;

/**
 * Hard cap on candidates the model may propose in one extraction.
 *
 * 14 rather than 24: each candidate carries a verbatim snippet, so this is the
 * dominant term in OUTPUT tokens, and 14 is already more than a human will
 * judge one-by-one in a sitting. (It is NOT a latency fix — a scan that timed
 * out at 24 timed out identically at 14; see the model note in INSIGHTS.)
 */
export const MAX_CANDIDATES = 14;

/** Structured-output schema name — also the MockLLMProvider fixture key. */
export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';

export const EXTRACTION_TEMPERATURE = 0.1;
export const EXTRACTION_MAX_TOKENS = 4_000;

/**
 * Wall-clock ceiling for the model pass. Enforced by the caller with
 * `withTimeout`, NOT by the provider: OpenRouterProvider fixes its HTTP
 * timeout at construction and ignores `StructuredRequest.timeoutMs`, so its
 * reprompt loop could otherwise outlast any inline request (observed: a
 * ~70s generation, then a second call still unfinished after 180s).
 */
export const EXTRACTION_TIMEOUT_MS = 120_000;

/**
 * Reprompt attempts when the model's JSON fails the schema. One, not the
 * provider default of two: each repair costs a full generation, and a model
 * that cannot satisfy this schema twice will rarely satisfy it on a third try.
 */
export const EXTRACTION_MAX_REPAIRS = 1;

/** The system-prompt template (see platform/prompts.ts). */
export const EXTRACTION_PROMPT_FILE = 'conventions.system.md';

/**
 * Cheap-model fallback chain, tried in order when the workspace has NOT picked
 * a model for the `conventions` feature in Settings. Extraction is a
 * low-stakes, high-volume-of-input task: the evidence gate downstream is what
 * guarantees quality, so paying flagship prices here buys very little.
 * (`platform/feature-models.ts` documents that conventions keeps its own
 * dynamic default rather than using the static registry one.)
 */
export const CHEAP_MODEL_CHAIN = [
  { secret: 'OPENROUTER_API_KEY', provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' },
  { secret: 'OPENAI_API_KEY', provider: 'openai', model: 'gpt-4o-mini' },
  { secret: 'ANTHROPIC_API_KEY', provider: 'anthropic', model: 'claude-haiku-4-5' },
] as const;

/** The workspace settings key holding per-feature model overrides. */
export const FEATURE_MODELS_SETTING_KEY = 'feature_models';
/** This feature's id inside that setting. */
export const FEATURE_MODEL_ID = 'conventions';

/** Suffix for the generated skill's name: `<repo>-conventions`. */
export const SKILL_NAME_SUFFIX = '-conventions';
/** Every skill produced by this feature is a `convention` skill. */
export const SKILL_TYPE = 'convention';
