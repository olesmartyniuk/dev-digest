import { and, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { Container } from '../../platform/container.js';
import { findings } from '../../db/schema/index.js';

export function severityRank(sev: string): number {
  return ({ critical: 0, high: 1, medium: 2, low: 3 } as Record<string, number>)[sev] ?? 4;
}

export async function loadOpenFindings(container: Container, runId: string) {
  return container.db
    .select()
    .from(findings)
    .where(and(eq(findings.runId, runId), eq(findings.status, 'open')));
}

export function workspaceFrom(req: FastifyRequest): string {
  return String(req.headers['x-workspace-id']);
}
