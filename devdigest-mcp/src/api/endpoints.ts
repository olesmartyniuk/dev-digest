import type { Agent, ReviewRunResponse, RunSummary, ReviewRecord, Convention, RunRequest } from '@devdigest/shared';
import type { HttpClient } from './client.js';

/**
 * Thin, typed, one function per route. Response bodies are cast, not
 * re-parsed: the API is local and trusted, and it serializes with the same
 * Zod schemas this package only ever imports as types (see plan decision 1 /
 * Risks "unvalidated responses").
 */
export interface DevDigestApi {
  listAgents(): Promise<Agent[]>; // GET  /agents
  triggerReview(prId: string, body: RunRequest): Promise<ReviewRunResponse>; // POST /pulls/:id/review
  listRuns(prId: string): Promise<RunSummary[]>; // GET  /pulls/:id/runs
  listReviews(prId: string): Promise<ReviewRecord[]>; // GET  /pulls/:id/reviews
  listConventions(repoId: string): Promise<Convention[]>; // GET  /repos/:id/conventions
}

export function createDevDigestApi(http: HttpClient): DevDigestApi {
  return {
    listAgents: () => http.get<Agent[]>('/agents'),
    triggerReview: (prId, body) =>
      http.post<ReviewRunResponse>(`/pulls/${encodeURIComponent(prId)}/review`, body),
    listRuns: (prId) => http.get<RunSummary[]>(`/pulls/${encodeURIComponent(prId)}/runs`),
    listReviews: (prId) => http.get<ReviewRecord[]>(`/pulls/${encodeURIComponent(prId)}/reviews`),
    listConventions: (repoId) =>
      http.get<Convention[]>(`/repos/${encodeURIComponent(repoId)}/conventions`),
  };
}
