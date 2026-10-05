"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { ContextDocument } from "@devdigest/shared";
import { s } from "./styles";

export interface DocListProps {
  documents: ContextDocument[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

/** The left pane of the Project Context page — sorted as received (AC-2, AC-18). */
export function DocList({ documents, selectedPath, onSelect }: DocListProps) {
  const t = useTranslations("context");
  return (
    <div style={s.wrap}>
      {documents.map((doc) => (
        <div
          key={doc.path}
          role="button"
          tabIndex={0}
          style={doc.path === selectedPath ? { ...s.row, ...s.rowActive } : s.row}
          onClick={() => onSelect(doc.path)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onSelect(doc.path);
          }}
        >
          <span style={s.path}>{doc.path}</span>
          <div style={s.meta}>
            <Badge>{doc.root}</Badge>
            <span>{t("list.usedBy", { agents: doc.used_by.agents, skills: doc.used_by.skills })}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
