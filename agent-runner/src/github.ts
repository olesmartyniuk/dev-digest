import type { GitHubReviewPayload } from '@devdigest/shared';

/** The slice of the GitHub API the runner needs — a seam so run.ts is testable. */
export interface RunnerGitHub {
  getPull(repo: string, n: number): Promise<{ body: string | null; headSha: string }>;
  getDiff(repo: string, n: number): Promise<string>;
  postReview(repo: string, n: number, payload: GitHubReviewPayload, commitId: string): Promise<void>;
  postComment(repo: string, n: number, body: string): Promise<void>;
}

/** fetch-based implementation (no Octokit — keeps the bundle small). */
export function createGitHub(env: Record<string, string | undefined>): RunnerGitHub {
  const base = env.GITHUB_API_URL ?? 'https://api.github.com';
  const token = env.GITHUB_TOKEN;

  async function call(path: string, init: RequestInit & { accept?: string } = {}): Promise<Response> {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Accept: init.accept ?? 'application/vnd.github+json',
        'User-Agent': 'devdigest-agent-runner',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GitHub ${init.method ?? 'GET'} ${path} -> ${res.status} ${text.slice(0, 300)}`);
    }
    return res;
  }

  return {
    async getPull(repo, n) {
      const res = await call(`/repos/${repo}/pulls/${n}`);
      const j = (await res.json()) as { body?: string | null; head: { sha: string } };
      return { body: j.body ?? null, headSha: j.head.sha };
    },
    async getDiff(repo, n) {
      const res = await call(`/repos/${repo}/pulls/${n}`, { accept: 'application/vnd.github.v3.diff' });
      return res.text();
    },
    async postReview(repo, n, payload, commitId) {
      await call(`/repos/${repo}/pulls/${n}/reviews`, {
        method: 'POST',
        body: JSON.stringify({
          commit_id: commitId,
          body: payload.body,
          event: payload.event,
          comments: (payload.comments ?? []).map((c) => ({
            path: c.path,
            line: c.line,
            side: 'RIGHT',
            body: c.body,
          })),
        }),
      });
    },
    async postComment(repo, n, body) {
      await call(`/repos/${repo}/issues/${n}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
    },
  };
}
