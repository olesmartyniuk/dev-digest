"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, IconBtn, Badge } from "@devdigest/ui";
import type { EvalCaseView } from "@devdigest/shared";
import { s, STATUS_COLOR } from "./styles";

const STATUS_ICON = {
  passed: Icon.CheckCircle,
  failed: Icon.XCircle,
  errored: Icon.AlertTriangle,
  never_run: Icon.Clock,
} as const;

/** One eval case: status (icon + text, never colour alone), name, "expected N, got M", chip, run/edit/delete. */
export function EvalCaseRow({
  c,
  running,
  disabled,
  onRun,
  onEdit,
  onDelete,
}: {
  c: EvalCaseView;
  running: boolean;
  disabled?: boolean;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("eval");
  const status = c.last_run.status;
  const StatusIcon = STATUS_ICON[status];
  const statusText =
    status === "passed"
      ? t("evalsTab.passed")
      : status === "failed"
        ? t("evalsTab.failed")
        : status === "errored"
          ? t("evalsTab.errored")
          : t("evalsTab.neverRun");
  const detail =
    status === "never_run"
      ? t("evalsTab.neverRun")
      : status === "errored"
        ? t("evalsTab.errored")
        : t("evalsTab.expectedGot", {
            expected: c.last_run.expected_count,
            actual: c.last_run.actual_count ?? 0,
          });

  return (
    <div style={s.row}>
      <span style={s.status(STATUS_COLOR[status])}>
        <StatusIcon size={14} />
        {statusText}
      </span>
      <span style={s.name}>{c.name}</span>
      <span style={s.detail}>{detail}</span>
      {c.summary.chip ? (
        <Badge mono>{c.summary.chip}</Badge>
      ) : (
        <Badge mono>{t("evalsTab.emptyExpectation")}</Badge>
      )}
      <div style={s.controls}>
        <IconBtn
          icon="Play"
          label={running ? t("evalsTab.running") : t("evalsTab.run")}
          size={26}
          onClick={disabled || running ? undefined : onRun}
        />
        <IconBtn icon="Edit" label={t("evalsTab.edit")} size={26} onClick={onEdit} />
        <IconBtn icon="Trash" label={t("evalsTab.delete")} size={26} danger onClick={onDelete} />
      </div>
    </div>
  );
}
