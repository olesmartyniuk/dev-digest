import { stringify } from 'yaml';
import { AgentManifest } from '@devdigest/shared';
import type {
  CiFailOn,
  CiFile,
  CiPostAs,
  CiTrigger,
  Provider,
  ReviewStrategy,
} from '@devdigest/shared';
import { CI_PATHS, MANIFEST_HEADER, TRIGGER_ORDER } from './constants.js';

/**
 * Pure, deterministic CI file generation: the same input always yields the same
 * bytes (NFR reproducibility). No I/O — the runner bundle text is passed in.
 */

export interface CiGenerateInput {
  agent: {
    name: string;
    provider: Provider;
    model: string;
    systemPrompt: string;
    strategy: ReviewStrategy;
    ciFailOn: CiFailOn;
    version: number;
  };
  agentSlug: string;
  skills: { slug: string; body: string }[];
  postAs: CiPostAs;
  triggers: CiTrigger[];
  runnerBundle: string;
}

/** The manifest the runner will read — validated through the shared schema. */
export function agentManifest(input: CiGenerateInput): AgentManifest {
  return AgentManifest.parse({
    name: input.agent.name,
    provider: input.agent.provider,
    model: input.agent.model,
    system_prompt: input.agent.systemPrompt,
    skills: input.skills.map((s) => s.slug),
    strategy: input.agent.strategy,
    ci_fail_on: input.agent.ciFailOn,
    version: input.agent.version,
  });
}

/** Serialize a manifest with a fixed key order. */
export function agentYaml(manifest: AgentManifest): string {
  const ordered = {
    name: manifest.name,
    provider: manifest.provider,
    model: manifest.model,
    version: manifest.version ?? null,
    strategy: manifest.strategy,
    ci_fail_on: manifest.ci_fail_on,
    skills: manifest.skills,
    system_prompt: manifest.system_prompt,
  };
  return `${MANIFEST_HEADER}\n${stringify(ordered, { lineWidth: 0 })}`;
}

/** Remove `{{` so an agent name can never open a GitHub expression in `name:`. */
const safeName = (s: string) => s.replace(/\{\{/g, '{ {');

export function workflowYaml(opts: {
  agentName: string;
  agentSlug: string;
  postAs: CiPostAs;
  triggers: CiTrigger[];
}): string {
  const types = TRIGGER_ORDER.filter((t) => opts.triggers.includes(t)).join(', ');
  const slug = opts.agentSlug;
  return `${[
    `name: ${JSON.stringify(`DevDigest review: ${safeName(opts.agentName)}`)}`,
    'on:',
    '  pull_request:',
    `    types: [${types}]`,
    'permissions:',
    '  contents: read',
    '  pull-requests: write',
    'jobs:',
    '  review:',
    '    runs-on: ubuntu-latest',
    '    env:',
    // Fork PRs get no repository secrets — skip the run (the check still passes).
    '      SAME_REPO: ${{ github.event.pull_request.head.repo.full_name == github.repository }}',
    '    steps:',
    '      - name: Skip fork pull requests',
    "        if: env.SAME_REPO != 'true'",
    `        run: 'echo "DevDigest: skipping review - PR comes from a fork; repository secrets are unavailable."'`,
    '      - uses: actions/checkout@v4',
    "        if: env.SAME_REPO == 'true'",
    '        with:',
    '          ref: ${{ github.event.pull_request.head.sha }}',
    '      - uses: actions/setup-node@v4',
    "        if: env.SAME_REPO == 'true'",
    '        with:',
    '          node-version: 22',
    '      - name: Run DevDigest review',
    "        if: env.SAME_REPO == 'true'",
    `        run: node ${CI_PATHS.runner} --manifest ${CI_PATHS.agent(slug)} --post-as ${opts.postAs}`,
    '        env:',
    '          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}',
    '          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}',
    '      # Future: replace the run step above with the published action',
    '      # - uses: devdigest/review-action@v1',
    '      #   with:',
    '      #     openrouter-key: ${{ secrets.OPENROUTER_API_KEY }}',
    '      - uses: actions/upload-artifact@v4',
    "        if: always() && env.SAME_REPO == 'true'",
    '        with:',
    `          name: devdigest-result-${slug}-\${{ github.run_id }}-\${{ github.run_attempt }}`,
    '          path: devdigest-result.json',
    '          if-no-files-found: ignore',
  ].join('\n')}\n`;
}

/** Manifest, skills (link order), memory, runner bundle, workflow — only the workflow is editable. */
export function generateCiFiles(input: CiGenerateInput): CiFile[] {
  const manifest = agentManifest(input);
  return [
    { path: CI_PATHS.agent(input.agentSlug), contents: agentYaml(manifest), editable: false },
    ...input.skills.map((s) => ({
      path: CI_PATHS.skill(s.slug),
      contents: s.body,
      editable: false,
    })),
    { path: CI_PATHS.memory, contents: '', editable: false },
    { path: CI_PATHS.runner, contents: input.runnerBundle, editable: false },
    {
      path: CI_PATHS.workflow(input.agentSlug),
      contents: workflowYaml({
        agentName: input.agent.name,
        agentSlug: input.agentSlug,
        postAs: input.postAs,
        triggers: input.triggers,
      }),
      editable: true,
    },
  ];
}
