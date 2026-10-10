import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PinBody, PinResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { PinsService } from './service.js';

export default async function pinsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new PinsService(container);

  app.post(
    '/pulls/:id/pin',
    { schema: { params: IdParams, body: PinBody, response: { 201: PinResponse } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const pin = await service.pin(workspaceId, req.params.id, req.body.note);
      return reply.code(201).send(pin);
    },
  );
}
