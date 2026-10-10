export function summarize(run: { id: string; verdict: string; findingCount: number }): string {
  return `Review ${run.id}: ${run.verdict} (${run.findingCount} findings)`;
}
