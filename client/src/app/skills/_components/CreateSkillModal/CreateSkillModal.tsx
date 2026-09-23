"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, SelectInput, Textarea } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useCreateSkill } from "@/lib/hooks/skills";
import { SKILL_TYPES } from "../../constants";
import { MODAL_WIDTH } from "./constants";
import { s } from "./styles";

/** Create-skill modal — "create from scratch": a manual skill, enabled by
 *  default (it's the author's own directive, not someone else's imported
 *  instructions). */
export function CreateSkillModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const t = useTranslations("skills");
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<Skill["type"]>("custom");
  const [body, setBody] = React.useState(t("create.defaultBody"));

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const submit = async () => {
    const skill = await create.mutateAsync({
      name: name.trim() || t("create.defaultName"),
      description,
      type,
      body,
    });
    onClose();
    onCreated(skill.id);
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={create.isPending}>
            {create.isPending ? t("create.creating") : t("create.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("fields.name")} required>
          <TextInput value={name} onChange={setName} placeholder={t("fields.namePlaceholder")} />
        </FormField>
        <FormField label={t("fields.description")}>
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("fields.descriptionPlaceholder")}
          />
        </FormField>
        <FormField label={t("fields.type")}>
          <SelectInput value={type} onChange={(v) => setType(v as Skill["type"])} options={typeOptions} />
        </FormField>
        <FormField label={t("preview.bodyLabel")} hint={t("preview.bodyHint")}>
          <Textarea value={body} onChange={setBody} rows={8} mono />
        </FormField>
      </div>
    </Modal>
  );
}
