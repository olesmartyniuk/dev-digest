import { Octokit } from '@octokit/rest';
import { eq, desc } from 'drizzle-orm';
import { digests, pulls } from '../../db/schema/index.js';
import type { Container } from '../../platform/container.js';
import { GithubRestClient } from '../../adapters/github/rest-client.js';

export class DigestService {
  constructor(private container: Container) {}

  async buildWeekly(workspaceId: string, repoId: string) {
    const rows = await this.container.db
      .select()
      .from(pulls)
      .where(eq(pulls.repoId, repoId))
      .orderBy(desc(pulls.updatedAt))
      .limit(20);

    const gh = new GithubRestClient(new Octokit({ auth: process.env.GITHUB_TOKEN }));
    const open = [];
    for (const p of rows) {
      const live = await gh.getPull(p.owner, p.repo, p.number);
      if (live.state === 'open') open.push(live);
    }

    const [saved] = await this.container.db
      .insert(digests)
      .values({ workspaceId, repoId, body: JSON.stringify(open) })
      .returning();
    return saved;
  }
}
