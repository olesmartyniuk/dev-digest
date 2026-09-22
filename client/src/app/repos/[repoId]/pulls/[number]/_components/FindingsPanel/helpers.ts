import type { FindingRecord } from "@devdigest/shared";
import { compareBySeverity } from "@/lib/severity";
import { LOW_CONFIDENCE_THRESHOLD } from "./constants";

/** Optionally drop low-confidence findings and sort by severity. */
export function visibleFindings(findings: FindingRecord[], hideLow: boolean): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  return [...shown].sort(compareBySeverity);
}
