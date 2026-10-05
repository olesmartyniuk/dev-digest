import React from "react";
import { s } from "./styles";

export interface NumberedListItem {
  primary: string;
  secondary?: string;
}

/** A numbered list with a circular badge per row — shared by `reading_path`
 *  (path on top, rationale beneath) and `first_tasks` (task, then pointer). */
export function NumberedList({ items }: { items: NumberedListItem[] }) {
  return (
    <ol style={s.list}>
      {items.map((item, i) => (
        <li key={`${i}-${item.primary}`} style={s.item}>
          <span style={s.badge}>{i + 1}</span>
          <span style={s.textWrap}>
            <div style={s.primary}>{item.primary}</div>
            {item.secondary && <div style={s.secondary}>{item.secondary}</div>}
          </span>
        </li>
      ))}
    </ol>
  );
}
