"use client";

import React from "react";
import { Card, Icon } from "@devdigest/ui";
import { s } from "./styles";

export interface SectionCardProps {
  kind: string;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/** One collapsible onboarding-tour section card. Collapse state is pure UI,
 *  so it's local (AC-3 — `data-kind` identifies the section for e2e/tests). */
export function SectionCard({ kind, title, defaultOpen = true, children }: SectionCardProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;

  return (
    <div data-kind={kind}>
      <Card style={s.card}>
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={s.header}>
          <Chevron size={16} style={s.chevron} />
          {title}
        </button>
        {open && <div style={s.body}>{children}</div>}
      </Card>
    </div>
  );
}
