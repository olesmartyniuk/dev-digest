import { describe, it, expect } from 'vitest';
import { defaultEnabledFor, isSkillBodyChange, toSkillDto } from '../src/modules/skills/helpers.js';
import type { SkillRow } from '../src/db/rows.js';

describe('defaultEnabledFor', () => {
  it('a manually-authored skill defaults to enabled', () => {
    expect(defaultEnabledFor('manual')).toBe(true);
  });

  it('an imported/community/extracted skill defaults to disabled pending vetting', () => {
    expect(defaultEnabledFor('imported_url')).toBe(false);
    expect(defaultEnabledFor('community')).toBe(false);
    expect(defaultEnabledFor('extracted')).toBe(false);
  });
});

describe('isSkillBodyChange', () => {
  const existing = { body: 'old body' };

  it('true when the patch changes the body', () => {
    expect(isSkillBodyChange(existing, { body: 'new body' })).toBe(true);
  });

  it('false when the patch omits body', () => {
    expect(isSkillBodyChange(existing, {})).toBe(false);
  });

  it('false when the patch sets the same body', () => {
    expect(isSkillBodyChange(existing, { body: 'old body' })).toBe(false);
  });
});

describe('toSkillDto', () => {
  it('maps a persisted row to the public Skill DTO', () => {
    const row: SkillRow = {
      id: 'skill-1',
      workspaceId: 'ws-1',
      name: 'Test Quality Rubric',
      description: 'Checklist for coverage gaps.',
      type: 'rubric',
      source: 'manual',
      body: '# Rubric',
      enabled: true,
      version: 1,
      evidenceFiles: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    expect(toSkillDto(row)).toEqual({
      id: 'skill-1',
      name: 'Test Quality Rubric',
      description: 'Checklist for coverage gaps.',
      type: 'rubric',
      source: 'manual',
      body: '# Rubric',
      enabled: true,
      version: 1,
      evidence_files: null,
    });
  });
});
