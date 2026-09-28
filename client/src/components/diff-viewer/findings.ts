/* Inline-finding support for the DiffViewer (Files changed tab). Pure
   helpers + the API shape the viewer needs — the same "adapter object"
   pattern as `comments.ts`'s `DiffCommentApi`, so a route can inject a
   `FindingCard` renderer without the shared viewer importing a route-private
   component. */
import type { ReactNode } from "react";
import type { FindingRecord } from "@devdigest/shared";
import { compareBySeverity } from "@/lib/severity";
import { lineKey } from "./comments";

/** What the viewer needs to render findings inline, injected by the route. */
export interface DiffFindingApi {
  findings: FindingRecord[];
  renderFinding: (f: FindingRecord) => ReactNode;
}

/** Findings always anchor to the new (RIGHT) side, at their `start_line`. */
export function findingKey(f: FindingRecord): string {
  return lineKey("RIGHT", f.start_line)!;
}

/** Group findings by the file path they belong to. */
export function findingsByPath(findings: FindingRecord[]): Map<string, FindingRecord[]> {
  const byPath = new Map<string, FindingRecord[]>();
  for (const f of findings) {
    const list = byPath.get(f.file) ?? [];
    list.push(f);
    byPath.set(f.file, list);
  }
  return byPath;
}

/**
 * Split one file's findings into those anchored to a rendered line vs.
 * "unanchored" ones whose `start_line` isn't on a visible RIGHT-side line.
 * Same contract as `partitionThreads` (`comments.ts`) — nothing is silently
 * dropped. Each bucket is sorted worst-severity-first.
 */
export function partitionFindings(
  fileFindings: FindingRecord[],
  renderedKeys: Set<string>,
): { matched: Map<string, FindingRecord[]>; unanchored: FindingRecord[] } {
  const matched = new Map<string, FindingRecord[]>();
  const unanchored: FindingRecord[] = [];
  for (const f of fileFindings) {
    const key = findingKey(f);
    if (renderedKeys.has(key)) {
      const list = matched.get(key) ?? [];
      list.push(f);
      matched.set(key, list);
    } else {
      unanchored.push(f);
    }
  }
  for (const list of matched.values()) list.sort(compareBySeverity);
  unanchored.sort(compareBySeverity);
  return { matched, unanchored };
}

/** The worst severity across a list of findings, or `null` when empty. */
export function worstSeverity(findings: FindingRecord[]): string | null {
  if (findings.length === 0) return null;
  return [...findings].sort(compareBySeverity)[0]!.severity;
}
