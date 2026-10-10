import { describe, it, expect } from 'vitest';
import type { Risk, RiskBrief } from '@devdigest/shared';
import {
  buildAllowedPaths,
  missingSources,
  sortRisksBySeverity,
  validateBrief,
} from '../src/modules/brief/helpers.js';
import { buildUserMessage } from '../src/modules/brief/generator.js';
import type { BriefFacts } from '../src/modules/brief/types.js';

/** Build a minimal valid Risk with overridable fields. */
function risk(partial: Partial<Risk> & { severity: Risk['severity'] }): Risk {
  return {
    kind: 'kind',
    title: 'title',
    explanation: 'explanation',
    file_refs: [],
    ...partial,
  };
}

describe('validateBrief', () => {
  const allowed = buildAllowedPaths(['src/a.ts', 'src/b.ts'], ['src/caller.ts']);

  it('(a) drops a risk with one invented ref, keeps the others, and rewrites ./src/a.ts to src/a.ts', () => {
    const draft: RiskBrief = {
      summary: 'summary',
      risks: [
        risk({ severity: 'high', file_refs: ['./src/a.ts'] }),
        risk({ severity: 'low', file_refs: ['src/invented.ts'] }),
      ],
      review_focus: [],
    };
    const { brief, droppedRisks } = validateBrief(draft, allowed);
    expect(droppedRisks).toBe(1);
    expect(brief.risks).toHaveLength(1);
    expect(brief.risks[0]!.file_refs).toEqual(['src/a.ts']);
  });

  it('(b) drops a risk with empty file_refs', () => {
    const draft: RiskBrief = {
      summary: 's',
      risks: [risk({ severity: 'high', file_refs: [] })],
      review_focus: [],
    };
    const { brief, droppedRisks } = validateBrief(draft, allowed);
    expect(droppedRisks).toBe(1);
    expect(brief.risks).toEqual([]);
  });

  it('(c) drops a focus entry whose file is not allowed, keeps the rest in order, and clamps line 0 to 1', () => {
    const draft: RiskBrief = {
      summary: 's',
      risks: [],
      review_focus: [
        { file: 'src/a.ts', line: 0, reason: 'r1' },
        { file: 'src/missing.ts', line: 5, reason: 'r2' },
        { file: 'src/b.ts', line: 3, reason: 'r3' },
      ],
    };
    const { brief, droppedFocus } = validateBrief(draft, allowed);
    expect(droppedFocus).toBe(1);
    expect(brief.review_focus.map((f) => f.file)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(brief.review_focus[0]!.line).toBe(1);
  });

  it('(d) when every entry is invalid it returns empty arrays with the summary kept, and does not throw', () => {
    const draft: RiskBrief = {
      summary: 'kept summary',
      risks: [risk({ severity: 'high', file_refs: ['nope.ts'] })],
      review_focus: [{ file: 'nope.ts', line: 1, reason: 'r' }],
    };
    const { brief } = validateBrief(draft, allowed);
    expect(brief.risks).toEqual([]);
    expect(brief.review_focus).toEqual([]);
    expect(brief.summary).toBe('kept summary');
  });

  it('(e) a blast-caller-only path is allowed', () => {
    const draft: RiskBrief = {
      summary: 's',
      risks: [risk({ severity: 'medium', file_refs: ['src/caller.ts'] })],
      review_focus: [],
    };
    const { brief, droppedRisks } = validateBrief(draft, allowed);
    expect(droppedRisks).toBe(0);
    expect(brief.risks).toHaveLength(1);
  });
});

describe('sortRisksBySeverity', () => {
  it('(f) gives high -> medium -> low, with ties in input order', () => {
    const risks = [
      risk({ severity: 'low', title: 'l1' }),
      risk({ severity: 'high', title: 'h1' }),
      risk({ severity: 'medium', title: 'm1' }),
      risk({ severity: 'high', title: 'h2' }),
    ];
    const sorted = sortRisksBySeverity(risks);
    expect(sorted.map((r) => r.title)).toEqual(['h1', 'h2', 'm1', 'l1']);
  });
});

describe('missingSources', () => {
  it('(g) returns the right combination for every input pair', () => {
    expect(missingSources({ hasIntent: false, blastAvailable: false })).toEqual(['intent', 'blast']);
    expect(missingSources({ hasIntent: true, blastAvailable: false })).toEqual(['blast']);
    expect(missingSources({ hasIntent: false, blastAvailable: true })).toEqual(['intent']);
    expect(missingSources({ hasIntent: true, blastAvailable: true })).toEqual([]);
  });
});

describe('buildUserMessage', () => {
  it('(h) wraps every section, contains no patch text, and has no PR title', () => {
    const facts: BriefFacts = {
      description: 'A description',
      intent: { intent: 'does a thing', inScope: ['x'], outOfScope: ['y'] },
      blast: { summary: 'blast summary', callers: [{ name: 'fn', file: 'src/caller.ts', line: 10 }] },
      files: [{ path: 'src/a.ts', additions: 1, deletions: 0, role: 'core' }],
      contextEntries: ['Source: docs/guide.md\n\nSome guide text'],
      contextTruncated: false,
    };
    const msg = buildUserMessage(facts);
    expect(msg).toContain('<untrusted source="pr-description">');
    expect(msg).toContain('diff-stats');
    expect(msg).toContain('context:0');

    // `BriefFacts` has no `title`/`patch` field today, but `buildUserMessage`
    // only sees whatever object it's handed — a future refactor that reads
    // extra fields off an unsafely-cast input could still leak them. Inject
    // decoy `title`/`patch`-like fields via a cast and prove the rendered
    // message never echoes them, so this is a real, falsifiable guarantee
    // rather than a trick that never actually runs.
    const factsWithDecoyFields = {
      ...facts,
      title: 'FAKE-TITLE-MARKER-XYZ',
      patch: '@@ -FAKE-PATCH-MARKER-XYZ',
    } as unknown as BriefFacts;
    const msgWithDecoys = buildUserMessage(factsWithDecoyFields);
    expect(msgWithDecoys).not.toContain('FAKE-TITLE-MARKER-XYZ');
    expect(msgWithDecoys).not.toContain('FAKE-PATCH-MARKER-XYZ');
  });
});
