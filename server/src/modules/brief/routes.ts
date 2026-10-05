import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBriefResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { RunLogger } from '../../platform/run-logger.js';
import { BriefService } from './service.js';

/**
 * PR Why + Risk Brief (SPEC-03 / L05).
 *
 *   GET  /pulls/:id/brief → the cached brief, or `{ brief: null }` when never
 *                           generated. Never calls the LLM, ignores head-SHA
 *                           drift (AC-9).
 *   POST /pulls/:id/brief → always a fresh generation (AC-2, AC-10) — one
 *                           `risk_brief` feature-model call. On failure, the
 *                           stored row is left untouched (AC-12).
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new BriefService(container);

  app.get('/pulls/:id/brief', { schema: { params: IdParams, response: { 200: PrBriefResponse } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.get(workspaceId, req.params.id);
  });

  // Tight per-route limit: each call spends an LLM call.
  app.post(
    '/pulls/:id/brief',
    {
      schema: { params: IdParams, response: { 200: PrBriefResponse } },
      config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      // Empty runIds list: nothing reaches the SSE bus, every line mirrors to pino only.
      const log = new RunLogger(container.runBus, [], req.log, { prId: req.params.id });
      return service.generate(workspaceId, req.params.id, log);
    },
  );
}
