import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AgentRunEstimate, MultiAgentLatestResponse, MultiAgentRunView } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { MultiAgentService } from './service.js';

/**
 * multi-agent module (SPEC-05). Read-only; the start path is
 * `POST /pulls/:id/review {agentIds}` in the reviews module.
 *   GET /multi-agent-runs/latest  → newest parent run id (or null)
 *   GET /multi-agent-runs/:id     → per-agent columns + groups + disagreements
 *   GET /multi-agent/estimates    → per-enabled-agent time/cost estimates
 */
export default async function multiAgentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new MultiAgentService(container);

  app.get(
    '/multi-agent-runs/latest',
    { schema: { response: { 200: MultiAgentLatestResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.latest(workspaceId);
    },
  );

  app.get(
    '/multi-agent-runs/:id',
    { schema: { params: IdParams, response: { 200: MultiAgentRunView } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getRun(workspaceId, req.params.id);
    },
  );

  app.get(
    '/multi-agent/estimates',
    { schema: { response: { 200: z.array(AgentRunEstimate) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.estimates(workspaceId);
    },
  );
}
