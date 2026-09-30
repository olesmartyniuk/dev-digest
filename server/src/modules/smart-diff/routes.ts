import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SmartDiffResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SmartDiffService } from './service.js';

/**
 * Smart Diff (L03) — deterministic, path-based file-role classification for
 * the "Files changed" tab, no LLM call.
 *
 *   GET /pulls/:id/smart-diff → files grouped by role (core → tests → wiring
 *                                → docs → boilerplate), read-only.
 *
 * `finding_lines` is always `[]` on every file — this endpoint never
 * associates findings to files server-side; the client does that join itself
 * from the already-cached `GET /pulls/:id/reviews` (decision B). `
 * pseudocode_summary` is always `null` (reserved for a later lesson,
 * decision A).
 */
export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new SmartDiffService(container);

  app.get(
    '/pulls/:id/smart-diff',
    { schema: { params: IdParams, response: { 200: SmartDiffResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.get(workspaceId, req.params.id);
    },
  );
}
