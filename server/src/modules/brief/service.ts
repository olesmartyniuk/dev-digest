import { FEATURE_MODELS, type PrBriefResponse, type PrBriefView } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import type { RunLogger } from '../../platform/run-logger.js';
import { generateBrief } from './generator.js';
import { BriefRepository } from './repository.js';
import {
  buildAllowedPaths,
  collectCallerFiles,
  flattenCallers,
  missingSources,
  roleByPath,
  validateBrief,
} from './helpers.js';
import type { BriefFacts } from './types.js';
import { FEATURE_MODEL_ID } from './constants.js';

/**
 * PR Why + Risk Brief (SPEC-03 / L05) — application layer. Orchestrates the
 * PR's intent, blast radius, Smart Diff roles, diff stats, and project
 * context into one single LLM call (`generator.ts`), validates every file
 * path the model names (D5), and persists through `BriefRepository`.
 *
 * Deliberately does NOT import `../blast/`, `../smart-diff/`, `../context/`,
 * `../settings/`, or `../reviews/` directly (`no-cross-module-reach`) —
 * those are reached through `container.blastService`, `container.smartDiffService`,
 * `container.contextService` and `container.reviewRepo`/`container.agentsRepo`,
 * and the feature-model override is read locally by `BriefRepository`.
 */
export class BriefService {
  private repo: BriefRepository;

  constructor(private container: Container) {
    this.repo = new BriefRepository(container.db);
  }

  /** GET — cached brief or null. NEVER calls the LLM, ignores head-SHA drift (AC-9). 404 unknown PR. */
  async get(workspaceId: string, prId: string): Promise<PrBriefResponse> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const brief = await this.repo.getBrief(pull.id);
    return { brief };
  }

  /** POST — always a fresh generation (AC-2, AC-10). Throws ExternalServiceError (502) / ConfigError (500) on
   *  failure, leaving the stored row untouched (AC-12). */
  async generate(workspaceId: string, prId: string, log: Pick<RunLogger, 'info'>): Promise<PrBriefResponse> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.container.reviewRepo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const [prFiles, intentRow, blast, smart, context] = await Promise.all([
      this.container.reviewRepo
        .getPrFiles(pull.id)
        .then((rows) => rows.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions }))),
      this.container.reviewRepo.getIntentRecord(pull.id),
      this.container.blastService.get(workspaceId, prId).catch(() => null),
      this.container.smartDiffService.get(workspaceId, prId).catch(() => null),
      this.contextAgentIds(workspaceId, pull.id).then((ids) =>
        this.container.contextService.resolveForAgents({ agentIds: ids, clonePath: repo.clonePath, log }),
      ),
    ]);

    const blastAvailable = blast !== null && !blast.degraded;
    const missing = missingSources({ hasIntent: !!intentRow, blastAvailable });

    const roles = roleByPath(smart);
    const facts: BriefFacts = {
      description: pull.body ?? null,
      intent: intentRow
        ? { intent: intentRow.intent, inScope: intentRow.inScope, outOfScope: intentRow.outOfScope }
        : null,
      // Callers are still useful (and still allowed paths) even on a degraded
      // blast result — `missing` already records the degradation (D4).
      blast: blast ? { summary: blast.summary, callers: flattenCallers(blast) } : null,
      files: prFiles.map((f) => ({ ...f, role: roles.get(f.path) ?? null })),
      contextEntries: context?.specs ?? [],
      contextTruncated: context?.truncated ?? false,
    };

    const override = await this.repo.featureModelOverride(workspaceId);
    const def = FEATURE_MODELS.find((f) => f.id === FEATURE_MODEL_ID)!;
    const choice = override ?? { provider: def.defaultProvider, model: def.defaultModel };
    log.info(`brief: model ${choice.provider}/${choice.model} (${override ? 'settings override' : 'registry default'})`);

    const gen = await generateBrief(this.container, {
      facts,
      choice,
      sessionId: `${repo.owner}/${repo.name}#${pull.number}:brief`,
    });

    const allowed = buildAllowedPaths(prFiles.map((f) => f.path), blast ? collectCallerFiles(blast) : []);
    const { brief, droppedRisks, droppedFocus } = validateBrief(gen.draft, allowed);
    log.info(
      `brief: risks ${brief.risks.length} (dropped ${droppedRisks}) · review_focus ${brief.review_focus.length} (dropped ${droppedFocus}) · missing [${missing.join(', ')}]`,
    );

    const view: PrBriefView = {
      ...brief,
      pr_id: pull.id,
      head_sha: pull.headSha,
      missing_sources: missing,
      provider: choice.provider,
      model: gen.model,
      tokens_in: gen.tokensIn,
      tokens_out: gen.tokensOut,
      cost_usd: gen.costUsd,
      generated_at: new Date().toISOString(),
    };
    await this.repo.upsertBrief(pull.id, view);
    return { brief: view };
  }

  /**
   * Inputs and provenance — "the agent(s) configured to review this PR":
   * every agent that has run a review against this PR, union every currently
   * enabled agent in the repo when none has run yet.
   */
  private async contextAgentIds(workspaceId: string, prId: string): Promise<string[]> {
    const reviews = await this.container.reviewRepo.reviewsForPull(prId);
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const { review } of reviews) {
      if (review.kind === 'review' && review.agentId && !seen.has(review.agentId)) {
        seen.add(review.agentId);
        ids.push(review.agentId);
      }
    }
    if (ids.length > 0) return ids;
    const enabled = await this.container.agentsRepo.listEnabled(workspaceId);
    return enabled.map((a) => a.id);
  }
}
