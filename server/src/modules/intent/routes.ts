import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { RunLogger } from '../../platform/run-logger.js';

/**
 * PR Intent (L03) — the cheap-model classifier that derives WHY a PR exists,
 * stored per PR and injected into every agent's review prompt.
 *
 *   GET  /pulls/:id/intent  → stored intent for the PR (null when never
 *                             classified; `stale: true` when the PR head has
 *                             moved since classification)
 *   POST /pulls/:id/intent  → (re)classify synchronously with the
 *                             `review_intent` feature model; always 200 —
 *                             `skipped` names why on a handled failure (no
 *                             key, timeout, …), never a thrown error
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.intentService;

  app.get('/pulls/:id/intent', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.get(workspaceId, req.params.id);
  });

  // Tight per-route limit: each call can spend an LLM call.
  app.post(
    '/pulls/:id/intent',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      // Empty runIds list: nothing reaches the SSE bus, every line mirrors to pino only.
      const log = new RunLogger(container.runBus, [], req.log, { prId: req.params.id });
      return service.classify(workspaceId, req.params.id, log);
    },
  );
}
