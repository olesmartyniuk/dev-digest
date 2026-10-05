import { describe, it, expect } from 'vitest';
import {
  assembleContextPaths,
  formatContextEntry,
  isAttachablePath,
  matchContextRoot,
  toContextDocumentDto,
} from '../src/modules/context/helpers.js';
import { CONTEXT_SOURCE_PREFIX } from '../src/modules/context/constants.js';
import type { ScannedDoc } from '../src/modules/context/types.js';

const ROOTS = ['specs', 'docs', 'insights'];

describe('matchContextRoot', () => {
  it('matches a root at any depth, counting directory segments only', () => {
    expect(matchContextRoot('server/specs/api-contract.md', ROOTS)).toBe('specs');
    expect(matchContextRoot('docs/architecture.md', ROOTS)).toBe('docs');
    expect(matchContextRoot('a/b/insights/note.md', ROOTS)).toBe('insights');
  });

  it('returns null when no directory segment matches a configured root', () => {
    expect(matchContextRoot('src/x.md', ROOTS)).toBeNull();
  });

  it('does not match a root that only appears as the file name', () => {
    expect(matchContextRoot('src/specs.md', ROOTS)).toBeNull();
  });
});

describe('isAttachablePath', () => {
  it('accepts a repo-relative .md path under a configured root', () => {
    expect(isAttachablePath('docs/a.md', ROOTS)).toBe(true);
    expect(isAttachablePath('server/specs/api-contract.md', ROOTS)).toBe(true);
  });

  it('rejects traversal, absolute paths, backslashes, non-.md, and unrooted paths', () => {
    expect(isAttachablePath('../docs/a.md', ROOTS)).toBe(false);
    expect(isAttachablePath('/docs/a.md', ROOTS)).toBe(false);
    expect(isAttachablePath('docs\\a.md', ROOTS)).toBe(false);
    expect(isAttachablePath('docs/a.txt', ROOTS)).toBe(false);
    expect(isAttachablePath('src/a.md', ROOTS)).toBe(false);
  });

  it('rejects a traversal segment in the middle of the path, not just a leading one', () => {
    // A path like "docs/../x.md" resolves outside docs/ (and, post-resolution,
    // outside the configured roots) even though it textually starts with a
    // rooted segment — must still be rejected.
    expect(isAttachablePath('docs/../x.md', ROOTS)).toBe(false);
  });

  it('accepts an uppercase .MD extension (case-insensitive, matching the scanner)', () => {
    expect(isAttachablePath('docs/A.MD', ROOTS)).toBe(true);
  });
});

describe('assembleContextPaths', () => {
  it('AC-12a: skill lists in order, then the agent paths, deduped at first occurrence', () => {
    const result = assembleContextPaths(
      [
        ['a.md', 'b.md'],
        ['b.md', 'c.md'],
      ],
      ['c.md', 'd.md'],
    );
    expect(result).toEqual(['a.md', 'b.md', 'c.md', 'd.md']);
  });

  it('returns just the agent paths when there are no skill lists', () => {
    expect(assembleContextPaths([], ['a.md'])).toEqual(['a.md']);
  });
});

describe('formatContextEntry', () => {
  it('prefixes the path as a Source: line, then a blank line, then the content', () => {
    expect(formatContextEntry('docs/a.md', 'Rule text.')).toBe(
      `${CONTEXT_SOURCE_PREFIX}docs/a.md\n\nRule text.`,
    );
  });
});

describe('toContextDocumentDto', () => {
  it('derives chars/entry_chars from the document content', () => {
    const doc: ScannedDoc = {
      path: 'docs/a.md',
      name: 'a.md',
      root: 'docs',
      size: 10,
      content: 'Rule text.',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const dto = toContextDocumentDto(doc, 3, { agents: 1, skills: 2 });
    expect(dto.chars).toBe('Rule text.'.length);
    expect(dto.entry_chars).toBe(formatContextEntry('docs/a.md', 'Rule text.').length);
    expect(dto.tokens).toBe(3);
    expect(dto.used_by).toEqual({ agents: 1, skills: 2 });
  });
});
