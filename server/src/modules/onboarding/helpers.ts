import { Onboarding, type OnboardingTour } from '@devdigest/shared';
import {
  DIAGRAM_SECTION_KINDS,
  LIMITED_MIN_FILES_INDEXED,
  LIMITED_MIN_TOP_FILES,
  MAX_LINKS_PER_SECTION,
  SECTION_ORDER,
} from './constants.js';
import type { StoredTour } from './types.js';

/**
 * Onboarding Tour (SPEC-02 / L05) — pure helpers. No fs, no db, no Container,
 * no Fastify (`no-domain-outward`) — everything here is deterministic given
 * its arguments, so it's unit-tested without a clone or a database.
 */

/** AC-14 — a thin index degrades the tour; flag it rather than pretend otherwise. */
export function isLimitedData(i: {
  filesIndexed: number;
  criticalPathCount: number;
  topFileCount: number;
}): boolean {
  return (
    i.filesIndexed < LIMITED_MIN_FILES_INDEXED ||
    (i.criticalPathCount === 0 && i.topFileCount < LIMITED_MIN_TOP_FILES)
  );
}

/** One chain per line, `a → b → c`, or `'(none)'` when there are no chains. */
export function formatCriticalPaths(paths: string[][]): string {
  if (paths.length === 0) return '(none)';
  return paths.map((chain) => chain.join(' → ')).join('\n');
}

/** A numbered list, or `'(none)'` when there are no files. */
export function formatTopFiles(paths: string[]): string {
  if (paths.length === 0) return '(none)';
  return paths.map((p, i) => `${i + 1}. ${p}`).join('\n');
}

/** Trims, strips surrounding backticks, a leading `./` and a leading `/`. */
export function normalizeLinkPath(p: string): string {
  let out = p.trim().replace(/^`|`$/g, '').trim();
  if (out.startsWith('./')) out = out.slice(2);
  else if (out.startsWith('/')) out = out.slice(1);
  return out;
}

interface DraftSection {
  kind: string;
  title: string;
  body: string;
  diagram: string | null;
  links: { label: string; path: string }[];
}

/** Strip a leading ```mermaid / ``` fence (and a trailing fence) from a diagram string. */
function stripDiagramFence(diagram: string): string {
  let out = diagram.trim();
  out = out.replace(/^```(?:mermaid)?\s*\n?/, '');
  out = out.replace(/\n?```\s*$/, '');
  return out.trim();
}

/**
 * Normalize the model's raw draft into the stored `Onboarding` shape, or
 * `null` when any of the 5 fixed kinds is missing from the draft.
 *
 *  - Picks the FIRST section per kind and emits them in `SECTION_ORDER`.
 *  - Forces `diagram` to `null` unless the kind allows one and the trimmed
 *    diagram is non-empty, stripping a leading mermaid fence first.
 *  - Normalizes each link path, drops empty-after-normalization links, and
 *    caps at `MAX_LINKS_PER_SECTION`.
 */
export function normalizeTour(draft: { sections: DraftSection[] }): Onboarding | null {
  const byKind = new Map<string, DraftSection>();
  for (const section of draft.sections) {
    if (!byKind.has(section.kind)) byKind.set(section.kind, section);
  }

  const sections = [];
  for (const kind of SECTION_ORDER) {
    const section = byKind.get(kind);
    if (!section) return null;

    const allowsDiagram = (DIAGRAM_SECTION_KINDS as readonly string[]).includes(kind);
    const trimmedDiagram = section.diagram?.trim();
    const diagram =
      allowsDiagram && trimmedDiagram ? stripDiagramFence(trimmedDiagram) || null : null;

    const links = section.links
      .map((l) => ({ label: l.label, path: normalizeLinkPath(l.path) }))
      .filter((l) => l.path.length > 0)
      .slice(0, MAX_LINKS_PER_SECTION);

    sections.push({
      kind,
      title: section.title,
      body: section.body,
      diagram,
      links,
    });
  }

  const parsed = Onboarding.safeParse({ sections });
  return parsed.success ? parsed.data : null;
}

/** All normalized link paths across every section. */
export function tourLinkPaths(o: Onboarding): Set<string> {
  const set = new Set<string>();
  for (const section of o.sections) {
    for (const link of section.links) {
      set.add(normalizeLinkPath(link.path));
    }
  }
  return set;
}

/**
 * Rejects an empty path, a backslash, a leading `/`, a drive letter
 * (`C:/...`), and any `..`/`.`/empty path segment.
 */
export function isSafeRelPath(p: string): boolean {
  if (!p) return false;
  if (p.includes('\\')) return false;
  if (p.startsWith('/')) return false;
  if (/^[A-Za-z]:/.test(p)) return false;
  const segments = p.split('/');
  if (segments.some((s) => s === '..' || s === '.' || s === '')) return false;
  return true;
}

/** Map a stored tour (or its absence) + the derived `limited` flag to the wire DTO. */
export function toTourDto(
  repoId: string,
  stored: StoredTour | null,
  limited: boolean,
): OnboardingTour {
  if (!stored) {
    return { repo_id: repoId, status: 'not_generated', tour: null, generated_at: null, limited_data: false };
  }
  return {
    repo_id: repoId,
    status: 'ready',
    tour: stored.onboarding,
    generated_at: stored.generatedAt.toISOString(),
    limited_data: limited,
  };
}
