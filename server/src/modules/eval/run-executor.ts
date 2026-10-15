import type { Container } from '../../platform/container.js';
import type { Provider, EvalRunConfig } from '@devdigest/shared';
import { EvalCaseMeta, EvalExpectation } from '@devdigest/shared';
import { reviewPullRequest, scoreEvalCase, aggregateEvalScores } from '@devdigest/reviewer-core';
import type { ScoredEvalCase } from '@devdigest/reviewer-core';
import type { EvalBatchRow, EvalCaseRow } from '../../db/rows.js';
import type { EvalRepository } from './repository.js';
import { parseFrozenDiff } from './frozen-diff.js';
import { BATCH_STATUS_DONE, BATCH_STATUS_FAILED } from './constants.js';

/** Minimal structured logger (pino-compatible: (obj, msg)). Same shape as reviews' logger; not imported from there. */
export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
};

/**
 * Background execution of one eval batch (SPEC-04).
 *
 * Each case runs sequentially through `reviewPullRequest` on its FROZEN input
 * only (stored diff + stored PR meta). No repo-intel digests, project context,
 * derived intent or live PR body is fed in (AC-12); the agent's enabled linked
 * skills are the only non-frozen input (D7). The case name never enters the
 * prompt. Scoring is the pure reviewer-core function — no LLM in the scorer.
 *
 * A batch never stays `running`: every exit path calls `completeBatch`.
 */
export class EvalRunExecutor {
  constructor(
    private container: Container,
    private repo: EvalRepository,
  ) {}

  async execute(
    _workspaceId: string,
    batch: EvalBatchRow,
    config: EvalRunConfig,
    cases: EvalCaseRow[],
    skillBodies: string[],
    logger?: Logger,
  ): Promise<void> {
    const wallStart = Date.now();
    try {
      let llm;
      try {
        llm = await this.container.llm(config.provider as Provider);
      } catch (err) {
        // Same user-visible semantics as a review run: the app boots keyless,
        // only the run fails. The message never contains a secret value.
        await this.repo.completeBatch(batch.id, {
          status: BATCH_STATUS_FAILED,
          error: (err as Error).message,
          aggregate: null,
          na: null,
          costUsd: null,
          erroredCount: 0,
        });
        return;
      }

      const scored: ScoredEvalCase[] = [];
      for (const c of cases) {
        scored.push(await this.runCase(batch, config, c, skillBodies, llm, logger));
      }

      const agg = aggregateEvalScores(scored, Date.now() - wallStart);
      const allErrored = scored.length > 0 && agg.erroredCount === scored.length;
      await this.repo.completeBatch(batch.id, {
        status: allErrored ? BATCH_STATUS_FAILED : BATCH_STATUS_DONE,
        error: allErrored ? `All ${scored.length} case(s) errored` : null,
        aggregate: agg.run,
        na: agg.na,
        costUsd: agg.run.cost_usd,
        erroredCount: agg.erroredCount,
      });
    } catch (err) {
      logger?.error({ err, batchId: batch.id }, 'eval run failed unexpectedly');
      await this.repo.completeBatch(batch.id, {
        status: BATCH_STATUS_FAILED,
        error: (err as Error).message || 'Eval run failed',
        aggregate: null,
        na: null,
        costUsd: null,
        erroredCount: 0,
      });
    }
  }

  private async runCase(
    batch: EvalBatchRow,
    config: EvalRunConfig,
    c: EvalCaseRow,
    skillBodies: string[],
    llm: Awaited<ReturnType<Container['llm']>>,
    logger?: Logger,
  ): Promise<ScoredEvalCase> {
    const started = Date.now();
    let expected: EvalExpectation = [];
    try {
      expected = EvalExpectation.parse(c.expectedOutput ?? []);
      const diff = parseFrozenDiff(c.inputDiff ?? '');
      const meta = EvalCaseMeta.parse(c.inputMeta ?? {});

      const outcome = await reviewPullRequest({
        systemPrompt: config.system_prompt,
        model: config.model,
        diff,
        llm,
        strategy: config.strategy as 'single-pass' | 'map-reduce' | 'auto',
        ...(skillBodies.length ? { skills: skillBodies } : {}),
        ...(meta.body ? { prDescription: meta.body } : {}),
        task: meta.title ? `Review this change: "${meta.title}"` : 'Review this change.',
        sessionId: `eval:${batch.id}:${c.id}`,
      });

      const score = scoreEvalCase({
        expected,
        kept: outcome.review.findings,
        droppedCount: outcome.dropped.length,
      });
      const actual = {
        kept: outcome.review.findings,
        dropped: outcome.dropped,
        score,
        error: null,
      };
      await this.repo.insertCaseRun({
        caseId: c.id,
        batchId: batch.id,
        actualOutput: actual,
        pass: score.pass,
        recall: score.recall,
        precision: score.precision,
        citationAccuracy: score.citation_accuracy,
        durationMs: Date.now() - started,
        costUsd: outcome.costUsd,
      });
      return { name: c.name, expected, actual, score, costUsd: outcome.costUsd };
    } catch (err) {
      // AC-14: record the case as errored, keep going.
      const message = (err as Error).message || 'Case execution failed';
      logger?.warn({ err, caseId: c.id }, 'eval case errored');
      const actual = { kept: [], dropped: [], score: null, error: message };
      await this.repo.insertCaseRun({
        caseId: c.id,
        batchId: batch.id,
        actualOutput: actual,
        pass: null,
        recall: null,
        precision: null,
        citationAccuracy: null,
        durationMs: Date.now() - started,
        costUsd: null,
      });
      return { name: c.name, expected, actual, score: null, costUsd: null };
    }
  }
}
