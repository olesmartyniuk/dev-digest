import { z } from 'zod';
import { Onboarding, OnboardingSectionKind, type FeatureModelChoice } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { ExternalServiceError } from '../../platform/errors.js';
import { withTimeout } from '../../platform/resilience.js';
import { renderPrompt } from '../../platform/prompts.js';
import { formatCriticalPaths, formatTopFiles, normalizeTour } from './helpers.js';
import type { OnboardingFacts } from './types.js';
import {
  ONBOARDING_LANGUAGE,
  ONBOARDING_MAX_REPAIRS,
  ONBOARDING_MAX_TOKENS,
  ONBOARDING_PROMPT_FILE,
  ONBOARDING_SCHEMA_NAME,
  ONBOARDING_TEMPERATURE,
  ONBOARDING_TIMEOUT_MS,
  SECTIONS_SPEC,
} from './constants.js';

/**
 * Onboarding Tour (SPEC-02 / L05) generator — prompt assembly + the single
 * inline LLM call. Same shape as `conventions/extractor.ts`: imports
 * `@devdigest/reviewer-core`, `platform/prompts.js`, `platform/resilience.js`,
 * `platform/errors.js`, and the `Container` type — never `adapters/` directly
 * (`no-service-imports-adapters-directly`).
 */

/**
 * The LLM's output contract — internal, like `ConventionExtractionSchema`,
 * not published in `@devdigest/shared`. Every field is required and
 * `diagram` is `.nullable()`, not `.nullish()`: strict `json_schema` mode
 * does not honour optionals (see `conventions/extractor.ts:28-32`). The
 * shared `Onboarding` schema itself is never handed to the model — it is
 * what `normalizeTour` produces AFTER this draft is reshaped.
 */
export const OnboardingDraftSchema = z.object({
  sections: z.array(
    z.object({
      kind: OnboardingSectionKind,
      title: z.string(),
      body: z.string(),
      diagram: z.string().nullable(),
      links: z.array(z.object({ label: z.string(), path: z.string() })),
    }),
  ),
});

/** Build the generator's user message. Every repo-derived string is wrapped `wrapUntrusted`. */
export function buildUserMessage(f: OnboardingFacts): string {
  const sections: string[] = [];
  sections.push(`## Repository\n${f.repoFullName}`);
  sections.push(`## FACTS — index\nstatus: ${f.indexStatus}\nfilesIndexed: ${f.filesIndexed}`);
  sections.push(`## Repo map\n${wrapUntrusted('repo-map', f.repoMapText || '(unavailable)')}`);
  sections.push(`## Critical paths\n${wrapUntrusted('critical-paths', formatCriticalPaths(f.criticalPaths))}`);
  sections.push(`## Top files by rank\n${wrapUntrusted('top-files', formatTopFiles(f.topFiles))}`);

  if (f.contextEntries.length === 0) {
    sections.push('## Project context\n(none)');
  } else {
    const entries = f.contextEntries
      .map((entry, i) => wrapUntrusted(`context:${i}`, entry))
      .join('\n\n');
    sections.push(
      `## Project context\n${entries}${f.contextTruncated ? '\n\n(project context was truncated to fit the budget)' : ''}`,
    );
  }

  sections.push('Write the tour. Use only paths that appear above.');
  return sections.join('\n\n');
}

/** Generate the tour: render the prompt, call the model, normalize the result. */
export async function generateTour(
  container: Container,
  input: { facts: OnboardingFacts; choice: FeatureModelChoice },
): Promise<Onboarding> {
  const system = await renderPrompt(ONBOARDING_PROMPT_FILE, {
    sections: SECTIONS_SPEC,
    language: ONBOARDING_LANGUAGE,
  });
  const user = buildUserMessage(input.facts);

  // A ConfigError (missing key) is allowed to propagate unchanged — the
  // service turns that into whatever its own 500/caller expects, same as
  // every other feature's inline LLM call.
  const llm = await container.llm(input.choice.provider);

  let res;
  try {
    res = await withTimeout(
      llm.completeStructured({
        model: input.choice.model,
        schema: OnboardingDraftSchema,
        schemaName: ONBOARDING_SCHEMA_NAME,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: ONBOARDING_TEMPERATURE,
        maxTokens: ONBOARDING_MAX_TOKENS,
        timeoutMs: ONBOARDING_TIMEOUT_MS,
        maxRetries: ONBOARDING_MAX_REPAIRS,
        sessionId: `${input.facts.repoFullName}:onboarding`,
      }),
      ONBOARDING_TIMEOUT_MS,
    );
  } catch (err) {
    const msg = (err as Error).message;
    const remedy = /timed out/i.test(msg)
      ? ' — pick a faster model for "Onboarding Tour" in Settings → Feature Models'
      : '';
    throw new ExternalServiceError(`${input.choice.provider}/${input.choice.model}: ${msg}${remedy}`);
  }

  const tour = normalizeTour(res.data);
  if (!tour) {
    throw new ExternalServiceError('The model did not return all 5 onboarding sections');
  }
  return tour;
}
