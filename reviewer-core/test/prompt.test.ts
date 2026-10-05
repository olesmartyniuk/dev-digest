/**
 * assemblePrompt — PR description slot (the fix that was missing: the PR body
 * never reached the prompt). Pins rendering, omit-when-empty, untrusted-wrap,
 * truncation, and ordering (before the diff).
 */
import { describe, it, expect } from 'vitest';
import {
  assemblePrompt,
  INTENT_SCOPE_RULE,
  PROJECT_CONTEXT_RULE,
  capProjectContext,
  renderProjectContextBlock,
  MAX_PROJECT_CONTEXT_CHARS,
} from '../src/prompt.js';

function userOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  const { messages } = assemblePrompt(parts);
  return messages[1]!.content;
}

function systemOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  return assemblePrompt(parts).messages[0]!.content;
}

describe('assemblePrompt — shared injection guard (server + CI)', () => {
  const sys = systemOf({ system: 'AGENT-SYS', diff: 'DIFF' });

  it('appends the guard to the agent system prompt', () => {
    expect(sys.startsWith('AGENT-SYS')).toBe(true);
    expect(sys).toMatch(/<untrusted>.*DATA to be analyzed/s);
  });

  it('forbids "intentional/test/demo" claims from descoping the review', () => {
    // The defense that replaced the keyword sanitizer: a general, trusted,
    // language-agnostic rule — not text parsing of untrusted input.
    expect(sys).toMatch(/test fixture|intentional|demo/i);
    expect(sys).toMatch(/never reduce|never .*descope|REPORT it/i);
    expect(sys).toMatch(/any language/i);
  });
});

describe('assemblePrompt — ## Skills / rules (L02)', () => {
  it('renders one block per linked skill body, in order, joined by a blank line', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      skills: ['# Rubric A\nCheck branch coverage.', '# Rubric B\nCheck breaking API changes.'],
    });
    const user = messages[1]!.content;
    expect(user).toContain('## Skills / rules');
    expect(user).toContain('# Rubric A\nCheck branch coverage.\n\n# Rubric B\nCheck breaking API changes.');
    // Ordering: Skills renders before Diff (and, per the assembly order, before memory too).
    expect(user.indexOf('## Skills / rules')).toBeLessThan(user.indexOf('## Diff to review'));
    expect(assembly.skills).toBe(
      '# Rubric A\nCheck branch coverage.\n\n# Rubric B\nCheck breaking API changes.',
    );
  });

  it('omits the section when skills is undefined or an empty array (no behaviour change)', () => {
    const base = userOf({ system: 'sys', diff: 'DIFF' });
    expect(base).not.toContain('## Skills / rules');
    expect(assemblePrompt({ system: 'sys', diff: 'DIFF' }).assembly.skills).toBeNull();
    expect(userOf({ system: 'sys', diff: 'DIFF', skills: [] })).toBe(base);
  });

  it('a disabled/unlinked skill contributes nothing — the caller simply omits it from the array', () => {
    // The engine has no notion of "enabled"; the server filters before calling
    // in. Passing only the still-enabled bodies is indistinguishable, prompt-
    // wise, from that skill never having existed for this run.
    const withOne = userOf({ system: 'sys', diff: 'DIFF', skills: ['# Rubric A'] });
    const withNone = userOf({ system: 'sys', diff: 'DIFF', skills: [] });
    expect(withOne).toContain('# Rubric A');
    expect(withNone).not.toContain('# Rubric A');
  });
});

describe('assemblePrompt — ## PR description', () => {
  it('renders the section (untrusted-wrapped) before the diff when present', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      prDescription: 'Adds rate limiting to the public /api endpoints.',
    });
    const user = messages[1]!.content;
    expect(user).toContain('## PR description');
    expect(user).toContain('<untrusted source="pr-description">');
    expect(user).toContain('Adds rate limiting to the public /api endpoints.');
    expect(user.indexOf('## PR description')).toBeLessThan(user.indexOf('## Diff to review'));
    expect(assembly.pr_description).toContain('Adds rate limiting');
  });

  it('omits the section when prDescription is undefined or blank (no behaviour change)', () => {
    expect(userOf({ system: 'sys', diff: 'DIFF' })).not.toContain('## PR description');
    expect(assemblePrompt({ system: 'sys', diff: 'DIFF' }).assembly.pr_description ?? null).toBeNull();
    expect(userOf({ system: 'sys', diff: 'DIFF', prDescription: '   ' })).not.toContain(
      '## PR description',
    );
  });

  it('truncates a huge body to the 4k cap', () => {
    const { assembly } = assemblePrompt({
      system: 'sys',
      diff: 'D',
      prDescription: 'x'.repeat(10_000),
    });
    expect((assembly.pr_description as string).length).toBe(4000);
  });
});

describe('assemblePrompt — ## PR intent (L03)', () => {
  it('renders the section immediately after ## PR description, and appends INTENT_SCOPE_RULE to the system message', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      prDescription: 'Adds rate limiting.',
      intentBrief: 'Intent: add rate limiting.\nConfidence: high — clear.',
    });
    const user = messages[1]!.content;
    expect(user).toContain('## PR intent');
    expect(user).toContain('<untrusted source="pr-intent">');
    expect(user).toContain('Intent: add rate limiting.');
    // Ordering: PR description, then PR intent, both before the diff.
    const iDesc = user.indexOf('## PR description');
    const iIntent = user.indexOf('## PR intent');
    const iDiff = user.indexOf('## Diff to review');
    expect(iDesc).toBeLessThan(iIntent);
    expect(iIntent).toBeLessThan(iDiff);

    expect(messages[0]!.content).toContain(INTENT_SCOPE_RULE);
    expect(assembly.intent).toBe('Intent: add rate limiting.\nConfidence: high — clear.');
  });

  it('omits the section AND the scope rule when intentBrief is undefined (no behaviour change)', () => {
    const withoutIntent = assemblePrompt({ system: 'sys', diff: 'DIFF' });
    expect(withoutIntent.messages[1]!.content).not.toContain('## PR intent');
    expect(withoutIntent.messages[0]!.content).not.toContain(INTENT_SCOPE_RULE);
    expect(withoutIntent.assembly.intent).toBeNull();
  });

  it('a whitespace-only intentBrief produces a BYTE-IDENTICAL prompt to the no-intent baseline', () => {
    const baseline = assemblePrompt({ system: 'sys', diff: 'DIFF', prDescription: 'p' });
    const withWhitespace = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      prDescription: 'p',
      intentBrief: '   \n\t  ',
    });
    expect(withWhitespace).toEqual(baseline);
  });
});

describe('assemblePrompt — ## Project context (L05)', () => {
  it('with no specs, produces a BYTE-IDENTICAL prompt to today\'s (no rule, no section)', () => {
    const withoutSpecs = assemblePrompt({ system: 'sys', diff: 'DIFF' });
    const withEmptySpecs = assemblePrompt({ system: 'sys', diff: 'DIFF', specs: [] });
    expect(withEmptySpecs).toEqual(withoutSpecs);
    expect(withoutSpecs.messages[1]!.content).not.toContain('## Project context');
    expect(withoutSpecs.messages[0]!.content).not.toContain(PROJECT_CONTEXT_RULE);
    expect(withoutSpecs.assembly.specs).toBeNull();
  });

  it('renders the section (untrusted-wrapped, Source-prefixed by the caller) and appends the rule', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      specs: ['Source: docs/architecture.md\n\nModules must not import db/ directly.'],
    });
    const user = messages[1]!.content;
    expect(user).toContain('## Project context');
    expect(user).toContain('<untrusted source="spec-0">');
    expect(user).toContain('Source: docs/architecture.md');
    expect(user.indexOf('## Project context')).toBeLessThan(user.indexOf('## Diff to review'));
    expect(messages[0]!.content).toContain(PROJECT_CONTEXT_RULE);
    expect(assembly.specs).toContain('Source: docs/architecture.md');
  });

  it('caps a huge specs array: the crossing entry is sliced with the marker (or dropped), and truncated is true', () => {
    const big = 'x'.repeat(MAX_PROJECT_CONTEXT_CHARS);
    const { specs, truncated } = capProjectContext(['a'.repeat(100), big, 'c'.repeat(100)]);
    expect(truncated).toBe(true);
    // The first entry fit whole; the huge second entry crosses the limit and is
    // either sliced (with the marker) or dropped; the third never gets a turn.
    expect(specs[0]).toBe('a'.repeat(100));
    expect(specs.length).toBeLessThanOrEqual(2);
    if (specs.length === 2) {
      expect(specs[1]!.endsWith('…[truncated: project context size cap reached]')).toBe(true);
    }
    expect(specs.some((s) => s.startsWith('c'))).toBe(false);
  });

  it('is idempotent — capping an already-capped array returns it unchanged with truncated:false', () => {
    const once = capProjectContext(['a'.repeat(100), 'x'.repeat(MAX_PROJECT_CONTEXT_CHARS)]);
    expect(once.truncated).toBe(true);
    const twice = capProjectContext(once.specs);
    expect(twice.specs).toEqual(once.specs);
    expect(twice.truncated).toBe(false);
  });

  it('renderProjectContextBlock equals the section rendered inside assemblePrompt', () => {
    const specs = ['Source: docs/a.md\n\nRule A.', 'Source: docs/b.md\n\nRule B.'];
    const { messages } = assemblePrompt({ system: 'sys', diff: 'DIFF', specs });
    const section = renderProjectContextBlock(specs);
    expect(section).toBeDefined();
    expect(messages[1]!.content).toContain(section!);
  });

  it('drops empty/whitespace-only entries and reports truncated:true even when nothing was sliced', () => {
    // Regression: the plan requires dropped-empty entries to also flip
    // `truncated`, distinct from the size-cap slicing path exercised above.
    const { specs, truncated } = capProjectContext(['Source: docs/a.md\n\nReal content.', '   ', '']);
    expect(specs).toEqual(['Source: docs/a.md\n\nReal content.']);
    expect(truncated).toBe(true);
  });

  it('drops (rather than slices) the crossing entry when too little budget remains for a useful slice', () => {
    // Regression for the slice-vs-drop branch: when `remaining <= marker.length + 200`
    // the crossing entry is dropped whole, not sliced with a near-empty marker.
    const marker = '\n…[truncated: project context size cap reached]';
    const maxChars = 50 + marker.length + 100; // remaining before entry 2 = 150, below the 245ish threshold
    const first = 'a'.repeat(50);
    const second = 'b'.repeat(200);
    const { specs, truncated } = capProjectContext([first, second], maxChars);
    expect(specs).toEqual([first]);
    expect(truncated).toBe(true);
  });

  it('slices (rather than drops) the crossing entry when ample budget remains for a useful slice', () => {
    const marker = '\n…[truncated: project context size cap reached]';
    const maxChars = 50 + marker.length + 300; // remaining before entry 2 is comfortably above the threshold
    const first = 'a'.repeat(50);
    const second = 'b'.repeat(1000);
    const { specs, truncated } = capProjectContext([first, second], maxChars);
    expect(specs).toHaveLength(2);
    expect(specs[1]!.endsWith(marker)).toBe(true);
    expect(specs[1]!.length).toBeLessThan(second.length);
    expect(truncated).toBe(true);
  });
});
