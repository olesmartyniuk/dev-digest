import type { FeatureModelChoice, RiskBrief } from '@devdigest/shared';
import { RiskBrief as RiskBriefSchema } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { ExternalServiceError } from '../../platform/errors.js';
import { withTimeout } from '../../platform/resilience.js';
import { renderPrompt } from '../../platform/prompts.js';
import type { BriefFacts } from './types.js';
import {
  BRIEF_MAX_FOCUS,
  BRIEF_MAX_REPAIRS,
  BRIEF_MAX_RISKS,
  BRIEF_MAX_TOKENS,
  BRIEF_PROMPT_FILE,
  BRIEF_SCHEMA_NAME,
  BRIEF_TEMPERATURE,
  BRIEF_TIMEOUT_MS,
  MAX_CALLERS_IN_PROMPT,
  MAX_DESCRIPTION_CHARS,
  MAX_FILES_IN_PROMPT,
  MAX_INTENT_ITEMS,
} from './constants.js';

/**
 * PR Why + Risk Brief (SPEC-03 / L05) generator — prompt assembly + the
 * single inline LLM call. Same shape as `onboarding/generator.ts`: imports
 * `@devdigest/reviewer-core`, `platform/prompts.js`, `platform/resilience.js`,
 * `platform/errors.js`, and the `Container` type — never `adapters/` directly
 * (`no-service-imports-adapters-directly`).
 */

/** Build the generator's user message. Every repo-derived string is wrapped `wrapUntrusted`. No PR title, no patch text (D7). */
export function buildUserMessage(f: BriefFacts): string {
  const sections: string[] = [];

  sections.push(
    `## PR description\n${
      f.description
        ? wrapUntrusted('pr-description', f.description.slice(0, MAX_DESCRIPTION_CHARS))
        : '(empty — the author wrote no description)'
    }`,
  );

  if (f.intent) {
    const inScope = f.intent.inScope.slice(0, MAX_INTENT_ITEMS).join(', ') || '(none)';
    const outOfScope = f.intent.outOfScope.slice(0, MAX_INTENT_ITEMS).join(', ') || '(none)';
    sections.push(
      `## Intent\n${wrapUntrusted(
        'pr-intent',
        `${f.intent.intent}\nIn scope: ${inScope}\nOut of scope: ${outOfScope}`,
      )}`,
    );
  } else {
    sections.push('## Intent\n(unavailable — intent not classified)');
  }

  if (f.blast) {
    const callerLines = f.blast.callers
      .slice(0, MAX_CALLERS_IN_PROMPT)
      .map((c) => `${c.name} — ${c.file}:${c.line}`)
      .join('\n');
    sections.push(
      `## Blast radius\n${wrapUntrusted('blast-summary', f.blast.summary)}\n` +
        `### Blast radius callers\n${wrapUntrusted('blast-callers', callerLines || '(none)')}`,
    );
  } else {
    sections.push('## Blast radius\n(unavailable)');
  }

  const shownFiles = f.files.slice(0, MAX_FILES_IN_PROMPT);
  const fileLines = shownFiles
    .map((file) => `${file.path} (+${file.additions}/-${file.deletions}) [${file.role ?? 'unclassified'}]`)
    .join('\n');
  const omittedNote =
    f.files.length > shownFiles.length ? `\n(${f.files.length - shownFiles.length} more files omitted)` : '';
  sections.push(
    `## Changed files (stats + Smart Diff role; no code)\n${wrapUntrusted('diff-stats', fileLines || '(none)')}${omittedNote}`,
  );

  if (f.contextEntries.length === 0) {
    sections.push('## Project context\n(none)');
  } else {
    const entries = f.contextEntries.map((entry, i) => wrapUntrusted(`context:${i}`, entry)).join('\n\n');
    sections.push(
      `## Project context\n${entries}${f.contextTruncated ? '\n\n(project context was truncated to fit the budget)' : ''}`,
    );
  }

  sections.push('Write the brief. Use only file paths that appear in "Changed files" or "Blast radius callers".');
  return sections.join('\n\n');
}

/** Generate the brief draft: render the prompt, make the single LLM call, return the raw result. */
export async function generateBrief(
  container: Container,
  input: { facts: BriefFacts; choice: FeatureModelChoice; sessionId: string },
): Promise<{ draft: RiskBrief; model: string; tokensIn: number | null; tokensOut: number | null; costUsd: number | null }> {
  const system = await renderPrompt(BRIEF_PROMPT_FILE, {
    maxRisks: String(BRIEF_MAX_RISKS),
    maxFocus: String(BRIEF_MAX_FOCUS),
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
        schema: RiskBriefSchema,
        schemaName: BRIEF_SCHEMA_NAME,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: BRIEF_TEMPERATURE,
        maxTokens: BRIEF_MAX_TOKENS,
        timeoutMs: BRIEF_TIMEOUT_MS,
        maxRetries: BRIEF_MAX_REPAIRS,
        sessionId: input.sessionId,
      }),
      BRIEF_TIMEOUT_MS,
    );
  } catch (err) {
    const msg = (err as Error).message;
    const remedy = /timed out/i.test(msg)
      ? ' — pick a faster model for "Risk Brief" in Settings → Feature Models'
      : '';
    throw new ExternalServiceError(`${input.choice.provider}/${input.choice.model}: ${msg}${remedy}`);
  }

  return {
    draft: res.data,
    model: res.model,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    costUsd: res.costUsd,
  };
}
