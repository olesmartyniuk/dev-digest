import type { FastifyInstance } from 'fastify';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import { labels, pullLabels } from '../../db/schema/index.js';
import { getContext } from '../_shared/context.js';

export default async function labelRoutes(app: FastifyInstance) {
  const { container } = app as any;

  app.post('/pulls/:id/labels', async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    const { id } = req.params as { id: string };
    const body = z.object({ name: z.string(), color: z.string().optional() }).parse(req.body);

    const existing = await container.db
      .select()
      .from(labels)
      .where(and(eq(labels.workspaceId, workspaceId), eq(labels.name, body.name)));

    let label = existing[0];
    if (!label) {
      const name = body.name.trim().toLowerCase();
      if (name.length > 24 || /^(wip|do-not-merge)$/.test(name)) {
        return reply.code(422).send({ error: 'invalid label' });
      }
      [label] = await container.db
        .insert(labels)
        .values({ workspaceId, name, color: body.color ?? '#888888' })
        .returning();
    }

    const [{ count }] = await container.db
      .select({ count: sql<number>`count(*)` })
      .from(pullLabels)
      .where(eq(pullLabels.pullId, id));
    if (Number(count) >= 10) return reply.code(409).send({ error: 'too many labels' });

    await container.db.insert(pullLabels).values({ pullId: id, labelId: label.id });
    return reply.code(201).send(label);
  });
}
