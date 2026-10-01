import { describe, expect, it, vi } from 'vitest';
import type { Convention } from '@devdigest/shared';
import { DevDigestApiError } from '../src/api/client.js';
import type { DevDigestApi } from '../src/api/endpoints.js';
import { getConventionsHandler } from '../src/tools/get-conventions.js';
import type { ToolDeps } from '../src/tools/types.js';

function convention(overrides: Partial<Convention> = {}): Convention {
  return {
    id: 'c1',
    repo_id: 'repo1',
    category: 'naming',
    rule: 'Use camelCase',
    rationale: 'because',
    evidence: { path: 'src/x.ts', line: 1, snippet: 'const x' },
    confidence: 0.8,
    status: 'pending',
    origin: 'model',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function deps(listConventions: DevDigestApi['listConventions']): ToolDeps {
  const api = { listConventions } as unknown as DevDigestApi;
  return { api, config: {} as ToolDeps['config'], sleep: vi.fn(), now: () => 0 };
}

function payload(result: Awaited<ReturnType<typeof getConventionsHandler>>): Record<string, unknown> {
  const first = result.content[0];
  return JSON.parse(first && 'text' in first ? (first.text as string) : '{}');
}

const baseArgs = { repo_id: 'repo1', limit: 50, offset: 0, response_format: 'concise' as const };

describe('getConventionsHandler', () => {
  const conventions = [
    convention({ id: 'c1', status: 'accepted', category: 'naming', confidence: 0.5 }),
    convention({ id: 'c2', status: 'pending', category: 'testing', confidence: 0.9 }),
    convention({ id: 'c3', status: 'rejected', category: 'naming', confidence: 0.99 }),
  ];

  it('concise payload keys are exactly repo_id/total/next_offset/conventions, items have no id/origin/evidence', async () => {
    const p = payload(await getConventionsHandler({ ...baseArgs }, deps(async () => conventions)));
    expect(Object.keys(p).sort()).toEqual(['conventions', 'next_offset', 'repo_id', 'total']);
    const item = (p.conventions as Array<Record<string, unknown>>)[0]!;
    expect(Object.keys(item).sort()).toEqual(['category', 'confidence', 'rule', 'status']);
  });

  it('detailed items include id, origin and evidence', async () => {
    const p = payload(
      await getConventionsHandler({ ...baseArgs, response_format: 'detailed' }, deps(async () => conventions)),
    );
    const item = (p.conventions as Array<Record<string, unknown>>)[0]!;
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('origin');
    expect(item).toHaveProperty('evidence');
  });

  it('filters by status and category', async () => {
    const byStatus = payload(
      await getConventionsHandler({ ...baseArgs, status: 'accepted' }, deps(async () => conventions)),
    );
    expect((byStatus.conventions as unknown[]).length).toBe(1);

    const byCategory = payload(
      await getConventionsHandler({ ...baseArgs, category: 'naming' }, deps(async () => conventions)),
    );
    expect((byCategory.conventions as unknown[]).length).toBe(2);
  });

  it('notes when filters remove everything', async () => {
    const p = payload(
      await getConventionsHandler({ ...baseArgs, category: 'security' }, deps(async () => conventions)),
    );
    expect(p.conventions).toEqual([]);
    expect(p.note).toContain('drop status or category');
  });

  it('paginates', async () => {
    const p1 = payload(await getConventionsHandler({ ...baseArgs, limit: 2, offset: 0 }, deps(async () => conventions)));
    expect(p1.next_offset).toBe(2);
    const p2 = payload(await getConventionsHandler({ ...baseArgs, limit: 2, offset: 2 }, deps(async () => conventions)));
    expect(p2.next_offset).toBeNull();
  });

  it('notes when the repo has no conventions at all', async () => {
    const p = payload(await getConventionsHandler({ ...baseArgs }, deps(async () => [])));
    expect(p.note).toContain('Conventions page');
  });

  it('a 404 gives isError with the repo hint', async () => {
    const d = deps(async () => {
      throw new DevDigestApiError('Repo not found', 404);
    });
    const result = await getConventionsHandler({ ...baseArgs }, d);
    expect(result.isError).toBe(true);
    const first = result.content[0];
    const text = first && 'text' in first ? (first.text as string) : '';
    expect(text).toContain('a PR id will not work');
  });
});
