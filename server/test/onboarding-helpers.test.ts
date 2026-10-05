import { describe, it, expect } from 'vitest';
import {
  formatCriticalPaths,
  formatTopFiles,
  isLimitedData,
  isSafeRelPath,
  normalizeLinkPath,
  normalizeTour,
  tourLinkPaths,
} from '../src/modules/onboarding/helpers.js';

describe('normalizeTour', () => {
  const draftSection = (kind: string, extra: Partial<Record<string, unknown>> = {}) => ({
    kind,
    title: `Title for ${kind}`,
    body: `Body for ${kind}`,
    diagram: null,
    links: [],
    ...extra,
  });

  it('reorders shuffled sections into SECTION_ORDER', () => {
    const shuffled = {
      sections: [
        draftSection('first_tasks'),
        draftSection('architecture'),
        draftSection('reading_path'),
        draftSection('how_to_run'),
        draftSection('critical_paths'),
      ],
    };
    const result = normalizeTour(shuffled);
    expect(result).not.toBeNull();
    expect(result!.sections.map((s) => s.kind)).toEqual([
      'architecture',
      'critical_paths',
      'how_to_run',
      'reading_path',
      'first_tasks',
    ]);
  });

  it('returns null when a kind is missing', () => {
    const missingFirstTasks = {
      sections: [
        draftSection('architecture'),
        draftSection('critical_paths'),
        draftSection('how_to_run'),
        draftSection('reading_path'),
      ],
    };
    expect(normalizeTour(missingFirstTasks)).toBeNull();
  });

  it('nulls diagram on non-architecture kinds and strips a mermaid fence', () => {
    const draft = {
      sections: [
        draftSection('architecture', { diagram: '```mermaid\nflowchart LR\nA --> B\n```' }),
        draftSection('critical_paths', { diagram: 'flowchart LR\nA --> B' }),
        draftSection('how_to_run'),
        draftSection('reading_path'),
        draftSection('first_tasks'),
      ],
    };
    const result = normalizeTour(draft);
    expect(result).not.toBeNull();
    const architecture = result!.sections.find((s) => s.kind === 'architecture')!;
    const criticalPaths = result!.sections.find((s) => s.kind === 'critical_paths')!;
    expect(architecture.diagram).toBe('flowchart LR\nA --> B');
    expect(criticalPaths.diagram).toBeNull();
  });

  it('caps links at 4 and normalizes link paths', () => {
    const links = [
      { label: 'a', path: './src/a.ts' },
      { label: 'b', path: '`src/a.ts`' },
      { label: 'c', path: 'src/b.ts' },
      { label: 'd', path: 'src/c.ts' },
      { label: 'e', path: 'src/d.ts' },
      { label: 'f', path: 'src/e.ts' },
    ];
    const draft = {
      sections: [
        draftSection('architecture'),
        draftSection('critical_paths'),
        draftSection('how_to_run'),
        draftSection('reading_path'),
        draftSection('first_tasks', { links }),
      ],
    };
    const result = normalizeTour(draft);
    expect(result).not.toBeNull();
    const firstTasks = result!.sections.find((s) => s.kind === 'first_tasks')!;
    expect(firstTasks.links).toHaveLength(4);
    expect(firstTasks.links[0]!.path).toBe('src/a.ts');
    expect(firstTasks.links[1]!.path).toBe('src/a.ts');
  });
});

describe('isLimitedData', () => {
  it('flags a thin index (filesIndexed below the floor)', () => {
    expect(isLimitedData({ filesIndexed: 9, criticalPathCount: 10, topFileCount: 15 })).toBe(true);
  });

  it('does NOT flag a well-indexed repo with zero critical paths (Windows file_edges bug)', () => {
    expect(
      isLimitedData({ filesIndexed: 455, criticalPathCount: 0, topFileCount: 15 }),
    ).toBe(false);
  });

  it('flags few files, no critical paths, and few top files', () => {
    expect(isLimitedData({ filesIndexed: 50, criticalPathCount: 0, topFileCount: 2 })).toBe(true);
  });
});

describe('isSafeRelPath', () => {
  it.each(['../x', '/etc/passwd', 'C:/x', 'a\\b', 'a//b', ''])('rejects %s', (p) => {
    expect(isSafeRelPath(p)).toBe(false);
  });

  it('accepts a normal repo-relative path', () => {
    expect(isSafeRelPath('src/app.ts')).toBe(true);
  });
});

describe('tourLinkPaths', () => {
  it('collects normalized link paths across all sections', () => {
    const onboarding = {
      sections: [
        {
          kind: 'architecture',
          title: 't',
          body: 'b',
          diagram: null,
          links: [{ label: 'l', path: './src/app.ts' }],
        },
        {
          kind: 'critical_paths',
          title: 't',
          body: 'b',
          diagram: null,
          links: [{ label: 'l', path: '`src/b.ts`' }],
        },
      ],
    };
    const paths = tourLinkPaths(onboarding as never);
    expect(paths).toEqual(new Set(['src/app.ts', 'src/b.ts']));
  });
});

describe('formatCriticalPaths / formatTopFiles', () => {
  it('formats chains and lists, with a (none) fallback', () => {
    expect(formatCriticalPaths([])).toBe('(none)');
    expect(formatCriticalPaths([['a', 'b', 'c']])).toBe('a → b → c');
    expect(formatTopFiles([])).toBe('(none)');
    expect(formatTopFiles(['a.ts', 'b.ts'])).toBe('1. a.ts\n2. b.ts');
  });
});
