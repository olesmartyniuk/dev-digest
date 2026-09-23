import type { Skill, SkillSource } from '@devdigest/shared';
import type { SkillRow } from '../../db/rows.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping and the
 * enable-by-default / version-bump rules. No I/O.
 */

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as Skill['type'],
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/**
 * A manually-authored skill is trusted by default; anything that arrived
 * through an import path (file, URL, or a community catalog) is someone
 * else's instructions and stays disabled until a human vets it and flips it
 * on — this is the one place that policy lives.
 */
export function defaultEnabledFor(source: SkillSource): boolean {
  return source === 'manual';
}

/** Fields whose change bumps the skill's version (only `body` is versioned —
 *  `skill_versions` stores the body alone, so renaming/re-describing/re-typing
 *  a skill or toggling `enabled` does not create a new version). */
export interface SkillBodyChangePatch {
  body?: string;
}

export function isSkillBodyChange(
  existing: Pick<SkillRow, 'body'>,
  patch: SkillBodyChangePatch,
): boolean {
  return patch.body !== undefined && patch.body !== existing.body;
}
