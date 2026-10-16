import { readFile, writeFile } from 'node:fs/promises';
import { OpenRouterProvider } from '@devdigest/reviewer-core';
import type { CiPostAs } from '@devdigest/shared';
import { createGitHub } from './github.js';
import { runAgent } from './run.js';

const POST_AS: readonly string[] = ['github_review', 'pr_comment', 'none'];
const RESULT_FILE = 'devdigest-result.json';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const manifestPath = arg('manifest');
  const postAs = arg('post-as') ?? 'github_review';
  if (!manifestPath || !POST_AS.includes(postAs)) {
    console.log('usage: agent-runner --manifest <path> --post-as <github_review|pr_comment|none>');
    return 2;
  }
  const { exitCode, result } = await runAgent({
    env: process.env,
    readFile: (p) => readFile(p, 'utf8').catch(() => null),
    github: createGitHub(process.env),
    makeLlm: (key) => new OpenRouterProvider(key),
    log: (m) => console.log(m),
    now: () => new Date(),
    args: { manifestPath, postAs: postAs as CiPostAs },
  });
  if (result) await writeFile(RESULT_FILE, JSON.stringify(result, null, 2), 'utf8');
  return exitCode;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.log(`DevDigest runner crashed: ${(e as Error).message}`);
    process.exit(1);
  },
);
