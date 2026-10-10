import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { OnboardingService } from './service.js';

/**
 * Onboarding Tour (SPEC-02 / L05).
 *
 *   GET  /repos/:id/onboarding          → the stored tour, or the not_generated empty state
 *   POST /repos/:id/onboarding/generate → (re)generate it, inline, one LLM call
 *   GET  /repos/:id/onboarding/file     → read-only source preview for a tour link
 *
 * `generate` is rate-limited harder than the global cap: it is the only
 * endpoint here that spends money, and the UI calls it from a single button.
 */

const FileQuery = z.object({ path: z.string().min(1).max(1024) });

export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new OnboardingService(app.container);

  app.get('/repos/:id/onboarding', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.get(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/onboarding/generate',
    {
      schema: { params: IdParams },
      config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.generate(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/onboarding/file',
    { schema: { params: IdParams, querystring: FileQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.readFile(workspaceId, req.params.id, req.query.path);
    },
  );
}
