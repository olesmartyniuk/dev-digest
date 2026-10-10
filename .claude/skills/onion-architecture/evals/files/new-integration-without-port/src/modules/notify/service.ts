import type { Container } from '../../platform/container.js';
import { summarize } from './helpers.js';

export class NotifyService {
  constructor(private container: Container) {}

  async reviewFinished(workspaceId: string, runId: string) {
    const run = await this.container.reviewRepo.getRun(workspaceId, runId);
    const text = summarize(run);

    const res = await fetch(process.env.SLACK_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, channel: '#reviews' }),
    });
    if (!res.ok) throw new Error(`slack ${res.status}`);
    return { delivered: true };
  }
}
