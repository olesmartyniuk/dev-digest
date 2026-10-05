import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ContextPath, SetContextAttachmentsBody } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

/**
 * Project Context (L05) — module.
 *   GET    /repos/:id/context              → listing (scan on a cache miss)
 *   POST   /repos/:id/context/rescan       → force a fresh scan
 *   GET    /repos/:id/context/file         → one document's raw source (read-only)
 *   GET    /agents/:id/context             → an agent's attached + inherited + effective paths
 *   PUT    /agents/:id/context             → replace an agent's attached paths (ordered)
 *   GET    /skills/:id/context             → a skill's attached paths
 *   PUT    /skills/:id/context             → replace a skill's attached paths (ordered)
 *   GET    /skills/:id/context/preview     → the serialized "## Project context" block (AC-9)
 */

const FileQuery = z.object({ path: ContextPath });
const PreviewQuery = z.object({ repo_id: z.string().uuid() });

export default async function contextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.contextService;

  app.get('/repos/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listDocuments(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/context/rescan',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listDocuments(workspaceId, req.params.id, { rescan: true });
    },
  );

  app.get(
    '/repos/:id/context/file',
    { schema: { params: IdParams, querystring: FileQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.readDocument(workspaceId, req.params.id, req.query.path);
    },
  );

  app.get('/agents/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const result = await service.getAgentContext(workspaceId, req.params.id);
    if (!result) throw new NotFoundError('Agent not found');
    return result;
  });

  app.put(
    '/agents/:id/context',
    { schema: { params: IdParams, body: SetContextAttachmentsBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.setAgentContext(workspaceId, req.params.id, req.body.paths);
      if (!result) throw new NotFoundError('Agent not found');
      return result;
    },
  );

  app.get('/skills/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const result = await service.getSkillContext(workspaceId, req.params.id);
    if (!result) throw new NotFoundError('Skill not found');
    return result;
  });

  app.put(
    '/skills/:id/context',
    { schema: { params: IdParams, body: SetContextAttachmentsBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.setSkillContext(workspaceId, req.params.id, req.body.paths);
      if (!result) throw new NotFoundError('Skill not found');
      return result;
    },
  );

  app.get(
    '/skills/:id/context/preview',
    { schema: { params: IdParams, querystring: PreviewQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.previewSkillContext(workspaceId, req.params.id, req.query.repo_id);
      if (!result) throw new NotFoundError('Skill not found');
      return result;
    },
  );
}
