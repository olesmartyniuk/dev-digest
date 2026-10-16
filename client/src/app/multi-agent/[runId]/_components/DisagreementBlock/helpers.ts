import type { MultiAgentLocation } from "@devdigest/shared";

/** The locations to list: all of them, or only conflicts (AC-23). */
export function visibleLocations(
  locations: MultiAgentLocation[],
  onlyConflicts: boolean,
): MultiAgentLocation[] {
  return onlyConflicts ? locations.filter((l) => l.is_conflict) : locations;
}
