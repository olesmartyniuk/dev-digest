/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { FindingRecord, PrFile } from "@devdigest/shared";
import { severityColor } from "@/lib/severity";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  lineKey,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { partitionFindings, worstSeverity, type DiffFindingApi } from "../findings";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

/** Findings anchored to a given parsed line — only the RIGHT-side key matters
 *  (findings always anchor to the new line, see `findings.ts`). `undefined`
 *  (not `[]`) when there is no match, so callers can render nothing rather
 *  than an empty rail. */
function findingsForLine(
  ln: Line,
  matched: Map<string, FindingRecord[]>,
): FindingRecord[] | undefined {
  if (matched.size === 0) return undefined;
  const key = lineKey("RIGHT", ln.newNo);
  return key ? matched.get(key) : undefined;
}

export function FileCard({
  file,
  commenting,
  findings,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Shared by both the comments and findings partitions below.
  const renderedKeys = React.useMemo(() => {
    const keys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) keys.add(k);
    return keys;
  }, [lines]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, renderedKeys]);

  const fileFindings = React.useMemo(
    () => findings?.findings.filter((f) => f.file === file.path) ?? [],
    [findings, file.path],
  );
  const { matched: matchedFindings, unanchored } = React.useMemo(
    () => partitionFindings(fileFindings, renderedKeys),
    [fileFindings, renderedKeys],
  );

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
        {fileFindings.length > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
            <span
              role="img"
              aria-label={t("diffViewer.fileHasFindings", { count: fileFindings.length })}
              title={t("diffViewer.fileHasFindings", { count: fileFindings.length })}
              style={{ ...s.findingDot, background: severityColor(worstSeverity(fileFindings) ?? "") }}
            />
            {fileFindings.length}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                findingsSlot={findingsForLine(ln, matchedFindings)?.map((f) => (
                  <React.Fragment key={f.id}>{findings!.renderFinding(f)}</React.Fragment>
                ))}
              />
            ))
          )}
          {unanchored.length > 0 && (
            <div style={s.unanchoredWrap}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
                {t("diffViewer.unanchoredFindings")}
              </span>
              {unanchored.map((f) => (
                <React.Fragment key={f.id}>{findings!.renderFinding(f)}</React.Fragment>
              ))}
            </div>
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
