import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AgentEvalDashboard,
  EvalCaseBody,
  EvalCaseView,
  EvalRunDetail,
  EvalRunSummary,
  EvalWorkspaceDashboard,
  StartEvalRunBody,
  StartEvalRunResponse,
  TurnIntoEvalCaseResponse,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { EVAL_RUN_RATE_LIMIT } from './constants.js';
import { EvalService } from './service.js';

/**
 * eval module (SPEC-04).
 *   POST   /agents/:id/eval-runs      {case_ids?}  → start a background eval run (202)
 *   GET    /agents/:id/eval-runs                   → run history, newest first
 *   GET    /eval-runs/:id                          → one run: aggregate + per-case results
 *   GET    /agents/:id/eval-cases                  → the agent's eval set
 *   POST   /agents/:id/eval-cases                  → create a case (manual)
 *   GET|PUT|DELETE /eval-cases/:id                 → read / edit / delete one case
 *   POST   /findings/:id/eval-case                 → turn a decided finding into a case
 *   GET    /agents/:id/eval-dashboard              → per-agent dashboard
 *   GET    /eval-dashboard                         → workspace dashboard (cards + recent runs)
 */
export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new EvalService(container);

  // ---- Runs ----------------------------------------------------------------
  // Tight per-route limit: each run fans out to one LLM review per case.
  // The body is optional (an empty body means "all cases").
  app.post(
    '/agents/:id/eval-runs',
    {
      schema: {
        params: IdParams,
        body: StartEvalRunBody.nullish(),
        response: { 202: StartEvalRunResponse },
      },
      config: { rateLimit: EVAL_RUN_RATE_LIMIT },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const run = await service.startRun(workspaceId, req.params.id, req.body ?? {}, req.log);
      return reply.status(202).send({ run });
    },
  );

  app.get(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, response: { 200: z.array(EvalRunSummary) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.listRuns(workspaceId, req.params.id);
    },
  );

  app.get(
    '/eval-runs/:id',
    { schema: { params: IdParams, response: { 200: EvalRunDetail } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getRun(workspaceId, req.params.id);
    },
  );

  // ---- Cases ---------------------------------------------------------------
  app.get(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, response: { 200: z.array(EvalCaseView) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.listCases(workspaceId, req.params.id);
    },
  );

  app.post(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, body: EvalCaseBody, response: { 201: EvalCaseView } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const created = await service.createCase(workspaceId, req.params.id, req.body);
      return reply.status(201).send(created);
    },
  );

  app.get(
    '/eval-cases/:id',
    { schema: { params: IdParams, response: { 200: EvalCaseView } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getCase(workspaceId, req.params.id);
    },
  );

  app.put(
    '/eval-cases/:id',
    { schema: { params: IdParams, body: EvalCaseBody, response: { 200: EvalCaseView } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.updateCase(workspaceId, req.params.id, req.body);
    },
  );

  app.delete(
    '/eval-cases/:id',
    { schema: { params: IdParams, response: { 200: z.object({ ok: z.literal(true) }) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      await service.deleteCase(workspaceId, req.params.id);
      return { ok: true as const };
    },
  );

  // ---- Turn a decided finding into a case (201 created / 200 existing) -----
  app.post(
    '/findings/:id/eval-case',
    {
      schema: {
        params: IdParams,
        response: { 200: TurnIntoEvalCaseResponse, 201: TurnIntoEvalCaseResponse },
      },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const res = await service.turnFindingIntoCase(workspaceId, req.params.id);
      return reply.status(res.created ? 201 : 200).send(res);
    },
  );

  // ---- Dashboards ----------------------------------------------------------
  app.get(
    '/agents/:id/eval-dashboard',
    { schema: { params: IdParams, response: { 200: AgentEvalDashboard } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.agentDashboard(workspaceId, req.params.id);
    },
  );

  app.get(
    '/eval-dashboard',
    { schema: { response: { 200: EvalWorkspaceDashboard } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.workspaceDashboard(workspaceId);
    },
  );
}
