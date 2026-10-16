import type { CiPostAs, CiTrigger } from "@devdigest/shared";

/** The four wizard steps, in order (labels under `ci.exportWizard.steps`). */
export const STEP_KEYS = ["target", "preview", "configure", "install"] as const;
export const LAST_STEP = STEP_KEYS.length - 1;

export type TargetKey = "gha" | "circle" | "jenkins" | "cli";

/** Export targets. Only GitHub Actions is built; the rest render disabled. */
export const TARGETS: readonly { key: TargetKey; recommended?: boolean; enabled: boolean }[] = [
  { key: "gha", recommended: true, enabled: true },
  { key: "circle", enabled: false },
  { key: "jenkins", enabled: false },
  { key: "cli", enabled: false },
];

export const DEFAULT_POST_AS: CiPostAs = "github_review";
export const DEFAULT_TRIGGERS: CiTrigger[] = ["opened", "synchronize"];

/** Trigger checkboxes in canonical order (labels: `ci.exportWizard.trigger*`). */
export const TRIGGER_OPTIONS: readonly { value: CiTrigger; labelKey: "triggerOpened" | "triggerSynchronize" | "triggerReopened" }[] = [
  { value: "opened", labelKey: "triggerOpened" },
  { value: "synchronize", labelKey: "triggerSynchronize" },
  { value: "reopened", labelKey: "triggerReopened" },
];

export const POST_AS_OPTIONS: readonly { value: CiPostAs; labelKey: "githubReview" | "prComment" | "none"; recommended?: boolean }[] = [
  { value: "github_review", labelKey: "githubReview", recommended: true },
  { value: "pr_comment", labelKey: "prComment" },
  { value: "none", labelKey: "none" },
];

export const OPENROUTER_KEY_NAME = "OPENROUTER_API_KEY";
export const SETUP_DOCS_URL = "https://docs.github.com/actions";
export const ZIP_FILE_NAME = "devdigest-ci.zip";
/** Server error code for a non-OpenRouter agent. */
export const PROVIDER_UNSUPPORTED_CODE = "ci_provider_unsupported";
