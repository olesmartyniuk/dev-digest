import type { ContextDocument } from "@devdigest/shared";

/** One row of the "All documents" list — the server's alphabetical order, annotated with attach state. */
export interface PickerRow {
  doc: ContextDocument;
  attached: boolean;
}

/**
 * Build the "All documents" rows: the server's order (already alphabetical by
 * path) is preserved, filtered case-insensitively on `path`.
 */
export function buildAllRows(
  documents: ContextDocument[],
  attached: string[],
  filter: string,
): PickerRow[] {
  const attachedSet = new Set(attached);
  const needle = filter.trim().toLowerCase();
  return documents
    .filter((doc) => !needle || doc.path.toLowerCase().includes(needle))
    .map((doc) => ({ doc, attached: attachedSet.has(doc.path) }));
}

/** Checking a document appends it to the end of the attached list (AC-6); unchecking removes it. */
export function toggleAttached(attached: string[], path: string, next: boolean): string[] {
  if (next) return attached.includes(path) ? attached : [...attached, path];
  return attached.filter((p) => p !== path);
}

/** Move an attached path up (`-1`) or down (`1`) in prompt order; a no-op at either edge. */
export function moveAttached(attached: string[], path: string, dir: -1 | 1): string[] {
  const idx = attached.indexOf(path);
  if (idx < 0) return attached;
  const swapWith = idx + dir;
  if (swapWith < 0 || swapWith >= attached.length) return attached;
  const next = [...attached];
  [next[idx], next[swapWith]] = [next[swapWith]!, next[idx]!];
  return next;
}

export interface ContextSummary {
  tokens: number;
  entryChars: number;
  overCap: boolean;
  /** Effective paths that aren't in this repo's current document listing. */
  missing: string[];
}

/**
 * Sum `tokens`/`entry_chars` over the effective (run-time) path set, using
 * the listing's per-document figures — no formatting/cap logic is
 * duplicated on the client (D4).
 */
export function summarize(
  effective: string[],
  documents: ContextDocument[],
  capChars: number,
): ContextSummary {
  const byPath = new Map(documents.map((doc) => [doc.path, doc]));
  let tokens = 0;
  let entryChars = 0;
  const missing: string[] = [];
  for (const path of effective) {
    const doc = byPath.get(path);
    if (!doc) {
      missing.push(path);
      continue;
    }
    tokens += doc.tokens;
    entryChars += doc.entry_chars;
  }
  return { tokens, entryChars, overCap: entryChars > capChars, missing };
}
