import { z } from 'zod/v4';

/**
 * Process-env -> typed config. The API base comes ONLY from env, never from a
 * tool argument, so no tool input can redirect requests (no SSRF surface via
 * this server). There are no secrets here: the API needs no key, and provider
 * keys stay server-side (~/.devdigest/secrets.json).
 */
export interface McpConfig {
  apiBase: string; // no trailing slash
  requestTimeoutMs: number; // per HTTP call
  pollIntervalMs: number; // run_agent_on_pr poll cadence
  defaultRunTimeoutMs: number; // run_agent_on_pr overall wait when caller omits timeout_seconds
}

const DEFAULTS = {
  apiBase: 'http://localhost:3001',
  requestTimeoutMs: 15_000,
  pollIntervalMs: 3_000,
  defaultRunTimeoutMs: 300_000,
} as const;

const CLAMPS = {
  requestTimeoutMs: { min: 1_000, max: 120_000 },
  pollIntervalMs: { min: 500, max: 30_000 },
  defaultRunTimeoutMs: { min: 30_000, max: 900_000 },
} as const;

const intEnvVar = z.coerce.number().int();

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function readInt(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  bounds: { min: number; max: number },
): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = intEnvVar.safeParse(raw);
  if (!parsed.success) return fallback;
  return clamp(parsed.data, bounds.min, bounds.max);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const rawBase = env.DEVDIGEST_API_BASE ?? DEFAULTS.apiBase;
  let url: URL;
  try {
    url = new URL(rawBase);
  } catch {
    throw new Error(
      `DEVDIGEST_API_BASE "${rawBase}" is not a valid URL — set it to something like http://localhost:3001.`,
    );
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(
      `DEVDIGEST_API_BASE "${rawBase}" must use http: or https: (got "${url.protocol}").`,
    );
  }
  const apiBase = rawBase.replace(/\/+$/, '');

  return {
    apiBase,
    requestTimeoutMs: readInt(
      env,
      'DEVDIGEST_MCP_REQUEST_TIMEOUT_MS',
      DEFAULTS.requestTimeoutMs,
      CLAMPS.requestTimeoutMs,
    ),
    pollIntervalMs: readInt(
      env,
      'DEVDIGEST_MCP_POLL_INTERVAL_MS',
      DEFAULTS.pollIntervalMs,
      CLAMPS.pollIntervalMs,
    ),
    defaultRunTimeoutMs: readInt(
      env,
      'DEVDIGEST_MCP_RUN_TIMEOUT_MS',
      DEFAULTS.defaultRunTimeoutMs,
      CLAMPS.defaultRunTimeoutMs,
    ),
  };
}
