import type { DiffHunk, IntentConfidence, IntentSource, IntentSourceKind, IntentSourceStatus, PrIntentView } from '@devdigest/shared';
import {
  DIFF_GIT_RE,
  DOC_EXT_RE,
  EXTERNAL_DOC_HOSTS,
  EXTERNAL_DOC_PATH_RE,
  GITHUB_BLOB_RE,
  HUNK_HEADER_RE,
  LINKED_ISSUE_RE,
  MAX_FILES,
  MAX_HEADER_CHARS,
  MAX_HEADERS_PER_FILE,
  MAX_REFERENCES,
  MAX_REF_CHARS,
  MIN_DESCRIPTION_CHARS,
  REPO_DOC_PATH_RE,
  SAFE_REF_RE,
  SPEC_HINT_RE,
  TICKET_KEY_RE,
  URL_RE,
} from './constants.js';
import type { DetectedReference, IntentInput, PrIntentRowLike } from './types.js';

/**
 * Pure helpers for PR intent classification (L03): reference detection, path/
 * ref safety guards, hunk-header extraction, confidence enforcement, and the
 * prompt digest. Domain layer — no Fastify, Drizzle, adapters, container or
 * `db/` imports (`no-domain-outward`), which is also what makes every rule
 * here directly unit-testable against string fixtures.
 */

// ---------------------------------------------------------------------------
// Reference detection
// ---------------------------------------------------------------------------

function kindFor(text: string): 'plan' | 'spec' {
  return SPEC_HINT_RE.test(text) ? 'spec' : 'plan';
}

function truncateRef(s: string): string {
  return s.length > MAX_REF_CHARS ? s.slice(0, MAX_REF_CHARS) : s;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isIssueLikeUrl(url: string): boolean {
  return /\/browse\//i.test(url) || /linear\.app\/[^/]+\/issue\//i.test(url);
}

/**
 * Detect plan/spec/linked-issue references in a PR body. Never fetches
 * anything — a reference is either resolved by the caller (same-repo doc,
 * issue number) or recorded as `external` (unreadable from this tool).
 *
 * Order of work (exact, do not reorder): (1) every URL, (2) repo-relative doc
 * paths in the URL-blanked text, (3) bare ticket keys, (4) the first
 * `#N`-style linked issue. Then de-duplicate by `kind+ref`, truncate refs, and
 * cap the result.
 */
export function detectReferences(
  body: string,
  repo: { owner: string; name: string },
): DetectedReference[] {
  const found: DetectedReference[] = [];
  const urlSpans: { start: number; end: number }[] = [];

  // (1) Every URL, scanned first.
  for (const m of body.matchAll(URL_RE)) {
    const url = m[0];
    const start = m.index ?? 0;
    urlSpans.push({ start, end: start + url.length });

    const blob = url.match(GITHUB_BLOB_RE);
    if (blob) {
      const [, owner, name, ref, rawPath] = blob;
      const path = (rawPath ?? '').trim();
      const sameRepo = owner === repo.owner && name === repo.name;
      if (sameRepo) {
        if (DOC_EXT_RE.test(path)) {
          found.push({
            kind: kindFor(path),
            ref: truncateRef(url),
            target: { type: 'repo_path', path, ref: ref ?? null },
          });
        }
        // same-repo blob that is not a doc → dropped
        continue;
      }
      found.push({
        kind: kindFor(path),
        ref: truncateRef(url),
        target: {
          type: 'external',
          reason: 'links to a different repository — only this repo is readable',
        },
      });
      continue;
    }

    const host = hostOf(url);
    const isExternalHost = host != null && EXTERNAL_DOC_HOSTS.some((h) => host.endsWith(h));
    const isExternalPath = EXTERNAL_DOC_PATH_RE.test(url);
    if (isExternalHost || isExternalPath) {
      const kind: DetectedReference['kind'] = isIssueLikeUrl(url) ? 'linked_issue' : kindFor(url);
      found.push({
        kind,
        ref: truncateRef(url),
        target: {
          type: 'external',
          reason: 'external link — not fetched (local-first: no outbound fetch of arbitrary URLs)',
        },
      });
    }
    // any other URL (badges, images) is ignored
  }

  // (2) Blank the URL spans, then scan for repo-relative doc paths in plain text.
  let blanked = body;
  for (const span of [...urlSpans].sort((a, b) => b.start - a.start)) {
    blanked = blanked.slice(0, span.start) + ' '.repeat(span.end - span.start) + blanked.slice(span.end);
  }
  for (const m of blanked.matchAll(REPO_DOC_PATH_RE)) {
    const raw = m[1] ?? m[0];
    const path = raw.replace(/^[`'"]|[`'"]$/g, '');
    found.push({ kind: kindFor(path), ref: truncateRef(path), target: { type: 'repo_path', path, ref: null } });
  }

  // (3) Bare "Jira: ABC-123"-style ticket keys.
  for (const m of body.matchAll(TICKET_KEY_RE)) {
    const key = m[1];
    if (!key) continue;
    found.push({
      kind: 'linked_issue',
      ref: truncateRef(key),
      target: { type: 'external', reason: 'external ticket key — tracker not reachable from this tool' },
    });
  }

  // (4) The first `#N` / "closes #N" linked issue.
  const issueMatch = body.match(LINKED_ISSUE_RE);
  if (issueMatch?.[1]) {
    const n = Number(issueMatch[1]);
    found.push({ kind: 'linked_issue', ref: `#${n}`, target: { type: 'issue', number: n } });
  }

  // De-duplicate by kind+ref, cap at MAX_REFERENCES.
  const seen = new Set<string>();
  const out: DetectedReference[] = [];
  for (const r of found) {
    const key = `${r.kind}:${r.ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= MAX_REFERENCES) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Path / ref safety guards
// ---------------------------------------------------------------------------

/** Reject anything that isn't a plain, doc-extension, repo-relative path. */
export function safeRepoPath(p: string): string | null {
  if (p.includes('\0') || p.includes('\\')) return null;
  if (p.startsWith('/') || p.startsWith('~')) return null;
  if (/^[A-Za-z]:/.test(p)) return null;
  if (p.length > 300) return null;
  const segments = p.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return null;
  if (!DOC_EXT_RE.test(p)) return null;
  return p;
}

/** Reject anything that isn't a plain commit sha or a safe branch/tag-like ref. */
export function safeGitRef(ref: string): string | null {
  if (/^[0-9a-f]{7,40}$/i.test(ref)) return ref;
  if (SAFE_REF_RE.test(ref) && !ref.includes('..')) return ref;
  return null;
}

// ---------------------------------------------------------------------------
// Hunk headers (never hunk bodies)
// ---------------------------------------------------------------------------

/**
 * Walk a raw unified diff and keep ONLY `@@ … @@` header lines, grouped by
 * the file they belong to (the b-side path from the preceding `diff --git`
 * line). Every other line — including every `+`/`-`/context body line — is
 * ignored; there is no branch here that ever pushes one.
 */
export function extractHunkHeaders(raw: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let currentPath: string | null = null;
  for (const line of raw.split('\n')) {
    const diffMatch = line.match(DIFF_GIT_RE);
    if (diffMatch) {
      currentPath = diffMatch[2] ?? null;
      continue;
    }
    if (currentPath && HUNK_HEADER_RE.test(line)) {
      const list = out.get(currentPath) ?? [];
      list.push(line.slice(0, MAX_HEADER_CHARS));
      out.set(currentPath, list);
    }
  }
  return out;
}

/** Same scan as `extractHunkHeaders`, over a single `pr_files.patch` (no `diff --git` lines). */
export function headersFromPatch(patch: string | null): string[] {
  if (!patch) return [];
  const out: string[] = [];
  for (const line of patch.split('\n')) {
    if (HUNK_HEADER_RE.test(line)) out.push(line.slice(0, MAX_HEADER_CHARS));
  }
  return out;
}

/** Rebuild `@@` headers from parsed hunk numbers, when the raw text has none. */
export function synthesizeHeaders(hunks: DiffHunk[]): string[] {
  return hunks.map((h) => `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`);
}

/** Cap the file list and each file's headers to the prompt budgets. */
export function buildFileList(
  files: { path: string; additions: number; deletions: number; headers: string[] }[],
): IntentInput['files'] {
  return files.slice(0, MAX_FILES).map((f) => ({
    path: f.path,
    additions: f.additions,
    deletions: f.deletions,
    headers: f.headers.slice(0, MAX_HEADERS_PER_FILE),
  }));
}

// ---------------------------------------------------------------------------
// Confidence + rendering
// ---------------------------------------------------------------------------

export function isEmptyDescription(body: string | null | undefined): boolean {
  return (body ?? '').replace(/\s+/g, '').length < MIN_DESCRIPTION_CHARS;
}

const CONFIDENCE_LEVELS: IntentConfidence[] = ['low', 'medium', 'high'];
const CONFIDENCE_RANK: Record<IntentConfidence, number> = { low: 0, medium: 1, high: 2 };

/**
 * Enforce a deterministic ceiling on the model's proposed confidence: `low`
 * when the PR has no description, else `medium` when anything referenced
 * could not be read, else `high`. The result is the LOWER of the model's
 * level and the ceiling — the model can never talk its way above the ceiling.
 */
export function applyConfidenceCeiling(
  model: IntentConfidence,
  facts: { descriptionEmpty: boolean; unavailable: IntentSource[] },
  modelReason: string,
): { confidence: IntentConfidence; reason: string } {
  const ceiling: IntentConfidence = facts.descriptionEmpty
    ? 'low'
    : facts.unavailable.length > 0
      ? 'medium'
      : 'high';
  const rank = Math.min(CONFIDENCE_RANK[model], CONFIDENCE_RANK[ceiling]);
  const confidence = CONFIDENCE_LEVELS[rank]!;

  let reason = '';
  if (facts.descriptionEmpty) {
    reason += 'No PR description — derived from title, file names and hunk headers only. ';
  }
  if (facts.unavailable.length > 0) {
    const refs = facts.unavailable.map((s) => s.ref ?? '(unknown)').join(', ');
    reason += `Referenced context missing: ${refs}. `;
  }
  reason += modelReason.trim();
  return { confidence, reason };
}

/** The text injected into the reviewer's `## PR intent` prompt slot. Deterministic. */
export function renderIntentDigest(v: PrIntentView): string {
  const inScope = v.in_scope.length > 0 ? v.in_scope.map((s) => `- ${s}`).join('\n') : '- (none stated)';
  const outOfScope =
    v.out_of_scope.length > 0 ? v.out_of_scope.map((s) => `- ${s}`).join('\n') : '- (none stated)';
  const unavailable = v.sources.filter((s) => s.status === 'unavailable');

  const lines = [
    `Intent: ${v.intent}`,
    `Confidence: ${v.confidence} — ${v.confidence_reason ?? 'n/a'}`,
    'In scope:',
    inScope,
    'Out of scope:',
    outOfScope,
  ];
  if (unavailable.length > 0) {
    const refs = unavailable.map((s) => s.ref ?? '(unknown)').join(', ');
    lines.push(`Missing context (NOT read — do not assume its content): ${refs}`);
  }
  const shortSha = (v.head_sha ?? '').slice(0, 7) || 'unknown';
  lines.push(
    `Classified against commit ${shortSha}${v.stale ? ' — the PR has changed since; treat scope as approximate' : ''}`,
  );
  return lines.join('\n');
}

const SOURCE_KIND_LABEL: Record<IntentSourceKind, string> = {
  title: 'title',
  description: 'description',
  linked_issue: 'issue',
  plan: 'plan',
  spec: 'spec',
  hunk_headers: 'hunk headers',
};

function sourceGlyph(status: IntentSourceStatus, kind: IntentSourceKind): string {
  if (status === 'used') return kind === 'hunk_headers' ? '' : ' ✓';
  if (status === 'empty') return ' empty';
  if (status === 'unavailable') return ' ✗ unavailable';
  return ' ⏭ skipped';
}

/** One-line log summary of every source: refs and statuses only, never content. */
export function formatSourcesLine(sources: IntentSource[]): string {
  return sources
    .map((s) => `${SOURCE_KIND_LABEL[s.kind]}${s.ref ? ` ${s.ref}` : ''}${sourceGlyph(s.status, s.kind)}`)
    .join(' · ');
}

/** Map the persisted `pr_intent` row to the served view, typed structurally
 *  (not via a Drizzle type) so this file never imports `db/`. */
export function toIntentView(row: PrIntentRowLike, currentHeadSha: string): PrIntentView {
  return {
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    pr_id: row.prId,
    confidence: row.confidence,
    confidence_reason: row.confidenceReason,
    sources: row.sources,
    provider: row.provider,
    model: row.model,
    head_sha: row.headSha,
    stale: row.headSha !== null && row.headSha !== currentHeadSha,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    cost_usd: row.costUsd,
    classified_at: row.classifiedAt.toISOString(),
  };
}
