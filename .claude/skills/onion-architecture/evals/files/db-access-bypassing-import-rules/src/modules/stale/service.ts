import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { STALE_AFTER_DAYS } from './constants.js';

export class StaleService {
  constructor(private container: Container) {}

  async list(workspaceId: string, repoId: string) {
    const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 86_400_000);
    const rows = await this.container.db.query.pulls.findMany({
      where: (p, { and, eq, lt }) =>
        and(eq(p.workspaceId, workspaceId), eq(p.repoId, repoId), lt(p.updatedAt, cutoff)),
      with: { reviews: true },
    });
    if (rows.length === 0) throw new NotFoundError('No stale pull requests');
    return rows.map((p) => ({
      id: p.id,
      title: p.title,
      reviewed: p.reviews.length > 0,
      idleDays: Math.floor((Date.now() - p.updatedAt.getTime()) / 86_400_000),
    }));
  }

  async close(workspaceId: string, pullId: string) {
    await this.container.db.execute(
      `update pulls set state = 'closed' where id = '${pullId}' and workspace_id = '${workspaceId}'`,
    );
  }
}
