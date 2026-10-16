import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError } from '../../platform/errors.js';

/**
 * The committed agent-runner bundle (`agent-runner/dist/agent-runner.cjs`),
 * copied verbatim into exported repositories. Read once and cached.
 */
const BUNDLE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'agent-runner',
  'dist',
  'agent-runner.cjs',
);

let cached: string | undefined;

export function loadRunnerBundle(): string {
  if (cached !== undefined) return cached;
  try {
    cached = readFileSync(BUNDLE_PATH, 'utf8');
  } catch {
    throw new ConfigError('agent-runner bundle not found — run "cd agent-runner && pnpm build"');
  }
  return cached;
}
