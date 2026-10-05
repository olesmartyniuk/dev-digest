"use client";

import { useTranslations } from "next-intl";
import { Tabs, Markdown } from "@devdigest/ui";
import { useContextDocument } from "@/lib/hooks/context";
import type { DocViewerMode } from "../../constants";
import { s } from "./styles";

export interface DocViewerProps {
  repoId: string;
  path: string | null;
  mode: DocViewerMode;
  onMode: (mode: DocViewerMode) => void;
}

/**
 * The right pane: a `mode.preview`/`mode.edit` tab toggle (preview by
 * default, AC-4). "Edit" is a READ-ONLY raw-source view — there is no save
 * button (D3): nothing here ever writes to the clone.
 */
export function DocViewer({ repoId, path, mode, onMode }: DocViewerProps) {
  const t = useTranslations("context");
  const { data } = useContextDocument(repoId, path);

  if (!path) {
    return (
      <div style={s.wrap}>
        <div style={s.hint}>{t("picker.noRepo")}</div>
      </div>
    );
  }

  const tabs = [
    { key: "preview", label: t("mode.preview") },
    { key: "edit", label: t("mode.edit") },
  ];

  return (
    <div style={s.wrap}>
      <Tabs tabs={tabs} value={mode} onChange={(k) => onMode(k as DocViewerMode)} />
      <div style={s.body}>
        {mode === "preview" ? (
          <Markdown>{data?.content}</Markdown>
        ) : (
          <pre style={s.source}>{data?.content ?? ""}</pre>
        )}
      </div>
    </div>
  );
}
