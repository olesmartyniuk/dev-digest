import { z } from 'zod';
import {
  FEATURE_MODELS,
  IntentConfidence,
  type IntentSource,
  type Provider,
  type PrIntentResponse,
  type PrIntentView,
  type UnifiedDiff,
} from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { ConfigError, NotFoundError } from '../../platform/errors.js';
import { withTimeout } from '../../platform/resilience.js';
import { renderPrompt } from '../../platform/prompts.js';
import type { PullRow } from '../../db/rows.js';
import * as schema from '../../db/schema.js';
import { IntentRepository } from './repository.js';
import type { IntentInput, IntentLogSink, PrIntentRowLike, ResolvedDoc } from './types.js';
import {
  applyConfidenceCeiling,
  buildFileList,
  detectReferences,
  extractHunkHeaders,
  formatSourcesLine,
  headersFromPatch,
  isEmptyDescription,
  renderIntentDigest,
  safeGitRef,
  safeRepoPath,
  synthesizeHeaders,
  toIntentView,
} from './helpers.js';
import {
  FEATURE_MODEL_ID,
  INTENT_MAX_REPAIRS,
  INTENT_MAX_TOKENS,
  INTENT_PROMPT_FILE,
  INTENT_SCHEMA_NAME,
  INTENT_TEMPERATURE,
  INTENT_TIMEOUT_MS,
  MAX_DESCRIPTION_CHARS,
  MAX_DOCS_TOTAL_CHARS,
  MAX_DOC_CHARS,
  MAX_ISSUE_BODY_CHARS,
  MAX_RESOLVED_DOCS,
} from './constants.js';

/**
 * PR intent classification (L03) — a cheap, separate LLM call that derives
 * WHY a PR exists (title/description/linked issue/referenced plan-or-spec
 * docs/hunk-headers-only), stored per-PR, and injected into every agent's
 * review prompt. Owns the application + presentation logic for the `intent`
 * module; `pr_intent` PERSISTENCE lives in `container.reviewRepo` (the
 * composition root already owns cross-cutting pull/review entities) — this
 * service never imports `modules/reviews/*` or `adapters/*` directly.
 */

type RepoRow = typeof schema.repos.$inferSelect;
/** The persisted `pr_intent` row shape, derived locally from `db/schema.js`
 *  (NOT imported from `modules/reviews/repository.js` — `no-cross-module-reach`). */
type PrIntentDbRow = typeof schema.prIntent.$inferSelect;

/**
 * The LLM's output contract for classification — internal (like
 * `ConventionExtractionSchema`), not published in `@devdigest/shared`. Every
 * field is required: strict schemas don't honour optionals.
 */
export const IntentClassificationSchema = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  confidence: IntentConfidence,
  confidence_reason: z.string(),
});

function toRowLike(row: PrIntentDbRow): PrIntentRowLike {
  return {
    prId: row.prId,
    intent: row.intent,
    inScope: row.inScope,
    outOfScope: row.outOfScope,
    confidence: row.confidence,
    confidenceReason: row.confidenceReason,
    sources: row.sources,
    provider: row.provider as Provider | null,
    model: row.model,
    headSha: row.headSha,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    costUsd: row.costUsd,
    classifiedAt: row.classifiedAt,
  };
}

/** Trim, drop empty items, cap at 8 items of ≤200 chars each. */
function capItems(items: string[]): string[] {
  return items
    .map((s) => s.trim().slice(0, 200))
    .filter((s) => s.length > 0)
    .slice(0, 8);
}

export class IntentService {
  private repo: IntentRepository;

  constructor(private container: Container) {
    this.repo = new IntentRepository(container.db);
  }

  async get(workspaceId: string, prId: string): Promise<PrIntentResponse> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const row = await this.container.reviewRepo.getIntentRecord(prId);
    return { intent: row ? toIntentView(toRowLike(row), pull.headSha) : null, skipped: null };
  }

  /** (Re)classify synchronously. Used by POST — always forced, never throws
   *  for LLM/key/timeout problems (those come back as `skipped`). */
  async classify(workspaceId: string, prId: string, log: IntentLogSink): Promise<PrIntentResponse> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.container.reviewRepo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const files = await this.loadHeaderSource(pull, repo);
    const r = await this.run(workspaceId, pull, repo, files, log);
    if (r.ok) return { intent: r.view, skipped: null };

    const stored = await this.container.reviewRepo.getIntentRecord(pull.id);
    return { intent: stored ? toIntentView(toRowLike(stored), pull.headSha) : null, skipped: r.reason };
  }

  /**
   * Called once per `executeRuns`, on the shared fanned-out log. NEVER
   * throws — a classification failure degrades to a stale digest or none;
   * the review run itself must never fail because of intent (a narrowing of
   * invariant R5).
   */
  async ensureForReview(input: {
    workspaceId: string;
    pull: PullRow;
    repo: RepoRow;
    diff: UnifiedDiff;
    log: IntentLogSink;
  }): Promise<{ digest?: string }> {
    try {
      const stored = await this.container.reviewRepo.getIntentRecord(input.pull.id);
      const sha7 = input.pull.headSha.slice(0, 7);

      if (stored?.headSha === input.pull.headSha) {
        input.log.info(
          `intent: reusing stored classification (commit ${sha7}, confidence=${stored.confidence})`,
        );
        return { digest: renderIntentDigest(toIntentView(toRowLike(stored), input.pull.headSha)) };
      }

      const headerMap = extractHunkHeaders(input.diff.raw);
      const files = buildFileList(
        input.diff.files.map((f) => ({
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          headers: headerMap.get(f.path)?.length ? headerMap.get(f.path)! : synthesizeHeaders(f.hunks),
        })),
      );

      const r = await this.run(input.workspaceId, input.pull, input.repo, files, input.log);
      if (r.ok) return { digest: renderIntentDigest(r.view) };

      if (stored) {
        input.log.info(
          `intent: classification unavailable (${r.reason}) — using stale intent from ${sha7}`,
        );
        return { digest: renderIntentDigest(toIntentView(toRowLike(stored), input.pull.headSha)) };
      }
      input.log.info(`intent: skipped — ${r.reason}`);
      return {};
    } catch (err) {
      input.log.info(`intent: failed — ${(err as Error).message}`);
      return {};
    }
  }

  /**
   * Mirrors `reviews/diff-loader.ts` behaviour WITHOUT importing it
   * (`no-cross-module-reach`): prefer a real `git diff`, fall back to the
   * persisted `pr_files` patches.
   */
  private async loadHeaderSource(pull: PullRow, repo: RepoRow): Promise<IntentInput['files']> {
    try {
      const diff = await this.container.git.diff(
        { owner: repo.owner, name: repo.name },
        pull.base,
        pull.headSha,
      );
      if (diff.files.length > 0) {
        const headerMap = extractHunkHeaders(diff.raw);
        return buildFileList(
          diff.files.map((f) => ({
            path: f.path,
            additions: f.additions,
            deletions: f.deletions,
            headers: headerMap.get(f.path)?.length ? headerMap.get(f.path)! : synthesizeHeaders(f.hunks),
          })),
        );
      }
    } catch {
      /* fall through to pr_files reconstruction */
    }
    const prFiles = await this.container.reviewRepo.getPrFiles(pull.id);
    return buildFileList(
      prFiles.map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        headers: headersFromPatch(f.patch),
      })),
    );
  }

  /** The single classification path — shared by `classify` and `ensureForReview`. */
  private async run(
    workspaceId: string,
    pull: PullRow,
    repo: RepoRow,
    files: IntentInput['files'],
    log: IntentLogSink,
  ): Promise<{ ok: true; view: PrIntentView } | { ok: false; reason: string }> {
    // 1. Model
    const override = await this.repo.featureModelOverride(workspaceId);
    const def = FEATURE_MODELS.find((f) => f.id === FEATURE_MODEL_ID)!;
    const provider: Provider = override?.provider ?? def.defaultProvider;
    const model = override?.model ?? def.defaultModel;
    log.info(`intent: model ${provider}/${model} (${override ? 'settings override' : 'registry default'})`);

    // 2. Sources
    const descriptionEmpty = isEmptyDescription(pull.body);
    const { sources, issue, docs } = await this.gatherSources(pull, repo, files, descriptionEmpty);
    log.info(`intent: sources — ${formatSourcesLine(sources)}`);

    // 3. Prompt
    const system = await renderPrompt(INTENT_PROMPT_FILE, { maxInScope: '8', maxOutOfScope: '8' });
    const user = this.buildUserMessage(pull, descriptionEmpty, issue, docs, sources, files);

    // 4. Token estimate
    const promptTokens = this.container.tokenizer.count(system) + this.container.tokenizer.count(user);

    // 5. Call
    let llm;
    try {
      llm = await this.container.llm(provider);
    } catch {
      return { ok: false, reason: `no ${provider} API key configured` };
    }

    let res;
    try {
      res = await log.step(
        `Classifying PR intent (${provider}/${model}, ~${promptTokens} prompt tokens)`,
        () =>
          withTimeout(
            llm.completeStructured({
              model,
              schema: IntentClassificationSchema,
              schemaName: INTENT_SCHEMA_NAME,
              outputMode: 'tool',
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
              ],
              temperature: INTENT_TEMPERATURE,
              maxTokens: INTENT_MAX_TOKENS,
              timeoutMs: INTENT_TIMEOUT_MS,
              maxRetries: INTENT_MAX_REPAIRS,
              sessionId: `${repo.owner}/${repo.name}#${pull.number}:intent`,
            }),
            INTENT_TIMEOUT_MS,
          ),
        { kind: 'tool' },
      );
    } catch (err) {
      const msg = (err as Error).message;
      const remedy = /timed out/i.test(msg)
        ? ' — pick a faster model for "PR Review · Intent" in Settings → Feature Models'
        : '';
      return { ok: false, reason: `${msg}${remedy}` };
    }

    // 7. Post-process
    const inScope = capItems(res.data.in_scope);
    const outOfScope = capItems(res.data.out_of_scope);
    const unavailable = sources.filter((s) => s.status === 'unavailable');
    const { confidence, reason } = applyConfidenceCeiling(
      res.data.confidence,
      { descriptionEmpty, unavailable },
      res.data.confidence_reason,
    );

    // 8. Persist
    await this.container.reviewRepo.upsertIntentRecord(pull.id, {
      intent: res.data.intent.trim(),
      inScope,
      outOfScope,
      confidence,
      confidenceReason: reason,
      sources,
      provider,
      model: res.model,
      headSha: pull.headSha,
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      costUsd: res.costUsd,
    });
    const row = await this.container.reviewRepo.getIntentRecord(pull.id);
    if (!row) return { ok: false, reason: 'failed to persist intent' };
    const view = toIntentView(toRowLike(row), pull.headSha);

    // 9. Result log
    log.result(
      `intent: confidence=${confidence} · in_scope ${inScope.length} · out_of_scope ${outOfScope.length} · ` +
        `tokens ${res.tokensIn}/${res.tokensOut} · cost ${res.costUsd == null ? 'n/a' : `$${res.costUsd.toFixed(4)}`}`,
    );

    return { ok: true, view };
  }

  /**
   * Gather every classifier input source: title, description, the linked
   * issue (fetched), up to `MAX_RESOLVED_DOCS` referenced plan/spec docs
   * (read from this repo only — never a network fetch), and a summary of the
   * hunk-header source. No log line or `data` payload built from this may
   * ever contain description/issue/document CONTENT — only refs and statuses.
   */
  private async gatherSources(
    pull: PullRow,
    repo: RepoRow,
    files: IntentInput['files'],
    descriptionEmpty: boolean,
  ): Promise<{
    sources: IntentSource[];
    issue: { number: number; title: string; body: string | null } | null;
    docs: ResolvedDoc[];
  }> {
    const sources: IntentSource[] = [
      { kind: 'title', ref: null, status: 'used', note: null },
      { kind: 'description', ref: null, status: descriptionEmpty ? 'empty' : 'used', note: null },
    ];

    let issue: { number: number; title: string; body: string | null } | null = null;
    const docs: ResolvedDoc[] = [];
    let docsCharsUsed = 0;
    let resolvedDocsCount = 0;

    const refs = detectReferences(pull.body ?? '', { owner: repo.owner, name: repo.name });

    for (const ref of refs) {
      if (ref.target.type === 'issue') {
        try {
          const gh = await this.container.github();
          const meta = await gh.getIssue({ owner: repo.owner, name: repo.name }, ref.target.number);
          issue = {
            number: meta.number,
            title: meta.title,
            body: meta.body ? meta.body.slice(0, MAX_ISSUE_BODY_CHARS) : null,
          };
          sources.push({ kind: 'linked_issue', ref: `#${ref.target.number}`, status: 'used', note: null });
        } catch (err) {
          const note =
            err instanceof ConfigError ? 'GITHUB_TOKEN not configured' : `issue #${ref.target.number} could not be fetched`;
          sources.push({ kind: 'linked_issue', ref: `#${ref.target.number}`, status: 'unavailable', note });
        }
        continue;
      }

      if (ref.target.type === 'repo_path') {
        if (resolvedDocsCount >= MAX_RESOLVED_DOCS) {
          sources.push({ kind: ref.kind, ref: ref.ref, status: 'skipped', note: 'reference cap reached' });
          continue;
        }
        const safePath = safeRepoPath(ref.target.path);
        const safeRef = safeGitRef(ref.target.ref ?? pull.headSha);
        if (!safePath || !safeRef) {
          sources.push({ kind: ref.kind, ref: ref.ref, status: 'unavailable', note: 'rejected: unsafe path or ref' });
          continue;
        }
        let content: string | null = null;
        try {
          content = await this.container.git.readFileAt({ owner: repo.owner, name: repo.name }, safeRef, safePath);
        } catch {
          if (ref.target.ref === null) {
            try {
              content = await this.container.git.readFileAt(
                { owner: repo.owner, name: repo.name },
                pull.base,
                safePath,
              );
            } catch {
              content = null;
            }
          }
        }
        if (content == null) {
          sources.push({
            kind: ref.kind,
            ref: ref.ref,
            status: 'unavailable',
            note: 'not found in the repository at the PR head or base',
          });
          continue;
        }
        if (docsCharsUsed >= MAX_DOCS_TOTAL_CHARS) {
          sources.push({ kind: ref.kind, ref: ref.ref, status: 'skipped', note: 'document budget reached' });
          continue;
        }
        const truncated = content.slice(0, MAX_DOC_CHARS);
        docsCharsUsed += truncated.length;
        resolvedDocsCount++;
        // `ref.kind` is always 'plan' | 'spec' for a `repo_path` target (detectReferences
        // never assigns 'linked_issue' to one) — narrow explicitly for ResolvedDoc.kind.
        docs.push({ kind: ref.kind === 'spec' ? 'spec' : 'plan', ref: ref.ref, content: truncated });
        sources.push({ kind: ref.kind, ref: ref.ref, status: 'used', note: null });
        continue;
      }

      // external — no network call of any kind
      sources.push({ kind: ref.kind, ref: ref.ref, status: 'unavailable', note: ref.target.reason });
    }

    const totalHeaders = files.reduce((n, f) => n + f.headers.length, 0);
    sources.push(
      files.length === 0
        ? { kind: 'hunk_headers', ref: null, status: 'empty', note: null }
        : { kind: 'hunk_headers', ref: `${files.length} file(s)/${totalHeaders} hunk(s)`, status: 'used', note: null },
    );

    return { sources, issue, docs };
  }

  /**
   * Build the classifier's user message. Built HERE (not in `helpers.ts`)
   * because it uses `wrapUntrusted` from `@devdigest/reviewer-core`, the same
   * pattern `conventions/extractor.ts` uses.
   */
  private buildUserMessage(
    pull: PullRow,
    descriptionEmpty: boolean,
    issue: { number: number; title: string; body: string | null } | null,
    docs: ResolvedDoc[],
    sources: IntentSource[],
    files: IntentInput['files'],
  ): string {
    const sections: string[] = [];
    sections.push(`## PR title\n${wrapUntrusted('pr-title', pull.title)}`);
    sections.push(
      `## PR description\n${
        descriptionEmpty
          ? '(empty — the author wrote no description; you MUST set confidence to "low")'
          : wrapUntrusted('pr-description', (pull.body ?? '').slice(0, MAX_DESCRIPTION_CHARS))
      }`,
    );
    if (issue) {
      sections.push(
        `## Linked issue #${issue.number}\n${wrapUntrusted('linked-issue', `${issue.title}\n\n${issue.body ?? ''}`)}`,
      );
    }
    if (docs.length > 0) {
      sections.push(
        `## Referenced documents\n${docs.map((d) => wrapUntrusted(`${d.kind}:${d.ref}`, d.content)).join('\n')}`,
      );
    }
    const unavailable = sources.filter((s) => s.status === 'unavailable');
    if (unavailable.length > 0) {
      const lines = unavailable.map((s) => `- ${s.kind} ${s.ref ?? '(unknown)'} — ${s.note ?? ''}`).join('\n');
      sections.push(
        `## Unavailable references\n${wrapUntrusted('unavailable-refs', lines)}\n` +
          'These were NOT read. Do not describe, summarise or guess their content. ' +
          'You may only say they were referenced and could not be read.',
      );
    }
    sections.push(
      `## Changed files and hunk headers (bodies intentionally omitted)\n${wrapUntrusted(
        'hunk-headers',
        files
          .map((f) => `${f.path} (+${f.additions}/-${f.deletions})\n${f.headers.map((h) => `  ${h}`).join('\n')}`)
          .join('\n'),
      )}`,
    );
    return sections.join('\n\n');
  }
}
