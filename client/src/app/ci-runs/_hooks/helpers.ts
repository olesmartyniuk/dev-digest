import type { CiRunRow } from "@devdigest/shared";

export type PeriodFilter = "7d" | "30d" | "all";

export interface CiRunFilters {
  period: PeriodFilter;
  agent: string;
  repo: string;
  status: string;
}

export const DEFAULT_FILTERS: CiRunFilters = { period: "7d", agent: "all", repo: "all", status: "all" };

const DAY_MS = 86_400_000;
const PERIOD_DAYS: Record<PeriodFilter, number | null> = { "7d": 7, "30d": 30, all: null };

/** Client-side filtering over the fetched list; keeps the server's order. */
export function applyFilters(runs: CiRunRow[], f: CiRunFilters, now: number): CiRunRow[] {
  const days = PERIOD_DAYS[f.period];
  return runs.filter((r) => {
    if (days != null && now - new Date(r.ran_at).getTime() > days * DAY_MS) return false;
    if (f.agent !== "all" && r.agent_id !== f.agent) return false;
    if (f.repo !== "all" && r.repo !== f.repo) return false;
    if (f.status !== "all" && r.status !== f.status) return false;
    return true;
  });
}

/** Distinct agents / repos present in the list, for the filter dropdowns. */
export function filterOptions(runs: CiRunRow[]) {
  const agents = new Map<string, string>();
  const repos = new Set<string>();
  for (const r of runs) {
    if (r.agent_id && r.agent_name) agents.set(r.agent_id, r.agent_name);
    if (r.repo) repos.add(r.repo);
  }
  return {
    agents: [...agents].map(([value, label]) => ({ value, label })),
    repos: [...repos].sort(),
  };
}
