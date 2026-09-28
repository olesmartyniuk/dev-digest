"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Drawer, FormField, TextInput, Textarea, Button, Markdown } from "@devdigest/ui";
import { useCreateSkill } from "@/lib/hooks/skills";
import { deriveNameFromMarkdown } from "./helpers";
import { s } from "./styles";

/**
 * Import-from-file drawer — the only import path this lesson ships (the
 * i18n's "From URL"/"Community" tabs stay unused). The file is read entirely
 * client-side as TEXT (`FileReader.readAsText`) and never executed; nothing
 * is persisted until the author reviews the preview and confirms. The
 * created skill is `source: 'imported_url'`, left DISABLED by the server
 * until a human vets and enables it.
 */
export function ImportSkillDrawer({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (id: string) => void;
}) {
  const t = useTranslations("skills");
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const derivedName = deriveNameFromMarkdown(body);
  const resolvedName = name.trim() || derivedName || "";

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setBody(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  const submit = async () => {
    setError(null);
    try {
      const skill = await create.mutateAsync({
        name: resolvedName || t("create.defaultName"),
        type: "custom",
        body,
        source: "imported_url",
      });
      onClose();
      onImported(skill.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("drawer.importFailed"));
    }
  };

  return (
    <Drawer
      width={640}
      title={t("drawer.title")}
      subtitle={t("drawer.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {error && <span style={s.error}>{error}</span>}
          <Button kind="ghost" onClick={onClose}>
            {t("drawer.cancel")}
          </Button>
          <Button kind="primary" icon="Upload" onClick={submit} disabled={create.isPending || !body.trim()}>
            {create.isPending ? t("file.importing") : t("file.import")}
          </Button>
        </div>
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,text/markdown,text/plain"
        style={{ display: "none" }}
        onChange={onFileChange}
      />
      <FormField label={t("file.nameLabel")} hint={t("file.nameHint")}>
        <TextInput value={name} onChange={setName} placeholder={resolvedName || t("file.namePlaceholder")} />
      </FormField>
      <FormField
        label={t("file.bodyLabel")}
        hint={t("file.bodyHint")}
        right={
          <Button kind="ghost" size="sm" icon="Upload" onClick={() => fileInputRef.current?.click()}>
            {t("drawer.chooseFile")}
          </Button>
        }
      >
        <Textarea value={body} onChange={setBody} rows={10} mono placeholder={t("file.bodyPlaceholder")} />
      </FormField>
      {body.trim() && (
        <FormField label={t("drawer.previewLabel")}>
          <div style={s.preview}>
            <Markdown>{body}</Markdown>
          </div>
        </FormField>
      )}
    </Drawer>
  );
}
