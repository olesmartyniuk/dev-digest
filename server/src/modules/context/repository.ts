import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Project Context (L05) — data access. Owns `agent_context_docs` and
 * `skill_context_docs`. Workspace-scoped through the joined agent/skill/repo.
 */

export interface ContextRepoBasics {
  id: string;
  fullName: string;
  clonePath: string | null;
}

export class ContextRepository {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<ContextRepoBasics | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, fullName: t.repos.fullName, clonePath: t.repos.clonePath })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** An agent's own attached paths, in prompt order. */
  async listAgentPaths(agentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.agentContextDocs.path })
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, agentId))
      .orderBy(asc(t.agentContextDocs.order));
    return rows.map((r) => r.path);
  }

  /** Replace an agent's whole ordered set of attached paths (delete + insert, order = index). */
  async setAgentPaths(agentId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, agentId));
      if (paths.length === 0) return;
      await tx
        .insert(t.agentContextDocs)
        .values(paths.map((path, i) => ({ agentId, path, order: i })));
    });
  }

  /** A skill's own attached paths, in prompt order. */
  async listSkillPaths(skillId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .where(eq(t.skillContextDocs.skillId, skillId))
      .orderBy(asc(t.skillContextDocs.order));
    return rows.map((r) => r.path);
  }

  /** Replace a skill's whole ordered set of attached paths (delete + insert, order = index). */
  async setSkillPaths(skillId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.skillContextDocs).where(eq(t.skillContextDocs.skillId, skillId));
      if (paths.length === 0) return;
      await tx
        .insert(t.skillContextDocs)
        .values(paths.map((path, i) => ({ skillId, path, order: i })));
    });
  }

  /** Every given skill's attached paths, in prompt order, in one query. */
  async listSkillPathsFor(skillIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (skillIds.length === 0) return map;
    const rows = await this.db
      .select({ skillId: t.skillContextDocs.skillId, path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .where(inArray(t.skillContextDocs.skillId, skillIds))
      .orderBy(asc(t.skillContextDocs.order));
    for (const row of rows) {
      const list = map.get(row.skillId) ?? [];
      list.push(row.path);
      map.set(row.skillId, list);
    }
    return map;
  }

  /**
   * AC-18 — "used by N" per path, across this workspace's agents and skills.
   * Two `GROUP BY path` queries (one per owning table), joined to the owner
   * so the count stays scoped to the workspace. Always queried live, never
   * cached (D8) — attaching/detaching must be reflected immediately.
   */
  async usageCounts(workspaceId: string): Promise<Map<string, { agents: number; skills: number }>> {
    const agentRows = await this.db
      .select({ path: t.agentContextDocs.path, count: sql<number>`count(*)::int` })
      .from(t.agentContextDocs)
      .innerJoin(t.agents, eq(t.agentContextDocs.agentId, t.agents.id))
      .where(eq(t.agents.workspaceId, workspaceId))
      .groupBy(t.agentContextDocs.path);

    const skillRows = await this.db
      .select({ path: t.skillContextDocs.path, count: sql<number>`count(*)::int` })
      .from(t.skillContextDocs)
      .innerJoin(t.skills, eq(t.skillContextDocs.skillId, t.skills.id))
      .where(eq(t.skills.workspaceId, workspaceId))
      .groupBy(t.skillContextDocs.path);

    const map = new Map<string, { agents: number; skills: number }>();
    for (const row of agentRows) {
      map.set(row.path, { agents: row.count, skills: map.get(row.path)?.skills ?? 0 });
    }
    for (const row of skillRows) {
      const existing = map.get(row.path);
      map.set(row.path, { agents: existing?.agents ?? 0, skills: row.count });
    }
    return map;
  }
}
