import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConventionCategory, ConventionStatus, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * Conventions Extractor (L02).
 *
 *   POST  /repos/:id/conventions/extract     → scan the clone, return candidates
 *   GET   /repos/:id/conventions             → stored candidates for the repo
 *   PATCH /conventions/:id                   → accept / reject / edit one
 *   GET   /repos/:id/conventions/skill-draft → merged draft of the accepted ones
 *   POST  /repos/:id/conventions/skill       → save the draft as a Skill (+ link)
 *
 * The extract route is rate-limited harder than the global cap: it is the only
 * endpoint here that spends money, and the UI calls it from a single button.
 */

const UpdateConventionBody = z
  .object({
    status: ConventionStatus.optional(),
    rule: z.string().min(4).max(400).optional(),
    rationale: z.string().max(1_000).nullable().optional(),
    category: ConventionCategory.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' });

const CreateSkillBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: SkillType.optional(),
  body: z.string().min(1),
  enabled: z.boolean().optional(),
  agent_ids: z.array(z.string().uuid()).optional(),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/conventions/extract',
    {
      schema: { params: IdParams },
      config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.extract(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/conventions/skill-draft',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.skillDraft(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateSkillBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const body = req.body;
      const result = await service.createSkill(workspaceId, req.params.id, {
        name: body.name,
        body: body.body,
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.agent_ids !== undefined ? { agentIds: body.agent_ids } : {}),
      });
      reply.status(201);
      return result;
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const updated = await service.update(workspaceId, req.params.id, req.body);
      if (!updated) throw new NotFoundError('Convention not found');
      return updated;
    },
  );
}
