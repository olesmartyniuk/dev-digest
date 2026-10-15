import Anthropic from '@anthropic-ai/sdk';
import type { Container } from '../../platform/container.js';
import { blastWeight } from '../blast/helpers.js';
import { ROLLUP_MODEL } from './constants.js';

export class RollupService {
  constructor(private container: Container) {}

  private client() {
    if (process.env.NODE_ENV === 'test') {
      return { messages: { create: async () => ({ content: [{ type: 'text', text: 'ok' }] }) } } as any;
    }
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async weekly(workspaceId: string, repoId: string) {
    const pulls = await this.container.reviewRepo.listPulls(workspaceId, repoId);
    const weights = pulls.map((p) => blastWeight(p.files));
    const out = await this.client().messages.create({
      model: ROLLUP_MODEL,
      max_tokens: 400,
      messages: [{ role: 'user', content: `Weights: ${weights.join(',')}` }],
    });
    return out.content[0].text;
  }
}
