"use client";

import React from "react";
import type { Convention, ConventionCategory } from "@devdigest/shared";

/**
 * Edit-mode state for one convention card: the draft rule/category, whether
 * the form is open, and reset-on-cancel. Kept out of the component so the card
 * stays a render — the route's rule is "components render, hooks orchestrate".
 */
export interface ConventionEdit {
  editing: boolean;
  rule: string;
  category: ConventionCategory;
  dirty: boolean;
  setRule: (v: string) => void;
  setCategory: (v: ConventionCategory) => void;
  open: () => void;
  /** Leave edit mode keeping the draft (used after a successful save). */
  close: () => void;
  /** Leave edit mode and discard the draft. */
  cancel: () => void;
}

export function useConventionEdit(convention: Convention): ConventionEdit {
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(convention.rule);
  const [category, setCategory] = React.useState<ConventionCategory>(convention.category);

  // A re-scan or a save replaces the row underneath us; re-seed the draft so a
  // closed form never shows the previous scan's text.
  React.useEffect(() => {
    if (editing) return;
    setRule(convention.rule);
    setCategory(convention.category);
  }, [convention.rule, convention.category, editing]);

  const open = React.useCallback(() => setEditing(true), []);
  const close = React.useCallback(() => setEditing(false), []);
  const cancel = React.useCallback(() => {
    setRule(convention.rule);
    setCategory(convention.category);
    setEditing(false);
  }, [convention.rule, convention.category]);

  const dirty = rule.trim() !== convention.rule || category !== convention.category;

  return { editing, rule, category, dirty, setRule, setCategory, open, close, cancel };
}
