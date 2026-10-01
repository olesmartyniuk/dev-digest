import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastRadiusResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';

/**
 * Blast radius (L04) — read-only, no LLM, reshapes repo-intel facade data.
 *
 *   GET /pulls/:id/blast → per changed symbol, its callers (file:line) and
 *                           the HTTP endpoints/cron jobs reachable from them.
 *                           `degraded=true` (+ `degraded_reason`) when the
 *                           index is off, partial, or missing — the ripgrep
 *                           fallback reports `no_data` even when callers were
 *                           found, so a degraded notice can coexist with
 *                           results. A broken index yields `index_failed`,
 *                           never a 500.
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new BlastService(container);

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastRadiusResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.get(workspaceId, req.params.id);
    },
  );
}
