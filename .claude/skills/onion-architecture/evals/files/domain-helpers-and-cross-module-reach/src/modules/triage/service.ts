import type { Container } from '../../platform/container.js';
import { ReviewRepository } from '../reviews/repository.js';
import { AgentsService } from '../agents/service.js';
import { loadOpenFindings, severityRank } from './helpers.js';

export class TriageService {
  private reviews: ReviewRepository;
  private agents: AgentsService;

  constructor(private container: Container) {
    this.reviews = new ReviewRepository(container.db);
    this.agents = new AgentsService(container);
  }

  async queue(workspaceId: string, runId: string) {
    const run = await this.reviews.getRun(workspaceId, runId);
    const agent = await this.agents.get(workspaceId, run.agentId);
    const open = await loadOpenFindings(this.container, runId);
    return { agent: agent.name, items: open.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)) };
  }
}
