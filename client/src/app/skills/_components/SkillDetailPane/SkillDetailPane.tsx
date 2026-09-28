"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, Textarea, Toggle, Button, Badge } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SKILL_TYPES } from "../../constants";
import { useSkillDetailForm } from "./useSkillDetailForm";
import { s } from "./styles";

/** Skill detail/edit pane — the right side of the Skills Lab's master-detail
 *  layout. A body change is versioned server-side on save (see the skills
 *  module); name/description/type/enabled are not. */
export function SkillDetailPane({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { values, set, save, update } = useSkillDetailForm(skill);
  const untrusted = skill.source !== "manual";

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <Badge mono>{t("preview.version", { version: skill.version })}</Badge>
        <label style={s.enabledLabel}>
          {values.enabled ? t("preview.enabled") : t("preview.disabled")}
          <Toggle on={values.enabled} onChange={(v) => set("enabled", v)} size={16} />
        </label>
      </div>

      {untrusted && <div style={s.untrustedNotice}>{t("preview.untrustedNotice")}</div>}

      <FormField label={t("fields.name")} required>
        <TextInput value={values.name} onChange={(v) => set("name", v)} />
      </FormField>
      <FormField label={t("fields.description")}>
        <TextInput value={values.description} onChange={(v) => set("description", v)} />
      </FormField>
      <FormField label={t("fields.type")}>
        <SelectInput value={values.type} onChange={(v) => set("type", v as Skill["type"])} options={typeOptions} />
      </FormField>
      <FormField label={t("preview.bodyLabel")} hint={t("preview.bodyHint")}>
        <Textarea value={values.body} onChange={(v) => set("body", v)} rows={14} mono />
      </FormField>

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("preview.saving") : t("preview.save")}
        </Button>
      </div>
    </div>
  );
}
