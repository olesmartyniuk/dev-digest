/**
 * PR Intent (L03) — tunables + detection regexes. No I/O, no imports outside
 * this file: domain layer (`no-domain-outward`, see .dependency-cruiser.cjs).
 */

/** This feature's id in the `FEATURE_MODELS` registry / Settings picker. */
export const FEATURE_MODEL_ID = 'review_intent';
/** The workspace settings key holding per-feature model overrides (same value
 *  as `conventions/constants.ts`'s `FEATURE_MODELS_SETTING_KEY`). */
export const FEATURE_MODELS_SETTING_KEY = 'feature_models';

/** Structured-output schema name — also the MockLLMProvider fixture key. */
export const INTENT_SCHEMA_NAME = 'IntentClassification';

export const INTENT_PROMPT_FILE = 'intent.system.md';
export const INTENT_TEMPERATURE = 0;
export const INTENT_MAX_TOKENS = 800;
export const INTENT_TIMEOUT_MS = 45_000;
export const INTENT_MAX_REPAIRS = 1;

// ---- Budgets ---------------------------------------------------------------

export const MAX_DESCRIPTION_CHARS = 4_000;
/** Non-whitespace chars below which the description counts as empty. */
export const MIN_DESCRIPTION_CHARS = 20;
export const MAX_ISSUE_BODY_CHARS = 3_000;
export const MAX_REFERENCES = 8;
export const MAX_RESOLVED_DOCS = 3;
export const MAX_DOC_CHARS = 6_000;
export const MAX_DOCS_TOTAL_CHARS = 12_000;
export const MAX_FILES = 150;
export const MAX_HEADERS_PER_FILE = 15;
export const MAX_HEADER_CHARS = 160;
export const MAX_REF_CHARS = 200;

// ---- Detection regexes ------------------------------------------------------
// Exact rules — do not improvise on these.

/** Mirrors `adapters/github/octokit.ts`'s linked-issue regex on purpose, so
 *  the intent card and the PR-detail `linked_issue` agree. */
export const LINKED_ISSUE_RE = /(?:closes|fixes|resolves)?\s*#(\d+)/i;

/** Every URL, scanned FIRST. Matched spans are blanked out before the repo-doc
 *  path scan runs. */
export const URL_RE = /https?:\/\/[^\s)\]>"'`]+/gi;

/** A same-repo GitHub blob URL. Groups: owner, name, ref (single segment
 *  only — a branch name containing `/` fails to resolve, which is accepted). */
export const GITHUB_BLOB_RE =
  /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/blob\/([\w.-]+)\/(.+?)(?:[#?].*)?$/i;

/** Only document files ever count as plan/spec sources. */
export const DOC_EXT_RE = /\.(?:md|mdx|markdown|txt|rst|adoc)$/i;

/** Repo-relative doc paths, e.g. `docs/plans/x.md`, `server/specs/api-contract.md`. */
export const REPO_DOC_PATH_RE =
  /(?<![\w./-])((?:[\w-]+\/)*(?:docs|specs?|plans?|rfcs?|adrs?|design)\/(?:[\w.-]+\/)*[\w.-]+\.(?:md|mdx|markdown|txt|rst|adoc))(?![\w/-])/gi;

/** When it matches, the source kind is 'spec'; otherwise 'plan'. */
export const SPEC_HINT_RE = /(?:^|\/)specs?\/|spec/i;

export const EXTERNAL_DOC_HOSTS = [
  'atlassian.net',
  'atlassian.com',
  'notion.so',
  'notion.site',
  'docs.google.com',
  'drive.google.com',
  'linear.app',
  'sharepoint.com',
  'quip.com',
  'coda.io',
  'dropbox.com',
  'clickup.com',
  'asana.com',
  'monday.com',
  'youtrack.cloud',
] as const;

/** A URL on ANY host matching this also counts as a referenced, unfetchable source. */
export const EXTERNAL_DOC_PATH_RE = /(plan|spec|rfc|design|prd|adr|ticket|issue|browse\/[A-Z][A-Z0-9]+-\d+)/i;

/** Bare "Jira: ABC-123"-style keys. Requires the keyword, so `UTF-8` never matches. */
export const TICKET_KEY_RE = /\b(?:jira|ticket|issue)\s*[:#]?\s*([A-Z][A-Z0-9]{1,9}-\d{1,6})\b/gi;

export const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@.*$/;
export const DIFF_GIT_RE = /^diff --git a\/(.+?) b\/(.+)$/;
export const SAFE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
