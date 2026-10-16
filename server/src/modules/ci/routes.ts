import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AgentCiOverview,
  CiExport,
  CiInstallInput,
  CiPreview,
  CiPreviewInput,
  CiRunRow,
  CiSyncInput,
  CiSyncResult,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { CI_RATE_LIMIT } from './constants.js';
import { CiService } from './service.js';

/**
 * ci module (SPEC-05 — Export to CI).
 *   POST /agents/:id/export-ci/preview  {repo_id,…}   → the exact files that would be committed
 *   POST /agents/:id/export-ci          {repo_id,…}   → open the PR (or just record a zip install)
 *   GET  /agents/:id/ci                                → installations + CI run history for one agent
 *   GET  /ci/runs                                      → every ingested CI run, newest first
 *   POST /ci/sync                       {agent_id?}   → ingest new runner results from GitHub artifacts
 *
 * There is deliberately NO route that accepts a CI result from a caller: runs
 * are only ever read back from the repository's own workflow artifacts.
 */
export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new CiService(container);

  app.post(
    '/agents/:id/export-ci/preview',
    { schema: { params: IdParams, body: CiPreviewInput, response: { 200: CiPreview } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.preview(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/agents/:id/export-ci',
    {
      schema: { params: IdParams, body: CiInstallInput, response: { 200: CiExport } },
      config: { rateLimit: CI_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.install(workspaceId, req.params.id, req.body);
    },
  );

  app.get(
    '/agents/:id/ci',
    { schema: { params: IdParams, response: { 200: AgentCiOverview } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.agentOverview(workspaceId, req.params.id);
    },
  );

  app.get('/ci/runs', { schema: { response: { 200: z.array(CiRunRow) } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listRuns(workspaceId);
  });

  // A body-less POST arrives as `null`, not `undefined` (server INSIGHTS 2026-10-11).
  app.post(
    '/ci/sync',
    {
      schema: { body: CiSyncInput.nullish(), response: { 200: CiSyncResult } },
      config: { rateLimit: CI_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.sync(workspaceId, req.body?.agent_id, req.log);
    },
  );
}
