import { z } from 'zod';
import { ConventionCategory, type FeatureModelChoice, type Provider } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { renderPrompt } from '../../platform/prompts.js';
import { withTimeout } from '../../platform/resilience.js';
import { renderSamples } from './helpers.js';
import type { CandidateConvention, SampleFile } from './types.js';
import {
  CHEAP_MODEL_CHAIN,
  EXTRACTION_MAX_TOKENS,
  EXTRACTION_PROMPT_FILE,
  EXTRACTION_SCHEMA_NAME,
  EXTRACTION_TEMPERATURE,
  EXTRACTION_TIMEOUT_MS,
  EXTRACTION_MAX_REPAIRS,
  MAX_CANDIDATES,
  SOURCE_EXTENSIONS,
  WALK_MAX_DEPTH,
} from './constants.js';

/**
 * The model pass: one structured call that PROPOSES conventions. It proposes
 * only — `verifyCandidates` in helpers.ts decides what is real.
 */

/**
 * The model's output contract, and (via `toJsonSchema` inside each provider)
 * the JSON Schema it is constrained to. Every field is required: strict
 * `json_schema` mode does not honour optionals, and a missing rationale is
 * better expressed as an empty string than as a schema the provider rejects.
 */
export const ConventionDraftSchema = z.object({
  category: ConventionCategory,
  rule: z.string(),
  rationale: z.string(),
  evidence_path: z.string(),
  evidence_line: z.number().int(),
  evidence_snippet: z.string(),
  confidence: z.number(),
});

export const ConventionExtractionSchema = z.object({
  conventions: z.array(ConventionDraftSchema),
});
export type ConventionExtraction = z.infer<typeof ConventionExtractionSchema>;

export interface ModelPassResult {
  candidates: CandidateConvention[];
  /** The model that answered, or `null` when the pass did not run. */
  model: string | null;
  /** Why it did not run, when `model` is null. */
  skipped: string | null;
  costUsd: number | null;
}

/**
 * Resolve the model for this extraction, or `null` when none is available.
 *
 * Settings win when the workspace picked one. Otherwise we walk a CHEAP chain
 * and take the first provider we hold a key for, rather than the static
 * registry default — extraction is a low-stakes proposal step whose output is
 * gated by code, so the marginal value of a flagship model is small and its
 * marginal cost is not. `platform/feature-models.ts` calls this out as the
 * "caller keeps its own dynamic default" case.
 *
 * Returning `null` rather than throwing is deliberate: the config pass needs
 * no key at all, so a keyless workspace should still get the rules its
 * eslint/tsconfig already state instead of an error page (K3 — a missing key
 * fails only the work that needs it).
 */
export async function resolveExtractionModel(
  container: Container,
  override: FeatureModelChoice | undefined,
): Promise<FeatureModelChoice | null> {
  if (override) return override;
  for (const entry of CHEAP_MODEL_CHAIN) {
    const key = await container.secrets.get(entry.secret).catch(() => undefined);
    if (key) return { provider: entry.provider as Provider, model: entry.model };
  }
  return null;
}

/** Message shown when no provider key is configured for the model pass. */
export const NO_MODEL_REASON =
  'No LLM API key is configured — only rules read from config files were extracted. Add an OpenRouter, OpenAI or Anthropic key in Settings.';

/**
 * Ask the model for candidates.
 *
 * Never throws: a missing key, an unreachable provider or a schema the model
 * could not satisfy degrades to "no model candidates, here is why", so one
 * flaky call cannot take the config pass's results down with it.
 */
export async function proposeConventions(
  container: Container,
  input: {
    repoFullName: string;
    samples: SampleFile[];
    choice: FeatureModelChoice | null;
  },
): Promise<ModelPassResult> {
  if (!input.choice) {
    return { candidates: [], model: null, skipped: NO_MODEL_REASON, costUsd: null };
  }
  if (input.samples.length === 0) {
    // The clone exists (the service checks that first), so this is the sampler
    // filtering everything out. Naming the filters matters: the honest causes
    // are an unsupported language, a repo of only tests/generated code, or
    // sources nested deeper than the walker goes — none of which the bare
    // sentence "nothing was sampled" would lead anyone to check.
    return {
      candidates: [],
      model: null,
      skipped:
        'No source files could be sampled from the clone. The extractor reads ' +
        `${SOURCE_EXTENSIONS.join(', ')} files under ${WALK_MAX_DEPTH} levels, ` +
        'skipping tests, generated and vendored code and anything under 500 bytes.',
      costUsd: null,
    };
  }

  const system = await renderPrompt(EXTRACTION_PROMPT_FILE, {
    repo: input.repoFullName,
    maxCandidates: String(MAX_CANDIDATES),
  });

  const user = [
    `Sampled files from \`${input.repoFullName}\`:`,
    '',
    wrapUntrusted('repo-samples', renderSamples(input.samples)),
    '',
    'Propose the house conventions these files demonstrate. Cite only these paths and only line numbers shown above.',
  ].join('\n');

  try {
    const llm = await container.llm(input.choice.provider);
    // The wall-clock ceiling is enforced HERE, not through `timeoutMs`:
    // OpenRouterProvider fixes its timeout at construction and ignores the
    // per-request field, so a slow generation multiplied by its reprompt loop
    // can outlast any inline HTTP request. `maxRetries: 1` caps that loop at
    // one repair attempt for the same reason.
    const result = await withTimeout(
      llm.completeStructured({
        model: input.choice.model,
        schema: ConventionExtractionSchema,
        schemaName: EXTRACTION_SCHEMA_NAME,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: EXTRACTION_TEMPERATURE,
        maxTokens: EXTRACTION_MAX_TOKENS,
        timeoutMs: EXTRACTION_TIMEOUT_MS,
        maxRetries: EXTRACTION_MAX_REPAIRS,
      }),
      EXTRACTION_TIMEOUT_MS,
    );

    return {
      candidates: result.data.conventions.slice(0, MAX_CANDIDATES).map(toCandidate),
      model: result.model,
      skipped: null,
      costUsd: result.costUsd,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    // A slow route is the likeliest failure here and the user can fix it
    // themselves in one click, so the message names that remedy rather than
    // just reporting the stack's wording.
    const remedy = /timed out/i.test(detail)
      ? ' Pick a faster model for Conventions in Settings → Feature Models, then re-run.'
      : '';
    return {
      candidates: [],
      model: null,
      skipped: `${input.choice.provider}/${input.choice.model}: ${detail}.${remedy}`,
      costUsd: null,
    };
  }
}

function toCandidate(draft: z.infer<typeof ConventionDraftSchema>): CandidateConvention {
  return {
    category: draft.category,
    rule: draft.rule.trim(),
    rationale: draft.rationale.trim() || null,
    // Models occasionally answer with a leading `./` or a backtick-wrapped
    // path; normalizing here keeps the sampled-path lookup exact.
    evidencePath: draft.evidence_path.trim().replace(/^`|`$/g, '').replace(/^\.\//, ''),
    evidenceLine: Math.max(1, Math.trunc(draft.evidence_line)),
    evidenceSnippet: stripLineNumbers(draft.evidence_snippet),
    confidence: clamp01(draft.confidence),
    origin: 'model',
  };
}

/**
 * Models frequently copy the `  23 | ` gutter back into the snippet even when
 * told not to. Stripping it here is worth more than another prompt sentence:
 * left in, it makes every otherwise-valid snippet fail the file lookup.
 */
function stripLineNumbers(snippet: string): string {
  const lines = snippet.split('\n');
  const gutter = /^\s*\d+\s*\|\s?/;
  if (!lines.some((l) => gutter.test(l))) return snippet.trim();
  return lines.map((l) => l.replace(gutter, '')).join('\n').trim();
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
