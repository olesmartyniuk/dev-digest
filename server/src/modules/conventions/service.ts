import type {
  Convention,
  ConventionExtractResult,
  ConventionSkillDraft,
  Skill,
  SkillType,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { ConventionsRepository, type UpdateConvention } from './repository.js';
import { detectConfigConventions } from './config-rules.js';
import { proposeConventions, resolveExtractionModel } from './extractor.js';
import {
  cloneDirExists,
  readConfigFiles,
  readSourceSamples,
  walkSourceFiles,
} from './sampler.js';
import {
  buildSkillBody,
  buildSkillDescription,
  normalizeRule,
  skillNameFor,
  toConventionDto,
  verifyCandidates,
} from './helpers.js';
import { SAMPLE_FILE_COUNT, SKILL_TYPE } from './constants.js';
import type { CandidateConvention, SampleFile } from './types.js';

/**
 * Conventions Extractor.
 *
 *   sample (code) → propose (config pass + cheap LLM) → VERIFY (code) → persist
 *
 * The model never writes to the database. Every candidate — the model's and
 * the config pass's alike — must survive `verifyCandidates`, which re-reads the
 * cited file and finds the cited snippet, before a row exists. That is what
 * makes the list worth a human's attention: a card on screen is a claim already
 * checked against the repo, so the only judgement left is "is this rule one we
 * want", not "is this rule even true".
 *
 * Extraction runs INLINE in the request rather than on the JobRunner. It is a
 * single cheap call over a bounded sample (12 files), the UI has one
 * "Scanning…" state to show for it, and the result is the response — a
 * background job would need a second polling surface to say the same thing.
 * If the sample budget ever grows past one call, this is the first thing to
 * move.
 */

export interface CreateSkillFromConventionsInput {
  name: string;
  description?: string;
  type?: SkillType;
  body: string;
  enabled?: boolean;
  /** Agents to attach the new skill to, in the order given. */
  agentIds?: string[];
}

export interface CreateSkillFromConventionsResult {
  skill: Skill;
  linked_agent_ids: string[];
}

export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
  }

  async list(workspaceId: string, repoId: string): Promise<Convention[]> {
    await this.requireRepo(workspaceId, repoId);
    const rows = await this.repo.listByRepo(workspaceId, repoId);
    return rows.map(toConventionDto);
  }

  /**
   * Run one extraction. Re-runnable: rows the user already accepted or
   * rejected survive untouched and their rules are skipped, so "Re-scan" costs
   * the user nothing they already decided.
   */
  async extract(workspaceId: string, repoId: string): Promise<ConventionExtractResult> {
    const startedAt = Date.now();
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.clonePath) {
      throw new ValidationError(
        'This repository has not finished cloning yet — conventions are read from the local clone.',
      );
    }
    if (!(await cloneDirExists(repo.clonePath))) {
      throw new ValidationError(
        `The local clone for ${repo.fullName} is missing from disk (${repo.clonePath}). ` +
          'Refresh the repository to clone it again, then re-run the extraction.',
      );
    }

    const configs = await readConfigFiles(repo.clonePath);
    const samples = await this.collectSamples(repoId, repo.clonePath);

    // Pass 1 — deterministic, free, exact evidence.
    const configCandidates = detectConfigConventions(configs);

    // Pass 2 — the model, over source files only.
    const choice = await resolveExtractionModel(
      this.container,
      await this.repo.featureModelOverride(workspaceId),
    );
    const modelPass = await proposeConventions(this.container, {
      repoFullName: repo.fullName,
      samples,
      choice,
    });

    const proposed: CandidateConvention[] = [...configCandidates, ...modelPass.candidates];
    const judged = await this.repo.judgedRuleKeys(workspaceId, repoId);
    // Config candidates cite config files, model candidates cite source files;
    // the verifier looks both up in one pool.
    const { kept, dropped } = verifyCandidates(proposed, [...configs, ...samples], judged);

    await this.repo.deletePending(workspaceId, repoId);
    await this.repo.insertMany(workspaceId, repoId, kept);

    const rows = await this.repo.listByRepo(workspaceId, repoId);
    return {
      conventions: rows.map(toConventionDto),
      stats: {
        sampled_files: samples.length,
        config_files: configs.length,
        proposed: proposed.length,
        kept: kept.length,
        line_corrected: kept.filter((c) => c.lineCorrected).length,
        model: modelPass.model,
        model_skipped: modelPass.skipped,
        cost_usd: modelPass.costUsd,
        duration_ms: Date.now() - startedAt,
      },
      drops: dropped,
    };
  }

  /** Accept / reject, or edit the rule text of a single candidate. */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConvention,
  ): Promise<Convention | undefined> {
    const next: UpdateConvention =
      patch.rule === undefined
        ? patch
        : {
            ...patch,
            // A rewritten rule re-derives its dedupe key, so a hand-written
            // rule is recognised as "already judged" by the next scan exactly
            // like a generated one.
            ruleKey: normalizeRule(patch.rule),
            // …and drops the model's rationale unless a new one is supplied.
            // That sentence was written to justify the PREVIOUS wording; kept,
            // it ends up in the skill body contradicting the rule above it.
            ...(patch.rationale === undefined ? { rationale: null } : {}),
          };
    const row = await this.repo.update(workspaceId, id, next);
    return row ? toConventionDto(row) : undefined;
  }

  /**
   * The pre-filled Skill the "Create skill" modal opens with, merged from the
   * repo's accepted conventions. Rendering it on the server keeps one
   * implementation of the merge; the client edits the draft freely before save.
   */
  async skillDraft(workspaceId: string, repoId: string): Promise<ConventionSkillDraft> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const accepted = (await this.repo.listAccepted(workspaceId, repoId)).map(toConventionDto);
    return {
      name: skillNameFor(repo.fullName),
      description: buildSkillDescription(repo.fullName, accepted.length),
      type: SKILL_TYPE,
      body: buildSkillBody(repo.fullName, accepted),
      convention_ids: accepted.map((c) => c.id),
    };
  }

  /**
   * Save the (possibly edited) draft as a real Skill and optionally attach it
   * to agents. `source: 'extracted'` is set here, not accepted from the
   * client — it records how the body came to exist, which the Skills Lab shows
   * and a later provenance audit depends on.
   */
  async createSkill(
    workspaceId: string,
    repoId: string,
    input: CreateSkillFromConventionsInput,
  ): Promise<CreateSkillFromConventionsResult> {
    await this.requireRepo(workspaceId, repoId);

    const skill = await this.container.skillsService.create(workspaceId, {
      name: input.name,
      type: input.type ?? SKILL_TYPE,
      body: input.body,
      source: 'extracted',
      ...(input.description !== undefined ? { description: input.description } : {}),
      // A skill the user just reviewed rule-by-rule is trusted by default,
      // unlike an imported one; `enabled` is still theirs to override.
      enabled: input.enabled ?? true,
    });

    const linked: string[] = [];
    for (const agentId of input.agentIds ?? []) {
      const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
      if (!agent) continue; // ignore an agent from another workspace rather than failing the save
      const existing = await this.container.agentsRepo.skillIdsForAgent(agentId);
      if (existing.includes(skill.id)) {
        linked.push(agentId);
        continue;
      }
      await this.container.agentsRepo.linkSkill(agentId, skill.id, existing.length);
      linked.push(agentId);
    }

    return { skill, linked_agent_ids: linked };
  }

  // -------------------------------------------------------------------------

  /**
   * Top-ranked source files from repo-intel, TOPPED UP from a size-ranked walk
   * of the clone whenever the index yields fewer than the sample budget.
   *
   * Topping up rather than falling back only on an empty list is the whole
   * point: repo-intel's indexer understands TS/JS, so on a polyglot repo it
   * reports `status: 'full'` having ranked a handful of files — a C#/Blazor
   * repo of 51 `.cs` files indexed exactly one stray `.js`, and an all-or-
   * nothing fallback then fed the model that single file and nothing else.
   * The count is also measured on files actually READ, not on paths returned,
   * so a stale index pointing at deleted files tops up too.
   */
  private async collectSamples(repoId: string, clonePath: string): Promise<SampleFile[]> {
    const ranked = await this.container.repoIntel
      .getConventionSamples(repoId, SAMPLE_FILE_COUNT)
      .catch(() => [] as string[]);
    const samples = await readSourceSamples(clonePath, ranked);
    if (samples.length >= SAMPLE_FILE_COUNT) return samples;

    const seen = new Set(samples.map((s) => s.path));
    // Over-fetch: the walk is size-ranked and cheap, and its head may overlap
    // whatever the index already gave us.
    const walked = await walkSourceFiles(clonePath, SAMPLE_FILE_COUNT * 2).catch(() => []);
    const extra = walked
      .filter((p) => !seen.has(p))
      .slice(0, SAMPLE_FILE_COUNT - samples.length);
    return [...samples, ...(await readSourceSamples(clonePath, extra))];
  }

  private async requireRepo(workspaceId: string, repoId: string) {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }
}
