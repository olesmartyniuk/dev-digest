"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, IconBtn } from "@devdigest/ui";
import { TextInput, Checkbox } from "@devdigest/ui";
import type { InheritedContext } from "@devdigest/shared";
import { ContextDocPreview } from "./ContextDocPreview";
import { useContextPicker } from "./useContextPicker";
import { buildAllRows, moveAttached, summarize, toggleAttached } from "./helpers";
import { s } from "./styles";

export interface ContextPickerProps {
  repoId: string | null;
  attached: string[];
  onChange: (paths: string[]) => void;
  /** Disables attach/reorder actions while a save is in flight. */
  busy?: boolean;
  inherited?: InheritedContext[];
  /** The run-time (de-duplicated) order used for the token/over-cap estimate. Defaults to `attached`. */
  effective?: string[];
}

/**
 * The shared attach/reorder/preview widget behind the Agent Editor's Context
 * tab and the Skills Lab's "Project context to use" section. Paths only —
 * never writes to the clone (D3).
 */
export function ContextPicker({
  repoId,
  attached,
  onChange,
  busy,
  inherited = [],
  effective,
}: ContextPickerProps) {
  const t = useTranslations("context");
  const { listing, documents, filter, setFilter, previewPath, openPreview, closePreview, isLoading, isError } =
    useContextPicker(repoId);

  const effectivePaths = effective ?? attached;
  const documentsByPath = React.useMemo(() => new Map(documents.map((d) => [d.path, d])), [documents]);
  const summary = React.useMemo(
    () => summarize(effectivePaths, documents, listing?.cap_chars ?? Number.POSITIVE_INFINITY),
    [effectivePaths, documents, listing?.cap_chars],
  );
  const allRows = React.useMemo(() => buildAllRows(documents, attached, filter), [documents, attached, filter]);
  const inheritedCount = React.useMemo(
    () => inherited.reduce((n, link) => n + link.paths.length, 0),
    [inherited],
  );

  // Gate every mutating action behind `busy`, so a reorder/attach double-click
  // mid-save can't race the in-flight PUT.
  const emit = React.useCallback(
    (paths: string[]) => {
      if (!busy) onChange(paths);
    },
    [busy, onChange],
  );

  if (!repoId) {
    return <EmptyState icon="FileText" title={t("picker.noRepo")} />;
  }
  if (isError) {
    return <ErrorState body={t("loadError")} />;
  }
  if (isLoading || !listing) {
    return null;
  }
  if (listing.clone_status !== "ready") {
    const title = listing.clone_status === "not_cloned" ? t("empty.notClonedTitle") : t("empty.title");
    const body = listing.clone_status === "not_cloned" ? t("empty.notClonedBody") : t("empty.missingBody");
    return <EmptyState icon="FileText" title={title} body={body} />;
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <span style={s.headerCount}>
          {t("picker.attachedCount", { attached: attached.length, total: documents.length })}
        </span>
        {inheritedCount > 0 && (
          <span style={s.headerMuted}>{t("picker.inheritedCount", { count: inheritedCount })}</span>
        )}
        <span style={s.headerMuted}>{t("picker.tokens", { tokens: summary.tokens })}</span>
        {summary.overCap && (
          <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
            {t("picker.overCap", { cap: listing.cap_chars })}
          </Badge>
        )}
      </div>

      {inherited.length > 0 && (
        <div>
          <div style={s.sectionTitle}>{t("picker.inheritedCount", { count: inheritedCount })}</div>
          <div style={s.inheritedGroup}>
            {inherited.flatMap((link) =>
              link.paths.map((path) => (
                <div
                  key={`${link.skill_id}:${path}`}
                  style={link.enabled ? s.inheritedRow : { ...s.inheritedRow, ...s.inheritedRowDisabled }}
                >
                  <span style={s.inheritedPath}>{path}</span>
                  <span style={s.inheritedBadge}>
                    {t("picker.inheritedFrom", { name: link.skill_name })}
                    {!link.enabled ? ` · ${t("picker.inheritedDisabled")}` : null}
                  </span>
                </div>
              )),
            )}
          </div>
        </div>
      )}

      <div>
        <div style={s.sectionTitle}>{t("picker.attachedTitle")}</div>
        <div style={s.list}>
          {attached.map((path) => {
            const doc = documentsByPath.get(path);
            return (
              <div key={path} style={s.row}>
                <span style={s.rowPath}>{path}</span>
                {!doc && (
                  <Badge color="var(--warn)" bg="var(--warn-bg)">
                    {t("picker.notInRepo")}
                  </Badge>
                )}
                <div style={s.rowActions}>
                  <IconBtn
                    icon="ArrowUp"
                    label={t("picker.moveUp")}
                    size={22}
                    onClick={() => emit(moveAttached(attached, path, -1))}
                  />
                  <IconBtn
                    icon="ArrowDown"
                    label={t("picker.moveDown")}
                    size={22}
                    onClick={() => emit(moveAttached(attached, path, 1))}
                  />
                  {doc && (
                    <IconBtn icon="Eye" label={t("picker.preview")} size={22} onClick={() => openPreview(path)} />
                  )}
                  <IconBtn
                    icon="X"
                    label={t("picker.remove")}
                    size={22}
                    onClick={() => emit(toggleAttached(attached, path, false))}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <TextInput value={filter} onChange={setFilter} placeholder={t("picker.filterPlaceholder")} />

      <div>
        <div style={s.sectionTitle}>{t("picker.allTitle")}</div>
        <div style={s.list}>
          {allRows.map(({ doc, attached: isAttached }) => (
            <div key={doc.path} style={s.row}>
              <Checkbox checked={isAttached} onChange={(next) => emit(toggleAttached(attached, doc.path, next))} />
              <div style={s.docCell}>
                <span style={s.docName}>{doc.name}</span>
                <span style={s.docPath}>{doc.path}</span>
              </div>
              <Badge>{doc.root}</Badge>
              <span style={s.docUsedBy}>
                {t("list.usedBy", { agents: doc.used_by.agents, skills: doc.used_by.skills })}
              </span>
              <IconBtn icon="Eye" label={t("picker.preview")} size={22} onClick={() => openPreview(doc.path)} />
            </div>
          ))}
        </div>
      </div>

      {previewPath && (
        <ContextDocPreview repoId={repoId} path={previewPath} onClose={closePreview} />
      )}
    </div>
  );
}
