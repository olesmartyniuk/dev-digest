/** Pure helpers for the Smart Diff grouped view. */
import type { FindingRecord, PrFile, SmartDiffGroup, SmartDiffRole } from "@devdigest/shared";
import { worstSeverity } from "@/components/diff-viewer";

export interface ResolvedGroup {
  role: SmartDiffRole;
  files: PrFile[];
}

/**
 * Resolve the server's role groups (paths only) against the real `PrFile`
 * rows the page already has. Keeps the server's group + in-group order. Any
 * smart-diff entry with no matching `PrFile` (a stale/mismatched fetch) is
 * skipped; any `PrFile` no group covers is appended to `core` — no file is
 * ever hidden, even if the two responses briefly disagree.
 */
export function resolveGroups(groups: SmartDiffGroup[], files: PrFile[]): ResolvedGroup[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const covered = new Set<string>();

  const resolved: ResolvedGroup[] = groups.map((g) => {
    const groupFiles: PrFile[] = [];
    for (const sf of g.files) {
      const f = byPath.get(sf.path);
      if (f) {
        groupFiles.push(f);
        covered.add(sf.path);
      }
    }
    return { role: g.role, files: groupFiles };
  });

  const uncovered = files.filter((f) => !covered.has(f.path));
  if (uncovered.length > 0) {
    const core = resolved.find((g) => g.role === "core");
    if (core) core.files = [...core.files, ...uncovered];
    else resolved.unshift({ role: "core", files: uncovered });
  }

  return resolved;
}

/** How many of a group's files have at least one finding, and the worst
 *  severity across all of them (for the group header's coloured dot). */
export function groupFindingStats(
  groupFiles: PrFile[],
  byPath: Map<string, FindingRecord[]>,
): { withFindings: number; worst: string | null } {
  let withFindings = 0;
  const all: FindingRecord[] = [];
  for (const f of groupFiles) {
    const fileFindings = byPath.get(f.path) ?? [];
    if (fileFindings.length > 0) withFindings++;
    all.push(...fileFindings);
  }
  return { withFindings, worst: worstSeverity(all) };
}
