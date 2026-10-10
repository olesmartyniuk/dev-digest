import { and, count, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { pins } from '../../db/schema/index.js';

export class PinsRepository {
  constructor(private db: Db) {}

  async count(workspaceId: string): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(pins).where(eq(pins.workspaceId, workspaceId));
    return row?.n ?? 0;
  }

  async insert(workspaceId: string, pullId: string, note: string | null) {
    const [row] = await this.db.insert(pins).values({ workspaceId, pullId, note }).returning();
    return row;
  }

  async exists(workspaceId: string, pullId: string) {
    const rows = await this.db.select().from(pins).where(and(eq(pins.workspaceId, workspaceId), eq(pins.pullId, pullId)));
    return rows.length > 0;
  }
}
