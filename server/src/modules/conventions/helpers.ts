import type { Convention, ConventionCategory } from '@devdigest/shared';
import type {
  CandidateConvention,
  DroppedConvention,
  SampleFile,
  VerificationOutcome,
  VerifiedConvention,
} from './types.js';
import {
  MAX_SAMPLE_CHARS,
  MAX_SAMPLE_LINES,
  MIN_CONFIDENCE,
  SKILL_NAME_SUFFIX,
} from './constants.js';

/**
 * Pure helpers for the Conventions Extractor: prompt rendering, the
 * code-level EVIDENCE GATE, and the accepted-conventions → Skill-body merge.
 *
 * Domain layer — no Fastify, Drizzle, adapters, container or `db/` imports
 * (`no-domain-outward`), which is also what makes the evidence gate directly
 * unit-testable against string fixtures.
 */

// ---------------------------------------------------------------------------
// Text normalization
// ---------------------------------------------------------------------------

/** Collapse whitespace so indentation differences never fail a snippet match. */
export function normalizeCode(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

/**
 * The dedupe key for a rule: lowercased, punctuation-stripped, whitespace
 * collapsed. "Always use async/await instead of .then() chains." and "always
 * use async await instead of then chains" collapse to the same key, so a
 * re-scan recognises a rule the user already accepted or rejected.
 */
export function normalizeRule(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** A short kebab-case anchor for a rule, used as its Skill-body heading. */
export function slugifyRule(rule: string, maxWords = 6): string {
  const words = normalizeRule(rule).split(' ').filter(Boolean).slice(0, maxWords);
  return words.join('-') || 'rule';
}

// ---------------------------------------------------------------------------
// Prompt rendering
// ---------------------------------------------------------------------------

/**
 * Render one sample with 1-based line numbers. The numbers are not decoration:
 * they are the only way the model can cite a line we can later verify, and they
 * cut "cited the wrong line" drops dramatically compared with a bare paste.
 */
export function renderSample(file: SampleFile): string {
  const numbered = file.content
    .split('\n')
    .map((line, i) => `${String(i + 1).padStart(4, ' ')} | ${line}`)
    .join('\n');
  const suffix = file.truncated ? '\n… (truncated)' : '';
  return `=== FILE: ${file.path} ===\n${numbered}${suffix}`;
}

/** Render the whole sample set as one untrusted block body. */
export function renderSamples(files: SampleFile[]): string {
  return files.map(renderSample).join('\n\n');
}

/** Truncate a file to the sample caps, reporting whether anything was cut. */
export function truncateSample(path: string, raw: string, maxLines = MAX_SAMPLE_LINES, maxChars = MAX_SAMPLE_CHARS): SampleFile {
  const allLines = raw.split('\n');
  let lines = allLines.slice(0, maxLines);
  let content = lines.join('\n');
  let truncated = allLines.length > maxLines;
  if (content.length > maxChars) {
    content = content.slice(0, maxChars);
    lines = content.split('\n');
    truncated = true;
  }
  return { path, content, lineCount: lines.length, truncated };
}

// ---------------------------------------------------------------------------
// Evidence gate
// ---------------------------------------------------------------------------

export interface SnippetMatch {
  line: number;
  corrected: boolean;
}

/**
 * Locate `snippet` inside `contentLines`, preferring the line the proposer
 * claimed.
 *
 * Returns `null` when the snippet appears nowhere — that candidate is a
 * hallucination and is dropped. When the snippet IS present but at a different
 * line, the citation is CORRECTED rather than dropped: an off-by-a-few line
 * number is the single most common defect in model-cited evidence, and dropping
 * those throws away rules that are demonstrably true of the file.
 */
export function findSnippetLine(
  contentLines: string[],
  snippet: string,
  claimedLine: number,
): SnippetMatch | null {
  const needle = firstMeaningfulLine(snippet);
  if (!needle) return null;

  const normalized = contentLines.map(normalizeCode);
  const claimedIdx = claimedLine - 1;
  if (claimedIdx >= 0 && claimedIdx < normalized.length && linesMatch(normalized[claimedIdx]!, needle)) {
    return { line: claimedLine, corrected: false };
  }

  // Exact (normalized) match anywhere wins over a loose containment match.
  const exact = normalized.findIndex((l) => l === needle);
  if (exact !== -1) return { line: exact + 1, corrected: true };

  const loose = normalized.findIndex((l) => linesMatch(l, needle));
  if (loose !== -1) return { line: loose + 1, corrected: true };

  return null;
}

/** First non-empty, non-comment-only line of a snippet, normalized. */
function firstMeaningfulLine(snippet: string): string | null {
  for (const raw of snippet.split('\n')) {
    const line = normalizeCode(raw);
    if (line.length < 4) continue;
    if (/^(\/\/|#|\*|\/\*)/.test(line)) continue;
    return line;
  }
  // A snippet that is nothing but a short line or a comment still gets one
  // chance — better a weak match than dropping a valid rule on formatting.
  const fallback = normalizeCode(snippet.split('\n')[0] ?? '');
  return fallback.length >= 2 ? fallback : null;
}

function linesMatch(fileLine: string, needle: string): boolean {
  if (!fileLine || !needle) return false;
  return fileLine === needle || fileLine.includes(needle) || needle.includes(fileLine);
}

/**
 * The evidence gate. A candidate is persisted only if:
 *   1. it cites a file that was actually sampled (not one the model invented),
 *   2. its snippet is found in that file's sampled content, and
 *   3. its confidence clears `MIN_CONFIDENCE`,
 *   4. and its rule is not a duplicate of one already kept or already judged.
 *
 * Everything else is reported in `dropped` with a reason — the extractor never
 * drops silently, mirroring the review pipeline's G3 invariant.
 */
export function verifyCandidates(
  candidates: CandidateConvention[],
  samples: SampleFile[],
  alreadyJudged: ReadonlySet<string> = new Set(),
): VerificationOutcome {
  const byPath = new Map(samples.map((s) => [s.path, s]));
  const kept: VerifiedConvention[] = [];
  const dropped: DroppedConvention[] = [];
  const seen = new Set<string>();

  for (const c of candidates) {
    const drop = (reason: DroppedConvention['reason']) =>
      dropped.push({ rule: c.rule, path: c.evidencePath, reason });

    if (c.confidence < MIN_CONFIDENCE) {
      drop('low_confidence');
      continue;
    }

    const ruleKey = normalizeRule(c.rule);
    if (!ruleKey) {
      drop('low_confidence');
      continue;
    }
    if (seen.has(ruleKey)) {
      drop('duplicate');
      continue;
    }
    if (alreadyJudged.has(ruleKey)) {
      drop('already_judged');
      continue;
    }

    const sample = byPath.get(c.evidencePath);
    if (!sample) {
      drop('file_not_sampled');
      continue;
    }

    const match = findSnippetLine(sample.content.split('\n'), c.evidenceSnippet, c.evidenceLine);
    if (!match) {
      drop('snippet_not_found');
      continue;
    }

    seen.add(ruleKey);
    kept.push({
      ...c,
      // Persist the line we VERIFIED, and the text actually at that line, so
      // the UI never shows a snippet that differs from the cited source.
      evidenceLine: match.line,
      evidenceSnippet: snippetAt(sample, match.line, c.evidenceSnippet),
      ruleKey,
      lineCorrected: match.corrected,
    });
  }

  return { kept, dropped };
}

/**
 * The real text at the verified line, extended to cover as many lines as the
 * proposed snippet had (capped), so the card shows genuine repo source rather
 * than the model's paraphrase of it.
 */
function snippetAt(sample: SampleFile, line: number, proposed: string): string {
  const lines = sample.content.split('\n');
  const span = Math.min(Math.max(proposed.split('\n').filter((l) => l.trim()).length, 1), 8);
  return lines
    .slice(line - 1, line - 1 + span)
    .join('\n')
    .replace(/\s+$/, '');
}

// ---------------------------------------------------------------------------
// Row → DTO
// ---------------------------------------------------------------------------

/**
 * The persisted shape this module maps from. Declared structurally rather than
 * imported from `db/rows.js`, because the domain layer may not depend on `db/`
 * — the call site still type-checks the real row against it.
 */
export interface ConventionRowLike {
  id: string;
  repoId: string | null;
  category: string;
  rule: string;
  rationale: string | null;
  evidencePath: string | null;
  evidenceLine: number | null;
  evidenceSnippet: string | null;
  confidence: number | null;
  status: 'pending' | 'accepted' | 'rejected';
  origin: 'config' | 'model';
  createdAt: Date;
}

export function toConventionDto(row: ConventionRowLike): Convention {
  return {
    id: row.id,
    repo_id: row.repoId ?? '',
    category: row.category as ConventionCategory,
    rule: row.rule,
    rationale: row.rationale,
    evidence: {
      path: row.evidencePath ?? '',
      line: row.evidenceLine ?? 1,
      snippet: row.evidenceSnippet ?? '',
    },
    confidence: row.confidence ?? 0,
    status: row.status,
    origin: row.origin,
    created_at: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Accepted conventions → Skill
// ---------------------------------------------------------------------------

/** `acme/payments-api` → `payments-api-conventions`. */
export function skillNameFor(repoFullName: string): string {
  const short = repoFullName.split('/').pop() ?? repoFullName;
  return `${short}${SKILL_NAME_SUFFIX}`;
}

const CATEGORY_HEADINGS: Record<ConventionCategory, string> = {
  naming: 'Naming',
  structure: 'Structure',
  error_handling: 'Error handling',
  async: 'Async',
  typing: 'Types',
  imports: 'Imports',
  testing: 'Testing',
  api: 'API',
  logging: 'Logging',
  security: 'Security',
  formatting: 'Formatting',
};

/**
 * Merge accepted conventions into one Skill body.
 *
 * Shape is deliberate: an instruction line telling the reviewer what to DO with
 * the rules, then one section per rule carrying its verified `file:line` and
 * the real snippet. A rule without its evidence reads as an opinion; with it,
 * the reviewer can point at precedent in the repo.
 */
export function buildSkillBody(repoFullName: string, conventions: Convention[]): string {
  const short = repoFullName.split('/').pop() ?? repoFullName;
  const out: string[] = [
    `# ${skillNameFor(repoFullName)}`,
    '',
    `House conventions for \`${short}\`. Flag changes that violate any rule below and cite ` +
      'the offending `file:line`. A rule applies only where the changed code is in scope for ' +
      'it; do not invent violations to satisfy a rule.',
  ];

  for (const category of Object.keys(CATEGORY_HEADINGS) as ConventionCategory[]) {
    const group = conventions.filter((c) => c.category === category);
    if (group.length === 0) continue;
    out.push('', `## ${CATEGORY_HEADINGS[category]}`);
    for (const c of group) {
      out.push('', `### ${slugifyRule(c.rule)}`, c.rule);
      if (c.rationale) out.push('', c.rationale);
      if (c.evidence.path) {
        out.push('', `Detected in \`${c.evidence.path}:${c.evidence.line}\`:`, '');
        out.push('```', c.evidence.snippet, '```');
      }
    }
  }

  return `${out.join('\n')}\n`;
}

/** One-line description for the generated skill. */
export function buildSkillDescription(repoFullName: string, count: number): string {
  const short = repoFullName.split('/').pop() ?? repoFullName;
  return `${count} house convention${count === 1 ? '' : 's'} extracted from ${short}`;
}
