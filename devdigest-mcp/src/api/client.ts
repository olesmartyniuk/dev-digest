import type { McpConfig } from '../config.js';

/**
 * HTTP client for the DevDigest API. Ports the behaviour of
 * client/src/lib/api.ts without importing it (that file lives in a different
 * package and is not on this package's dependency graph).
 */
export class DevDigestApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DevDigestApiError';
  }
}

export interface HttpClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown };
}

export function createHttpClient(
  cfg: Pick<McpConfig, 'apiBase' | 'requestTimeoutMs'>,
  fetchImpl: typeof fetch = fetch,
): HttpClient {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`${cfg.apiBase}${path}`, {
        ...init,
        headers: {
          // Only declare a JSON body when one is actually sent — an empty
          // JSON body trips Fastify's "Body cannot be empty" rejection.
          ...(init?.body != null ? { 'content-type': 'application/json' } : {}),
          ...(init?.headers ?? {}),
        },
        signal: AbortSignal.timeout(cfg.requestTimeoutMs),
      });
    } catch {
      throw new DevDigestApiError(
        `DevDigest API unreachable at ${cfg.apiBase} — start it with ./scripts/dev.sh, then retry.`,
        0,
        'network_error',
      );
    }

    if (!res.ok) {
      let code: string | undefined;
      let message = `${res.status} ${res.statusText}`;
      let details: unknown;
      try {
        const body = (await res.json()) as ErrorEnvelope;
        if (body?.error) {
          code = body.error.code;
          message = body.error.message ?? message;
          details = body.error.details;
        }
      } catch {
        /* non-JSON error body — fall back to "<status> <statusText>" */
      }
      throw new DevDigestApiError(message, res.status, code, details);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  };
}
