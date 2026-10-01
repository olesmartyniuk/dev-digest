import type { DevDigestApi } from '../api/endpoints.js';
import type { McpConfig } from '../config.js';

/** Dependencies every tool handler receives — injectable for tests. */
export interface ToolDeps {
  api: DevDigestApi;
  config: McpConfig;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  now: () => number;
}
