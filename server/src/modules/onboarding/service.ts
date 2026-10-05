import { FEATURE_MODELS, type OnboardingTour, type SpecFile } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { generateTour } from './generator.js';
import { isLimitedData, isSafeRelPath, normalizeLinkPath, toTourDto, tourLinkPaths } from './helpers.js';
import { cloneDirExists, readSourceFile, statSourceFile } from './reader.js';
import { OnboardingRepository } from './repository.js';
import { FEATURE_MODEL_ID, ONBOARDING_MAX_FILE_BYTES, TOP_FILES_COUNT } from './constants.js';

/**
 * Onboarding Tour (SPEC-02 / L05) — application layer. Orchestrates
 * repo-intel facts, Project Context documents and the single inline LLM call
 * (`generator.ts`), and persists the result through `OnboardingRepository`.
 *
 * Deliberately does NOT import `../context/` or `../settings/`
 * (`no-cross-module-reach`) — Project Context is reached through
 * `container.contextService`, and the feature-model override is read
 * locally by `OnboardingRepository` instead of the settings module.
 */
export class OnboardingService {
  private repo: OnboardingRepository;

  constructor(private container: Container) {
    this.repo = new OnboardingRepository(container.db);
  }

  /** `GET /repos/:id/onboarding`. */
  async get(workspaceId: string, repoId: string): Promise<OnboardingTour> {
    await this.requireRepo(workspaceId, repoId);
    const stored = await this.repo.getTour(repoId);
    if (!stored) return toTourDto(repoId, null, false);
    const limited = await this.limited(repoId);
    return toTourDto(repoId, stored, limited);
  }

  /** `POST /repos/:id/onboarding/generate`. */
  async generate(workspaceId: string, repoId: string): Promise<OnboardingTour> {
    const repoRow = await this.requireRepo(workspaceId, repoId);

    const state = await this.container.repoIntel.getIndexState(repoId);
    if (state.status !== 'full') {
      throw new AppError(
        'index_not_ready',
        'Indexing has not finished for this repository — the onboarding tour can be generated once it is fully indexed.',
        409,
        { index_status: state.status },
      );
    }

    const [repoMap, criticalPaths, topFiles, projectContext] = await Promise.all([
      this.container.repoIntel
        .getRepoMap(repoId)
        .then((r) => (r.degraded ? '' : r.text))
        .catch(() => ''),
      this.container.repoIntel.getCriticalPaths(repoId).catch(() => [] as string[][]),
      this.container.repoIntel.getTopFilesByRank(repoId, TOP_FILES_COUNT).catch(() => [] as string[]),
      this.container.contextService
        .promptDocuments(workspaceId, repoId)
        .catch(() => ({ entries: [] as string[], paths: [] as string[], truncated: false })),
    ]);

    const override = await this.repo.featureModelOverride(workspaceId);
    const def = FEATURE_MODELS.find((f) => f.id === FEATURE_MODEL_ID)!;
    const choice = override ?? { provider: def.defaultProvider, model: def.defaultModel };

    const onboarding = await generateTour(this.container, {
      facts: {
        repoFullName: repoRow.fullName,
        indexStatus: state.status,
        filesIndexed: state.filesIndexed,
        repoMapText: repoMap,
        criticalPaths,
        topFiles,
        contextEntries: projectContext.entries,
        contextTruncated: projectContext.truncated,
      },
      choice,
    });

    const stored = await this.repo.upsertTour(repoId, onboarding);
    return toTourDto(
      repoId,
      stored,
      isLimitedData({
        filesIndexed: state.filesIndexed,
        criticalPathCount: criticalPaths.length,
        topFileCount: topFiles.length,
      }),
    );
  }

  /** `GET /repos/:id/onboarding/file?path=`. */
  async readFile(workspaceId: string, repoId: string, path: string): Promise<SpecFile> {
    const repo = await this.requireRepo(workspaceId, repoId);

    if (!isSafeRelPath(path)) throw new ValidationError('Unsafe path');

    const stored = await this.repo.getTour(repoId);
    if (!stored || !tourLinkPaths(stored.onboarding).has(normalizeLinkPath(path))) {
      throw new NotFoundError('File is not part of this onboarding tour');
    }

    if (!repo.clonePath || !(await cloneDirExists(repo.clonePath))) {
      throw new ValidationError('The local clone for this repository is not ready');
    }

    const meta = await statSourceFile(repo.clonePath, path);
    if (!meta) throw new NotFoundError('File not found');
    if (meta.size > ONBOARDING_MAX_FILE_BYTES) {
      throw new ValidationError('File is too large to preview');
    }

    const content = await readSourceFile(repo.clonePath, path);
    if (content === null) throw new NotFoundError('File not found');

    return { path, content, size: meta.size, updated_at: meta.updatedAt };
  }

  private async limited(repoId: string): Promise<boolean> {
    const [state, criticalPaths, topFiles] = await Promise.all([
      this.container.repoIntel.getIndexState(repoId).catch(() => ({ filesIndexed: 0 })),
      this.container.repoIntel.getCriticalPaths(repoId).catch(() => [] as string[][]),
      this.container.repoIntel.getTopFilesByRank(repoId, TOP_FILES_COUNT).catch(() => [] as string[]),
    ]);
    return isLimitedData({
      filesIndexed: state.filesIndexed,
      criticalPathCount: criticalPaths.length,
      topFileCount: topFiles.length,
    });
  }

  private async requireRepo(workspaceId: string, repoId: string) {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }
}
