"use client";

import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { OnboardingSection } from "@devdigest/shared";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { extractCommands } from "../../helpers";
import { CommandList } from "../CommandList";
import { CriticalPathList } from "../CriticalPathList";
import { NumberedList } from "../NumberedList";

/** The markdown preceding the section's first fenced code block — the prose
 *  to show above the extracted `CommandList`. */
function proseBeforeFirstFence(body: string): string {
  const idx = body.indexOf("```");
  return idx === -1 ? body : body.slice(0, idx).trim();
}

export interface SectionBodyProps {
  section: OnboardingSection;
  onOpenFile: (path: string) => void;
}

/** Renders one onboarding-tour section's content, switching on `section.kind`. */
export function SectionBody({ section, onOpenFile }: SectionBodyProps) {
  const t = useTranslations("onboarding");

  switch (section.kind) {
    case "architecture":
      return (
        <>
          <Markdown>{section.body}</Markdown>
          {section.diagram && <MermaidDiagram chart={section.diagram} />}
        </>
      );

    case "critical_paths":
      return (
        <>
          <Markdown>{section.body}</Markdown>
          <CriticalPathList links={section.links} onOpen={onOpenFile} />
        </>
      );

    case "how_to_run": {
      const commands = extractCommands(section.body);
      if (commands.length > 0) {
        return (
          <>
            <Markdown>{proseBeforeFirstFence(section.body)}</Markdown>
            <CommandList commands={commands} />
          </>
        );
      }
      return (
        <>
          <Markdown>{section.body}</Markdown>
          <p>{t("noCommands")}</p>
        </>
      );
    }

    case "reading_path":
      return (
        <>
          <Markdown>{section.body}</Markdown>
          <NumberedList items={section.links.map((l) => ({ primary: l.path, secondary: l.label }))} />
        </>
      );

    case "first_tasks":
      return (
        <>
          <Markdown>{section.body}</Markdown>
          <NumberedList items={section.links.map((l) => ({ primary: l.label, secondary: l.path }))} />
        </>
      );

    default:
      return null;
  }
}
