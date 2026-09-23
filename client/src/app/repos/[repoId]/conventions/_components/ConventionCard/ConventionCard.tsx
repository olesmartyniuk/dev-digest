"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, IconBtn, ProgressBar, SelectInput, Textarea } from "@devdigest/ui";
import type { Convention, ConventionCategory, ConventionStatus } from "@devdigest/shared";
import { CONVENTION_CATEGORIES } from "../../constants";
import { citation, confidenceColor } from "../../helpers";
import { useConventionEdit } from "./useConventionEdit";
import { s } from "./styles";

/**
 * One extracted convention: the rule, the evidence it was verified against,
 * its confidence, and the accept / reject verdict.
 *
 * The evidence block is not decoration — it is the reason this list is worth
 * reading. Every card on screen already survived a code-level check that the
 * cited snippet exists at the cited line, so the user's judgement is only ever
 * "do we want this rule", never "is this rule even real".
 */
export function ConventionCard({
  convention,
  busy,
  onStatusChange,
  onEdit,
}: {
  convention: Convention;
  busy?: boolean;
  onStatusChange: (status: ConventionStatus) => void;
  onEdit: (patch: { rule: string; category: ConventionCategory }) => Promise<unknown>;
}) {
  const t = useTranslations("conventions");
  const edit = useConventionEdit(convention);
  const [copied, setCopied] = React.useState(false);

  const accepted = convention.status === "accepted";
  const rejected = convention.status === "rejected";

  const copyCitation = async () => {
    try {
      await navigator.clipboard.writeText(citation(convention));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard is unavailable (insecure context / denied) — the path is
      // still readable on screen, so there is nothing to recover from.
    }
  };

  const save = async () => {
    await onEdit({ rule: edit.rule.trim(), category: edit.category });
    edit.close();
  };

  return (
    <div style={s.card(convention.status)}>
      <div style={s.main}>
        <div style={s.badges}>
          <Badge>{t(`category.${convention.category}`)}</Badge>
          {convention.origin === "config" && (
            <span title={t("card.originConfigTitle")}>
              <Badge color="var(--ok)" bg="var(--ok-bg)" icon="FileText">
                {t("card.originConfig")}
              </Badge>
            </span>
          )}
        </div>

        {edit.editing ? (
          <div style={s.editFields}>
            <Textarea value={edit.rule} onChange={edit.setRule} rows={3} />
            <SelectInput
              value={edit.category}
              onChange={(v) => edit.setCategory(v as ConventionCategory)}
              options={CONVENTION_CATEGORIES.map((c) => ({ value: c, label: t(`category.${c}`) }))}
            />
          </div>
        ) : (
          <div style={s.rule}>{convention.rule}</div>
        )}

        {!edit.editing && convention.rationale && (
          <div style={s.rationale}>{convention.rationale}</div>
        )}

        <div style={s.evidence}>
          <div style={s.evidenceHeader}>
            <span className="mono" style={s.evidencePath}>
              {citation(convention)}
            </span>
            <IconBtn
              icon={copied ? "Check" : "Copy"}
              label={t("card.copyCitation")}
              size={24}
              onClick={copyCitation}
            />
          </div>
          <pre className="mono" style={s.snippet}>
            {convention.evidence.snippet}
          </pre>
        </div>

        <div style={s.confidenceRow}>
          <span>{t("card.confidence")}</span>
          <div style={s.confidenceBar}>
            <ProgressBar
              value={convention.confidence * 100}
              color={confidenceColor(convention.confidence)}
            />
          </div>
          <span className="mono tnum">{Math.round(convention.confidence * 100)}%</span>
        </div>

        {edit.editing && (
          <div style={s.editRow}>
            <Button
              kind="primary"
              size="sm"
              icon="Check"
              disabled={!edit.dirty || edit.rule.trim().length < 4 || busy}
              onClick={save}
            >
              {t("card.saveEdit")}
            </Button>
            <Button kind="ghost" size="sm" onClick={edit.cancel}>
              {t("card.cancelEdit")}
            </Button>
          </div>
        )}
      </div>

      <div style={s.actions}>
        <Button
          kind={accepted ? "primary" : "secondary"}
          size="sm"
          icon="Check"
          full
          disabled={busy}
          // Clicking an accepted card takes the verdict back rather than being
          // inert: a misclick has to be undoable without a re-scan.
          onClick={() => onStatusChange(accepted ? "pending" : "accepted")}
        >
          {accepted ? t("card.accepted") : t("card.accept")}
        </Button>
        <Button
          kind={rejected ? "danger" : "ghost"}
          size="sm"
          icon="X"
          full
          disabled={busy}
          onClick={() => onStatusChange(rejected ? "pending" : "rejected")}
        >
          {rejected ? t("card.rejected") : t("card.reject")}
        </Button>
        {!edit.editing && (
          <Button kind="ghost" size="sm" icon="Edit" full disabled={busy} onClick={edit.open}>
            {t("card.edit")}
          </Button>
        )}
      </div>
    </div>
  );
}
