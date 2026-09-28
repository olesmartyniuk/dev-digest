/** The first `# Heading` line in a markdown body, or null if there isn't one. */
export function deriveNameFromMarkdown(body: string): string | null {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1]!.trim() : null;
}
