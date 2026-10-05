import type {
  BlastCaller,
  BlastRadiusResponse,
  BriefMissingSource,
  Risk,
  RiskBrief,
  SmartDiff,
  SmartDiffRole,
} from '@devdigest/shared';
import { BRIEF_MAX_FOCUS, BRIEF_MAX_RISKS, RISK_SEVERITY_ORDER } from './constants.js';
import type { BriefValidationResult } from './types.js';

/**
 * Pure helpers for the brief module (D5 path validation, severity sort,
 * missing-source derivation). No I/O, no LLM — domain layer
 * (`no-domain-outward`).
 */

/** Trim, turn `\` into `/`, strip a leading `./` (repeatedly) and a leading `/`. */
export function normalizeRefPath(p: string): string {
  let out = p.trim().replace(/\\/g, '/');
  while (out.startsWith('./')) out = out.slice(2);
  if (out.startsWith('/')) out = out.slice(1);
  return out;
}

/** Map every allowed path (normalized → its canonical original form). */
export function buildAllowedPaths(diffPaths: string[], callerFiles: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of [...diffPaths, ...callerFiles]) {
    const normalized = normalizeRefPath(p);
    if (!map.has(normalized)) map.set(normalized, p);
  }
  return map;
}

/** Every blast-caller file, de-duplicated, in first-seen order. */
export function collectCallerFiles(blast: BlastRadiusResponse): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of blast.downstream) {
    for (const c of d.callers) {
      if (!seen.has(c.file)) {
        seen.add(c.file);
        out.push(c.file);
      }
    }
  }
  return out;
}

/** Every blast caller, flattened across all downstream groups. */
export function flattenCallers(blast: BlastRadiusResponse): BlastCaller[] {
  return blast.downstream.flatMap((d) => d.callers);
}

/** path → Smart Diff role, for the "Changed files" prompt section. */
export function roleByPath(smart: SmartDiff | null): Map<string, SmartDiffRole> {
  const map = new Map<string, SmartDiffRole>();
  if (!smart) return map;
  for (const group of smart.groups) {
    for (const file of group.files) map.set(file.path, group.role);
  }
  return map;
}

/** AC-5 — which data sources are missing, `'intent'` first then `'blast'`. */
export function missingSources(input: { hasIntent: boolean; blastAvailable: boolean }): BriefMissingSource[] {
  const out: BriefMissingSource[] = [];
  if (!input.hasIntent) out.push('intent');
  if (!input.blastAvailable) out.push('blast');
  return out;
}

/** AC-6a — stable sort by severity (high, medium, low); ties keep the model's own order. */
export function sortRisksBySeverity(risks: Risk[]): Risk[] {
  return risks
    .map((risk, index) => ({ risk, index }))
    .sort((a, b) => {
      const order = RISK_SEVERITY_ORDER[a.risk.severity] - RISK_SEVERITY_ORDER[b.risk.severity];
      return order !== 0 ? order : a.index - b.index;
    })
    .map((x) => x.risk);
}

/**
 * D5 / AC-8 / AC-8a — drop any risk/review_focus entry whose file path(s)
 * aren't in `allowed`, rewriting surviving refs to their canonical form.
 * `droppedRisks`/`droppedFocus` count only path failures, never the
 * post-sort/post-order cap applied here.
 */
export function validateBrief(draft: RiskBrief, allowed: Map<string, string>): BriefValidationResult {
  const validRisks: Risk[] = [];
  let droppedRisks = 0;
  for (const risk of draft.risks) {
    if (risk.file_refs.length === 0) {
      droppedRisks++;
      continue;
    }
    const canonical: string[] = [];
    let ok = true;
    for (const ref of risk.file_refs) {
      const hit = allowed.get(normalizeRefPath(ref));
      if (hit === undefined) {
        ok = false;
        break;
      }
      canonical.push(hit);
    }
    if (!ok) {
      droppedRisks++;
      continue;
    }
    validRisks.push({ ...risk, file_refs: canonical });
  }

  const validFocus = [];
  let droppedFocus = 0;
  for (const item of draft.review_focus) {
    const hit = allowed.get(normalizeRefPath(item.file));
    if (hit === undefined) {
      droppedFocus++;
      continue;
    }
    validFocus.push({ ...item, file: hit, line: Math.max(1, item.line) });
  }

  return {
    brief: {
      summary: draft.summary.trim(),
      risks: sortRisksBySeverity(validRisks).slice(0, BRIEF_MAX_RISKS),
      review_focus: validFocus.slice(0, BRIEF_MAX_FOCUS),
    },
    droppedRisks,
    droppedFocus,
  };
}
