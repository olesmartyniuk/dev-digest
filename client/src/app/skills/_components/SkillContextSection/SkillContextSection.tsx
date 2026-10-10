"use client";

import { useTranslations } from "next-intl";
import { SectionLabel, Badge } from "@devdigest/ui";
import { ContextPicker } from "@/components/context-picker";
import { useSkillContextSection } from "./useSkillContextSection";
import { s } from "./styles";

/**
 * Skills Lab — "Project context to use" (SPEC-01 / L05, AC-7/AC-9). A
 * SECTION, not a tab (the spec requires this stay visible alongside the
 * skill's other fields). It saves on its own through its own mutation
 * (`useSetSkillContext`) and is independent of `SkillDetailPane`'s form Save
 * button — attaching a document here is not a "body" edit.
 */
export function SkillContextSection({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const ct = useTranslations("context");
  const { repoId, attached, setAttached, busy, preview, capChars } = useSkillContextSection(skillId);

  return (
    <div style={s.wrap}>
      <SectionLabel>{t("context.title")}</SectionLabel>
      <p style={s.hint}>{t("context.inheritNote")}</p>
      <ContextPicker repoId={repoId} attached={attached} onChange={setAttached} busy={busy} />

      {attached.length > 0 && (
        <div style={s.serializesAs}>
          <Badge mono>{t("context.serializesAs")}</Badge>
          {preview?.text ? (
            <pre style={s.pre}>{preview.text}</pre>
          ) : preview ? (
            <p style={s.empty}>{t("context.previewEmpty")}</p>
          ) : null}
          {preview?.truncated && capChars != null && (
            <p style={s.empty}>{ct("picker.overCap", { cap: capChars })}</p>
          )}
        </div>
      )}
    </div>
  );
}
