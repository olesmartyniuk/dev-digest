"use client";

import { useTranslations } from "next-intl";
import { Drawer, ErrorState, Skeleton, Tabs, Markdown } from "@devdigest/ui";
import { useOnboardingFile } from "@/lib/hooks/onboarding";
import { isMarkdownPath } from "../../helpers";
import type { ViewerMode } from "../../constants";
import { s } from "./styles";

export interface SourceFileDrawerProps {
  repoId: string;
  path: string | null;
  mode: ViewerMode;
  onMode: (mode: ViewerMode) => void;
  onClose: () => void;
}

/** The read-only in-app source-file viewer opened from a tour link (AC-7). No
 *  save/edit control — nothing here ever writes to the clone. */
export function SourceFileDrawer({ repoId, path, mode, onMode, onClose }: SourceFileDrawerProps) {
  const t = useTranslations("onboarding");
  const { data, isLoading, isError } = useOnboardingFile(repoId, path);

  if (!path) return null;

  const tabs = [
    { key: "preview", label: t("viewer.preview") },
    { key: "raw", label: t("viewer.raw") },
  ];

  return (
    <Drawer title={path} onClose={onClose}>
      <div style={s.body}>
        {isLoading && <Skeleton height={200} />}
        {isError && <ErrorState body={t("viewer.loadError")} />}
        {!isLoading && !isError && (
          <>
            {isMarkdownPath(path) ? (
              <>
                <Tabs tabs={tabs} value={mode} onChange={(k) => onMode(k as ViewerMode)} />
                {mode === "preview" ? (
                  <Markdown>{data?.content}</Markdown>
                ) : (
                  <pre style={s.source}>{data?.content ?? ""}</pre>
                )}
              </>
            ) : (
              <pre style={s.source}>{data?.content ?? ""}</pre>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}
