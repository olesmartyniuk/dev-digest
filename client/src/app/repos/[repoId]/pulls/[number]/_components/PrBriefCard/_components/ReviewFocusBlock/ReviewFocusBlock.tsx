/* ReviewFocusBlock — presentational: an ordered reading list (AC-7, array
   order IS the reading order). Clicking an entry opens that file on the
   Files changed tab via `onOpenFile` (D8, AC-11). */
"use client";

import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import type { ReviewFocusItem } from "@devdigest/shared";
import { s } from "./styles";

export function ReviewFocusBlock({
  items,
  onOpenFile,
}: {
  items: ReviewFocusItem[];
  onOpenFile: (path: string) => void;
}) {
  const t = useTranslations("brief");
  return (
    <div>
      <SectionLabel icon="Target">{t("block.reviewFocus")}</SectionLabel>
      {items.length === 0 ? (
        <div style={s.empty}>{t("reviewFocus.empty")}</div>
      ) : (
        <ol style={s.list}>
          {items.map((it, i) => (
            <li key={`${it.file}:${it.line}:${i}`}>
              <button
                type="button"
                style={s.button}
                aria-label={t("reviewFocus.open", { file: it.file })}
                onClick={() => onOpenFile(it.file)}
              >
                <span className="mono">
                  {it.file}:{it.line}
                </span>{" "}
                — {it.reason}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
