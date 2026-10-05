import type {
  AgentContext,
  ContextListing,
  ContextPreview,
  InheritedContext,
  SkillContext,
  SpecFile,
} from '@devdigest/shared';
import { capProjectContext, MAX_PROJECT_CONTEXT_CHARS, renderProjectContextBlock } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import type { RunLogger } from '../../platform/run-logger.js';
import { CONTEXT_MAX_PREVIEW_BYTES } from './constants.js';
import { assembleContextPaths, formatContextEntry, isAttachablePath, toContextDocumentDto } from './helpers.js';
import { ContextRepository } from './repository.js';
import { cloneDirExists, readContextDoc, scanContextDocs, statContextDoc } from './scanner.js';
import type { ResolvedRunContext, ScannedDoc } from './types.js';

/**
 * Project Context (L05) — application layer. Orchestrates the repo-relative
 * `.md` scan (via `scanner.ts`), the attachment tables (via
 * `ContextRepository`), and run-time resolution of an agent's effective
 * project context (feeding reviewer-core's `specs` slot).
 *
 * Owns an in-memory per-repo scan cache (D8): `GET` serves it, `rescan`
 * forces a fresh one. Run time (`resolveForRun`) NEVER reads the cache — it
 * reads attached paths straight from disk, so a rescan can't change a run
 * already in flight or a trace already written. Must be a Container
 * singleton (`container.contextService`) so routes and the run executor
 * share the one cache.
 */
export class ContextService {
  private repo: ContextRepository;
  private cache = new Map<string, { docs: ScannedDoc[]; scannedAt: string }>();

  constructor(private container: Container) {
    this.repo = new ContextRepository(container.db);
  }

  /** `GET /repos/:id/context` and `POST /repos/:id/context/rescan`. */
  async listDocuments(
    workspaceId: string,
    repoId: string,
    opts: { rescan?: boolean } = {},
  ): Promise<ContextListing> {
    const repoRow = await this.repo.getRepo(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repository not found');

    const roots = this.container.config.contextRoots;
    const capChars = MAX_PROJECT_CONTEXT_CHARS;

    // AC-3 — a repo with no clone yet, or whose clone vanished from disk, is an
    // EMPTY state (200 + []), never an error.
    if (!repoRow.clonePath) {
      return { repo_id: repoId, clone_status: 'not_cloned', roots, documents: [], scanned_at: null, cap_chars: capChars };
    }
    if (!(await cloneDirExists(repoRow.clonePath))) {
      return { repo_id: repoId, clone_status: 'missing', roots, documents: [], scanned_at: null, cap_chars: capChars };
    }

    const cached = await this.scanCached(repoId, repoRow.clonePath, opts.rescan ?? false);

    // AC-18 — always live, never cached.
    const usedBy = await this.repo.usageCounts(workspaceId);
    const documents = cached.docs.map((doc) =>
      toContextDocumentDto(
        doc,
        this.container.tokenizer.count(doc.content),
        usedBy.get(doc.path) ?? { agents: 0, skills: 0 },
      ),
    );

    return { repo_id: repoId, clone_status: 'ready', roots, documents, scanned_at: cached.scannedAt, cap_chars: capChars };
  }

  /**
   * Onboarding (SPEC-02): the repo's scanned documents, as capped prompt
   * entries. Serves from the same scan cache as `GET /repos/:id/context`.
   * Never throws for a missing clone — returns empty.
   */
  async promptDocuments(
    workspaceId: string,
    repoId: string,
  ): Promise<{ entries: string[]; paths: string[]; truncated: boolean }> {
    const repoRow = await this.repo.getRepo(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repository not found');

    if (!repoRow.clonePath || !(await cloneDirExists(repoRow.clonePath))) {
      return { entries: [], paths: [], truncated: false };
    }

    const cached = await this.scanCached(repoId, repoRow.clonePath, false);
    const entries = cached.docs.map((doc) => formatContextEntry(doc.path, doc.content));
    const capped = capProjectContext(entries);
    const paths = cached.docs.slice(0, capped.specs.length).map((d) => d.path);

    return { entries: capped.specs, paths, truncated: capped.truncated };
  }

  /** Shared scan-cache read, used by both `listDocuments` and `promptDocuments`. */
  private async scanCached(
    repoId: string,
    clonePath: string,
    rescan = false,
  ): Promise<{ docs: ScannedDoc[]; scannedAt: string }> {
    const cached = this.cache.get(repoId);
    if (cached && !rescan) return cached;
    const roots = this.container.config.contextRoots;
    const docs = await scanContextDocs(clonePath, roots);
    const fresh = { docs, scannedAt: new Date().toISOString() };
    this.cache.set(repoId, fresh);
    return fresh;
  }

  /** `GET /repos/:id/context/file?path=` — the read-only raw-source preview (D3). */
  async readDocument(workspaceId: string, repoId: string, path: string): Promise<SpecFile> {
    const repoRow = await this.repo.getRepo(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repository not found');

    if (!isAttachablePath(path, this.container.config.contextRoots)) {
      throw new ValidationError('Not an attachable project-context path');
    }
    if (!repoRow.clonePath || !(await cloneDirExists(repoRow.clonePath))) {
      throw new ValidationError('The local clone for this repository is not ready');
    }

    const meta = await statContextDoc(repoRow.clonePath, path);
    if (!meta) throw new NotFoundError('Document not found');
    if (meta.size > CONTEXT_MAX_PREVIEW_BYTES) {
      throw new ValidationError('Document is too large to preview');
    }
    const content = await readContextDoc(repoRow.clonePath, path);
    if (content === null) throw new NotFoundError('Document not found');

    return { path, content, size: meta.size, updated_at: meta.updatedAt };
  }

  /** `GET /agents/:id/context`. */
  async getAgentContext(workspaceId: string, agentId: string): Promise<AgentContext | undefined> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) return undefined;

    const links = await this.container.agentsRepo.linkedSkills(agentId); // ordered
    const skillPathsMap = await this.repo.listSkillPathsFor(links.map((l) => l.skill.id));
    const inherited: InheritedContext[] = links.map((l) => ({
      skill_id: l.skill.id,
      skill_name: l.skill.name,
      enabled: l.skill.enabled,
      paths: skillPathsMap.get(l.skill.id) ?? [],
    }));

    const agentPaths = await this.repo.listAgentPaths(agentId);
    const enabledSkillLists = links
      .filter((l) => l.skill.enabled)
      .map((l) => skillPathsMap.get(l.skill.id) ?? []);
    const effective = assembleContextPaths(enabledSkillLists, agentPaths);

    return { agent_id: agentId, paths: agentPaths, inherited, effective };
  }

  /** `PUT /agents/:id/context`. */
  async setAgentContext(
    workspaceId: string,
    agentId: string,
    paths: string[],
  ): Promise<AgentContext | undefined> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    this.assertAttachable(paths);
    await this.repo.setAgentPaths(agentId, paths);
    return this.getAgentContext(workspaceId, agentId);
  }

  /** `GET /skills/:id/context`. */
  async getSkillContext(workspaceId: string, skillId: string): Promise<SkillContext | undefined> {
    const skill = await this.container.skillsService.get(workspaceId, skillId);
    if (!skill) return undefined;
    const paths = await this.repo.listSkillPaths(skillId);
    return { skill_id: skillId, paths };
  }

  /** `PUT /skills/:id/context`. */
  async setSkillContext(
    workspaceId: string,
    skillId: string,
    paths: string[],
  ): Promise<SkillContext | undefined> {
    const skill = await this.container.skillsService.get(workspaceId, skillId);
    if (!skill) return undefined;
    this.assertAttachable(paths);
    await this.repo.setSkillPaths(skillId, paths);
    return this.getSkillContext(workspaceId, skillId);
  }

  /** `GET /skills/:id/context/preview?repo_id=` — the only agent/skill-level "serializes as" preview (AC-9). */
  async previewSkillContext(
    workspaceId: string,
    skillId: string,
    repoId: string,
  ): Promise<ContextPreview | undefined> {
    const skill = await this.container.skillsService.get(workspaceId, skillId);
    if (!skill) return undefined;

    const paths = await this.repo.listSkillPaths(skillId);
    const repoRow = await this.repo.getRepo(workspaceId, repoId);
    if (!repoRow?.clonePath || !(await cloneDirExists(repoRow.clonePath))) {
      return { clone_status: repoRow?.clonePath ? 'missing' : 'not_cloned', text: null, paths: [], missing: paths, truncated: false };
    }

    const readablePaths: string[] = [];
    const entries: string[] = [];
    const missing: string[] = [];
    for (const path of paths) {
      if (!isAttachablePath(path, this.container.config.contextRoots)) {
        missing.push(path);
        continue;
      }
      const content = await readContextDoc(repoRow.clonePath, path);
      if (content === null) {
        missing.push(path);
        continue;
      }
      readablePaths.push(path);
      entries.push(formatContextEntry(path, content));
    }

    const capped = capProjectContext(entries);
    const survivedPaths = readablePaths.slice(0, capped.specs.length);

    return {
      clone_status: 'ready',
      text: renderProjectContextBlock(capped.specs) ?? null,
      paths: survivedPaths,
      missing,
      truncated: capped.truncated,
    };
  }

  /**
   * Run-time resolution — feeds reviewer-core's `specs` slot. Independent of
   * the repo-intel toggle (same pattern as `buildSkillsDigest`). NEVER
   * throws: any failure degrades to "no project context" rather than failing
   * the run. Returns `undefined` so the caller omits `specs` entirely
   * (AC-11), matching the skills/callers/repoMap omit-when-empty contract.
   */
  async resolveForRun(input: {
    agentId: string;
    clonePath: string | null;
    log: Pick<RunLogger, 'info'>;
  }): Promise<ResolvedRunContext | undefined> {
    try {
      const links = await this.container.agentsRepo.linkedSkills(input.agentId);
      const enabledLinks = links.filter((l) => l.skill.enabled);
      const skillPathsMap = await this.repo.listSkillPathsFor(enabledLinks.map((l) => l.skill.id));
      const skillLists = enabledLinks.map((l) => skillPathsMap.get(l.skill.id) ?? []);
      const agentPaths = await this.repo.listAgentPaths(input.agentId);
      const effective = assembleContextPaths(skillLists, agentPaths);

      if (effective.length === 0) return undefined;

      if (!input.clonePath || !(await cloneDirExists(input.clonePath))) {
        input.log.info(`project context: clone unavailable — skipped ${effective.length} document(s)`);
        return undefined;
      }

      const roots = this.container.config.contextRoots;
      const readPaths: string[] = [];
      const entries: string[] = [];
      const skipped: { path: string; reason: string }[] = [];
      for (const path of effective) {
        if (!isAttachablePath(path, roots)) {
          const reason = 'not an attachable project-context path';
          skipped.push({ path, reason });
          input.log.info(`project context: skipped ${path} — ${reason}`);
          continue;
        }
        const content = await readContextDoc(input.clonePath, path);
        if (content === null) {
          const reason = 'not found in the clone';
          skipped.push({ path, reason });
          input.log.info(`project context: skipped ${path} — ${reason}`);
          continue;
        }
        readPaths.push(path);
        entries.push(formatContextEntry(path, content));
      }

      const capped = capProjectContext(entries);
      const paths = readPaths.slice(0, capped.specs.length);

      if (capped.truncated) {
        input.log.info(
          `project context: truncated to the ${MAX_PROJECT_CONTEXT_CHARS}-char cap — kept ${paths.length} of ${readPaths.length} document(s)`,
        );
      }
      const tokens = capped.specs.reduce((n, s) => n + this.container.tokenizer.count(s), 0);
      input.log.info(`project context: ${paths.length} document(s) attached, ~${tokens} token(s)`);

      return { specs: capped.specs, paths, truncated: capped.truncated, skipped };
    } catch (err) {
      input.log.info(`project context: failed — ${(err as Error).message}`);
      return undefined;
    }
  }

  private assertAttachable(paths: string[]): void {
    const roots = this.container.config.contextRoots;
    for (const path of paths) {
      if (!isAttachablePath(path, roots)) {
        throw new ValidationError(`"${path}" is not an attachable project-context path`);
      }
    }
  }
}
