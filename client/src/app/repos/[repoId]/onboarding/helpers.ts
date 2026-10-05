import type { Onboarding, OnboardingSection } from "@devdigest/shared";
import { SECTION_ORDER } from "./constants";

/**
 * Collect run commands out of a section's markdown `body`: every line inside
 * every fenced code block, trimmed, dropping empty lines and `#` comments,
 * and stripping a leading `$ `. Falls back to list items whose entire
 * content is one inline code span when there is no fence at all. Returns
 * `[]` when nothing is found (AC-8's `noCommands` hint).
 */
export function extractCommands(body: string): string[] {
  const fenceMatches = [...body.matchAll(/```[^\n]*\n([\s\S]*?)```/g)];
  if (fenceMatches.length > 0) {
    const commands: string[] = [];
    for (const match of fenceMatches) {
      const lines = match[1]!.split("\n");
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith("#")) continue;
        commands.push(line.startsWith("$ ") ? line.slice(2) : line);
      }
    }
    return commands;
  }

  // No fence — fall back to list items whose entire content is one inline
  // code span, e.g. "- `npm install`".
  const listMatches = [...body.matchAll(/^\s*[-*]\s+`([^`]+)`\s*$/gm)];
  return listMatches.map((m) => m[1]!.trim()).filter((s) => s.length > 0);
}

/** Sort a tour's sections by the fixed `SECTION_ORDER`, dropping unknown kinds. */
export function orderedSections(tour: Onboarding): OnboardingSection[] {
  return tour.sections
    .filter((s) => (SECTION_ORDER as readonly string[]).includes(s.kind))
    .slice()
    .sort(
      (a, b) =>
        SECTION_ORDER.indexOf(a.kind as (typeof SECTION_ORDER)[number]) -
        SECTION_ORDER.indexOf(b.kind as (typeof SECTION_ORDER)[number]),
    );
}

/** Whether a path is a Markdown document (drives the viewer's preview/raw tabs). */
export function isMarkdownPath(p: string): boolean {
  return p.toLowerCase().endsWith(".md");
}
