import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('uses defaults when no env vars are set', () => {
    const cfg = loadConfig({});
    expect(cfg).toEqual({
      apiBase: 'http://localhost:3001',
      requestTimeoutMs: 15_000,
      pollIntervalMs: 3_000,
      defaultRunTimeoutMs: 300_000,
    });
  });

  it('clamps an out-of-range value', () => {
    const cfg = loadConfig({ DEVDIGEST_MCP_POLL_INTERVAL_MS: '999999' });
    expect(cfg.pollIntervalMs).toBe(30_000);
  });

  it('strips a trailing slash from the api base', () => {
    const cfg = loadConfig({ DEVDIGEST_API_BASE: 'http://localhost:4000/' });
    expect(cfg.apiBase).toBe('http://localhost:4000');
  });

  it('throws for a non-http(s) protocol', () => {
    expect(() => loadConfig({ DEVDIGEST_API_BASE: 'ftp://x' })).toThrow();
  });
});
