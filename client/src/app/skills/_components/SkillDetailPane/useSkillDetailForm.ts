"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";

export interface SkillFormValues {
  name: string;
  description: string;
  type: Skill["type"];
  body: string;
  enabled: boolean;
}

function valuesOf(skill: Skill): SkillFormValues {
  return {
    name: skill.name,
    description: skill.description,
    type: skill.type,
    body: skill.body,
    enabled: skill.enabled,
  };
}

/** Edit state for the skill detail pane — one object, reset when the
 *  selected skill changes (same shape as the Agent Editor's Config tab). */
export function useSkillDetailForm(skill: Skill) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const [values, setValues] = React.useState<SkillFormValues>(() => valuesOf(skill));

  const loadedId = React.useRef(skill.id);
  if (loadedId.current !== skill.id) {
    loadedId.current = skill.id;
    setValues(valuesOf(skill));
  }

  const set = React.useCallback(
    <K extends keyof SkillFormValues>(key: K, value: SkillFormValues[K]) =>
      setValues((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const save = React.useCallback(() => {
    update.mutate(
      { id: skill.id, patch: values },
      {
        onSuccess: (data) => toast.success(t("preview.saved", { version: data.version })),
      },
    );
  }, [update, skill.id, values, toast, t]);

  return { values, set, save, update };
}
