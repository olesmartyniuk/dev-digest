"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Checkbox,
  FormField,
  Icon,
  Modal,
  Skeleton,
  TextInput,
  Textarea,
  Toggle,
} from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useAgents } from "@/lib/hooks/agents";
import { useConventionSkillDraft, useCreateConventionSkill } from "@/lib/hooks/conventions";
import { MODAL_WIDTH, BODY_ROWS } from "./constants";
import { useSkillDraftForm } from "./useSkillDraftForm";
import { s } from "./styles";

/**
 * "Create skill from conventions" — the last step of the pipeline.
 *
 * The body arrives pre-merged from the server and is then FULLY editable: the
 * extractor's job is to save the user from writing a rulebook from scratch,
 * not to decide its final wording. Attaching the result to an agent is offered
 * here because a skill nothing uses changes no review.
 */
export function CreateSkillModal({
  repoId,
  acceptedCount,
  onClose,
  onCreated,
}: {
  repoId: string;
  acceptedCount: number;
  onClose: () => void;
  onCreated?: (skill: Skill) => void;
}) {
  const t = useTranslations("conventions");
  const { data: draft, isLoading } = useConventionSkillDraft(repoId);
  const { data: agents } = useAgents();
  const create = useCreateConventionSkill(repoId);
  const form = useSkillDraftForm(draft);
  const [error, setError] = React.useState<string | null>(null);

  const canSave = form.seeded && form.name.trim().length > 0 && form.body.trim().length > 0;

  const submit = async () => {
    setError(null);
    try {
      const result = await create.mutateAsync({
        name: form.name.trim(),
        description: form.description,
        body: form.body,
        enabled: form.enabled,
        ...(form.agentIds.length > 0 ? { agent_ids: form.agentIds } : {}),
      });
      onCreated?.(result.skill);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("modal.saveFailed"));
    }
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("modal.title")}
      subtitle={draft?.name}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {error && <span style={s.error}>{error}</span>}
          {!error && <span style={s.footerNote}>{t("modal.footerNote")}</span>}
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Sparkles"
            disabled={!canSave || create.isPending}
            onClick={submit}
          >
            {create.isPending ? t("modal.saving") : t("modal.save")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.notice}>
          <Icon.Wrench size={14} />
          <span>{t("modal.mergedFrom", { count: acceptedCount })}</span>
        </div>

        {isLoading || !form.seeded ? (
          <Skeleton height={320} />
        ) : (
          <>
            <div style={s.row}>
              <div style={s.rowItem}>
                <FormField label={t("modal.name")} required>
                  <TextInput value={form.name} onChange={form.setName} />
                </FormField>
              </div>
              <div style={s.rowItem}>
                <FormField label={t("modal.enabled")} hint={t("modal.enabledHint")}>
                  <Toggle on={form.enabled} onChange={form.setEnabled} />
                </FormField>
              </div>
            </div>

            <FormField label={t("modal.description")}>
              <TextInput value={form.description} onChange={form.setDescription} />
            </FormField>

            <FormField label={t("modal.body")} required hint={t("modal.bodyHint")}>
              <Textarea value={form.body} onChange={form.setBody} rows={BODY_ROWS} mono />
            </FormField>

            <FormField label={t("modal.attachTo")} hint={t("modal.attachToHint")}>
              <div style={s.agents}>
                {(agents ?? []).length === 0 && <span style={s.agentModel}>{t("modal.noAgents")}</span>}
                {(agents ?? []).map((a) => (
                  <label key={a.id} style={s.agentRow}>
                    <Checkbox
                      checked={form.agentIds.includes(a.id)}
                      onChange={() => form.toggleAgent(a.id)}
                    />
                    <span style={s.agentName}>{a.name}</span>
                    <span className="mono" style={s.agentModel}>
                      {a.model}
                    </span>
                  </label>
                ))}
              </div>
            </FormField>
          </>
        )}
      </div>
    </Modal>
  );
}
