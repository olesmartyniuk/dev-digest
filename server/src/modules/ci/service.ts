import { CiRunResult, RunTrace } from '@devdigest/shared';
import type {
  AgentCiOverview,
  CiExport,
  CiFile,
  CiInstallInput,
  CiInstallationView,
  CiPreview,
  CiPreviewInput,
  CiRunRow,
  CiSyncResult,
  RepoRef,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import {
  AppError,
  ExternalServiceError,
  NotFoundError,
  ValidationError,
} from '../../platform/errors.js';
import type { AgentRow } from '../../db/rows.js';
import {
  CI_BRANCH,
  CI_COMMIT_MESSAGE,
  CI_PATHS,
  CI_PR_TITLE,
  CI_RUNS_LIMIT,
  ERR_PROVIDER_UNSUPPORTED,
  INSTALL_FAILED_MESSAGE,
  PROVIDER_UNSUPPORTED_MESSAGE,
  RESULT_FILE,
  RESULT_MAX_BYTES,
  SYNC_FAILED_PREFIX,
} from './constants.js';
import { generateCiFiles } from './generator.js';
import {
  artifactPrefixFor,
  assertRepoRef,
  ciVerdict,
  isOutOfDate,
  runKey,
  runKeyFromArtifactName,
  slugify,
  uniqueSlug,
} from './helpers.js';
import { CiRepository, type CiRunDbRow, type InstallationRow, type RepoRow } from './repository.js';
import { loadRunnerBundle } from './runner-bundle.js';

/** Minimal logger shape so the service never imports `fastify`. */
export interface CiLogger {
  info(o: unknown, m?: string): void;
  warn(o: unknown, m?: string): void;
}

interface Bundle {
  agent: AgentRow;
  repoRow: RepoRow;
  ref: RepoRef;
  fullName: string;
  agentSlug: string;
  existing: InstallationRow | undefined;
  files: CiFile[];
}

/**
 * Export-to-CI use cases (SPEC-05): preview / install the generated bundle,
 * read an agent's CI overview, and ingest runner results from workflow
 * artifacts. GET paths never call GitHub; only `sync` and `install` do.
 */
export class CiService {
  private repo: CiRepository;

  constructor(private container: Container) {
    this.repo = new CiRepository(container.db);
  }

  // ---- preview ---------------------------------------------------------------

  async preview(workspaceId: string, agentId: string, input: CiPreviewInput): Promise<CiPreview> {
    const b = await this.buildBundle(workspaceId, agentId, input);

    let existing: string[] = [];
    try {
      const gh = await this.container.github();
      existing = await gh.existingPaths(
        b.ref,
        b.repoRow.defaultBranch,
        b.files.map((f) => f.path),
      );
    } catch {
      existing = []; // best-effort: never block the preview on GitHub
    }
    const exists = new Set(existing);

    return {
      repo: b.fullName,
      base_branch: b.repoRow.defaultBranch,
      agent_slug: b.agentSlug,
      files: b.files.map((f) => ({
        path: f.path,
        contents: f.contents,
        editable: f.editable,
        exists: exists.has(f.path),
      })),
      openrouter_key_ready: !!(await this.container.secrets.get('OPENROUTER_API_KEY')),
      existing_installation_id: b.existing?.id ?? null,
    };
  }

  // ---- install ---------------------------------------------------------------

  async install(workspaceId: string, agentId: string, input: CiInstallInput): Promise<CiExport> {
    const b = await this.buildBundle(workspaceId, agentId, input);

    // Only the workflow file is client-editable; every other file is server-generated.
    const workflowPath = CI_PATHS.workflow(b.agentSlug);
    const files = b.files.map((f) =>
      input.workflow !== undefined && f.path === workflowPath
        ? { ...f, contents: input.workflow }
        : f,
    );

    let prUrl: string | null = null;
    if (input.action === 'open_pr') {
      if (CI_BRANCH === b.repoRow.defaultBranch) {
        throw new ValidationError('The CI branch must differ from the default branch');
      }
      try {
        const gh = await this.container.github();
        await gh.commitFiles(b.ref, {
          branch: CI_BRANCH,
          base: b.repoRow.defaultBranch,
          message: CI_COMMIT_MESSAGE,
          files: files.map((f) => ({ path: f.path, contents: f.contents })),
        });
        const pr =
          (await gh.findOpenPr(b.ref, CI_BRANCH)) ??
          (await gh.openPullRequest(b.ref, {
            title: CI_PR_TITLE,
            head: CI_BRANCH,
            base: b.repoRow.defaultBranch,
            body: prBody(files),
          }));
        prUrl = pr.url;
      } catch {
        // Nothing is persisted on a failed install (AC-16).
        throw new ExternalServiceError(INSTALL_FAILED_MESSAGE);
      }
    }

    const row = await this.repo.upsertInstallation({
      agentId: b.agent.id,
      repo: b.fullName,
      targetType: 'gha',
      agentSlug: b.agentSlug,
      workflowVersion: b.agent.version,
      prUrl,
    });

    return {
      installation: {
        id: row.id,
        agent_id: row.agentId,
        repo: row.repo,
        target_type: row.targetType,
        installed_at: row.installedAt.toISOString(),
      },
      files,
      pr_url: prUrl,
    };
  }

  // ---- reads -----------------------------------------------------------------

  async agentOverview(workspaceId: string, agentId: string): Promise<AgentCiOverview> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    const installs = await this.repo.listInstallations(workspaceId, agentId);
    const latest = await this.repo.latestRunsByInstallation(workspaceId, [agentId]);
    const installations: CiInstallationView[] = installs.map((i) => {
      const run = latest.find((l) => l.repo === i.repo);
      return {
        id: i.id,
        agent_id: i.agentId,
        repo: i.repo,
        target_type: i.targetType,
        installed_at: i.installedAt.toISOString(),
        agent_slug: i.agentSlug,
        workflow_version: i.workflowVersion,
        out_of_date: isOutOfDate(i.workflowVersion, agent.version),
        pr_url: i.prUrl,
        latest_run: run
          ? {
              status: ciVerdict(run.status, run.findingsCount),
              ran_at: run.ranAt.toISOString(),
              blocking: (run.blockers ?? 0) > 0,
            }
          : null,
      };
    });

    const rows = await this.repo.listCiRuns(workspaceId, {
      agentId,
      limit: CI_RUNS_LIMIT,
    });
    return {
      agent_id: agent.id,
      agent_version: agent.version,
      ci_fail_on: agent.ciFailOn,
      installations,
      runs: rows.map(toRunRow),
    };
  }

  async listRuns(workspaceId: string): Promise<CiRunRow[]> {
    const rows = await this.repo.listCiRuns(workspaceId, { limit: CI_RUNS_LIMIT });
    return rows.map(toRunRow);
  }

  // ---- sync (ingest) -----------------------------------------------------------

  /**
   * Pull runner results from GitHub workflow artifacts. Never throws for GitHub
   * or credential failures — those come back as `error` so the page keeps
   * showing already-ingested runs (AC-29).
   */
  async sync(
    workspaceId: string,
    agentId: string | undefined,
    log: CiLogger,
  ): Promise<CiSyncResult> {
    let ingested = 0;
    let skipped = 0;
    try {
      const installs = (await this.repo.listInstallations(workspaceId, agentId)).filter(
        (i) => i.agentSlug && i.targetType === 'gha',
      );
      if (installs.length === 0) return { ingested, skipped, error: null };
      const gh = await this.container.github();

      for (const inst of installs) {
        const slug = inst.agentSlug!;
        const [owner = '', name = ''] = inst.repo.split('/');
        const ref = assertRepoRef(owner, name);
        const prefix = artifactPrefixFor(slug);
        const artifacts = await gh.listArtifacts(ref, prefix);

        const keyed = artifacts
          .map((a) => ({ a, key: runKeyFromArtifactName(a.name, prefix) }))
          .filter((x): x is { a: typeof x.a; key: string } => x.key != null);
        const known = await this.repo.knownRunKeys(keyed.map((x) => x.key));

        for (const { a, key } of keyed) {
          if (known.has(key)) continue;
          const text = await gh.readArtifactFile(ref, a.id, RESULT_FILE, RESULT_MAX_BYTES);
          const reject = (reason: string) => {
            log.warn({ artifact: a.name, reason }, 'ci: artifact rejected');
            skipped++;
          };
          if (text == null) {
            reject('result file missing or too large');
            continue;
          }
          let json: unknown;
          try {
            json = JSON.parse(text);
          } catch {
            reject('not valid JSON');
            continue;
          }
          const parsed = CiRunResult.safeParse(json);
          if (!parsed.success) {
            reject('does not match the result schema');
            continue;
          }
          const r = parsed.data;
          if (r.repository.toLowerCase() !== inst.repo.toLowerCase()) {
            reject('repository does not match the installation');
            continue;
          }
          if (r.agent_slug !== slug) {
            reject('agent does not match the installation');
            continue;
          }
          if (runKey(r) !== key) {
            reject('run id does not match the artifact name');
            continue;
          }
          if (await this.repo.insertCiRun(workspaceId, inst.agentId, r, buildTrace(r))) ingested++;
        }
      }
      return { ingested, skipped, error: null };
    } catch (e) {
      const reason = e instanceof Error ? e.message.slice(0, 140) : 'unknown error';
      log.warn({ err: reason }, 'ci: sync failed');
      return { ingested, skipped, error: `${SYNC_FAILED_PREFIX}: ${reason}` };
    }
  }

  // ---- shared ------------------------------------------------------------------

  /** Validate, then generate the bundle exactly as it will be committed. */
  private async buildBundle(
    workspaceId: string,
    agentId: string,
    input: CiPreviewInput,
  ): Promise<Bundle> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    if (agent.provider !== 'openrouter') {
      throw new AppError(ERR_PROVIDER_UNSUPPORTED, PROVIDER_UNSUPPORTED_MESSAGE, 409);
    }
    if (input.target !== 'gha') throw new ValidationError('Only GitHub Actions is supported');

    const repoRow = await this.repo.getRepo(workspaceId, input.repo_id);
    if (!repoRow) throw new NotFoundError('Repository not found');
    const ref = assertRepoRef(repoRow.owner, repoRow.name);
    const fullName = `${ref.owner}/${ref.name}`;

    const takenSkills = new Set<string>();
    const skills = (await this.container.agentsRepo.linkedSkills(agent.id))
      .filter((l) => l.skill.enabled)
      .map((l) => {
        const slug = uniqueSlug(slugify(l.skill.name), l.skill.id, takenSkills);
        takenSkills.add(slug);
        return { slug, body: l.skill.body };
      });

    const existing = await this.repo.findInstallation(agent.id, fullName, 'gha');
    let agentSlug = existing?.agentSlug;
    if (!agentSlug) {
      const others = await this.container.agentsRepo.list(workspaceId);
      const taken = new Set(others.filter((a) => a.id !== agent.id).map((a) => slugify(a.name)));
      agentSlug = uniqueSlug(slugify(agent.name), agent.id, taken);
    }

    const files = generateCiFiles({
      agent: {
        name: agent.name,
        provider: agent.provider,
        model: agent.model,
        systemPrompt: agent.systemPrompt,
        strategy: agent.strategy,
        ciFailOn: agent.ciFailOn,
        version: agent.version,
      },
      agentSlug,
      skills,
      postAs: input.post_as,
      triggers: input.triggers,
      runnerBundle: loadRunnerBundle(),
    });
    return { agent, repoRow, ref, fullName, agentSlug, existing, files };
  }
}

function prBody(files: CiFile[]): string {
  return [
    'Adds a DevDigest review agent to this repository.',
    '',
    ...files.map((f) => `- \`${f.path}\``),
    '',
    "Add `OPENROUTER_API_KEY` to the repository's Actions secrets before merging.",
  ].join('\n');
}

function toRunRow(r: CiRunDbRow): CiRunRow {
  return {
    id: r.id,
    ran_at: r.ranAt.toISOString(),
    repo: r.ciRepo,
    pr_number: r.ciPrNumber,
    agent_id: r.agentId,
    agent_name: r.agentName,
    status: ciVerdict(r.status, r.findingsCount),
    blocking: (r.blockers ?? 0) > 0,
    findings_count: r.findingsCount,
    cost_usd: r.costUsd,
    duration_ms: r.durationMs,
    job_url: r.ciJobUrl,
  };
}

function buildTrace(r: CiRunResult): RunTrace {
  return RunTrace.parse({
    config: {
      agent: r.agent,
      version: r.manifest_version != null ? String(r.manifest_version) : (r.version ?? ''),
      provider: 'openrouter',
      model: r.model,
      pr: r.pr_number ?? null,
      source: 'ci',
      manifest_version: r.manifest_version,
      commit_sha: r.commit_sha,
      dependencies: r.dependencies,
    },
    stats: {
      duration_ms: r.duration_ms ?? 0,
      tokens_in: r.tokens_in ?? 0,
      tokens_out: r.tokens_out ?? 0,
      cost_usd: r.cost_usd,
      findings: r.findings_count,
      grounding: '',
    },
    prompt_assembly: { system: '', user: '' },
    tool_calls: [],
    raw_output: '',
    memory_pulled: [],
    specs_read: [],
    log: [{ t: '00.00', kind: 'info', msg: `Ingested from GitHub Actions: ${r.job_url}` }],
  });
}
