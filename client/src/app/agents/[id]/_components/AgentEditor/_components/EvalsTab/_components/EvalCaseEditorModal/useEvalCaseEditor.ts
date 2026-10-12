"use client";

import React from "react";
import type { EvalCaseBodyInput, EvalCaseView } from "@devdigest/shared";
import { useCreateEvalCase, useEvalCase, useUpdateEvalCase } from "@/lib/hooks/eval";
import { appendSkeleton, hasContradiction, parseExpected } from "./helpers";

const EMPTY_EXPECTED = "[]";

/** Read the PR-meta fields the editor owns out of the opaque `input_meta` jsonb. */
function metaOf(c: EvalCaseView | undefined): { title: string; body: string } {
  const m = (c?.input_meta ?? {}) as { title?: unknown; body?: unknown };
  return {
    title: typeof m.title === "string" ? m.title : "",
    body: typeof m.body === "string" ? m.body : "",
  };
}

/**
 * Form state + save orchestration for the eval case editor. `caseId === null`
 * means a new case. Save / Run case are gated on the expected-output JSON being
 * valid (AC-28); Run case additionally needs a saved, unmodified case, since a
 * run executes the STORED case.
 */
export function useEvalCaseEditor(agentId: string, caseId: string | null, onClose: () => void) {
  const existing = useEvalCase(caseId);
  const create = useCreateEvalCase(agentId);
  const update = useUpdateEvalCase(agentId);

  const [name, setName] = React.useState("");
  const [diff, setDiff] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [expectedText, setExpectedText] = React.useState(EMPTY_EXPECTED);
  const [tab, setTab] = React.useState<"diff" | "prMeta">("diff");
  const [dirty, setDirty] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Hydrate once per loaded case (the modal is keyed by case id).
  const hydrated = React.useRef<string | null>(null);
  const data = existing.data;
  React.useEffect(() => {
    if (!data || hydrated.current === data.id) return;
    hydrated.current = data.id;
    const meta = metaOf(data);
    setName(data.name);
    setDiff(data.input_diff);
    setTitle(meta.title);
    setBody(meta.body);
    setExpectedText(JSON.stringify(data.expected_output ?? [], null, 2));
    setDirty(false);
  }, [data]);

  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setDirty(true);
    };

  const parsed = React.useMemo(() => parseExpected(expectedText), [expectedText]);
  const contradictory = parsed.ok && hasContradiction(parsed.items);
  const isNew = caseId === null;
  const canSave = parsed.ok && name.trim().length > 0 && diff.trim().length > 0;
  const canRun = parsed.ok && !isNew && !dirty;
  const isSaving = create.isPending || update.isPending;

  const save = React.useCallback(() => {
    if (!parsed.ok) return;
    setError(null);
    const payload: EvalCaseBodyInput = {
      name: name.trim(),
      input_diff: diff,
      input_meta: { title, body },
      expected_output: parsed.items,
    };
    const opts = {
      onSuccess: () => onClose(),
      onError: (e: Error) => setError(e.message),
    };
    if (caseId) update.mutate({ id: caseId, body: payload }, opts);
    else create.mutate(payload, opts);
  }, [parsed, name, diff, title, body, caseId, update, create, onClose]);

  return {
    existing: data,
    isLoadingCase: !isNew && existing.isLoading,
    loadFailed: !isNew && existing.isError,
    isNew,
    name,
    setName: edit(setName),
    diff,
    setDiff: edit(setDiff),
    title,
    setTitle: edit(setTitle),
    body,
    setBody: edit(setBody),
    expectedText,
    setExpectedText: edit(setExpectedText),
    addSkeleton: () => {
      setExpectedText((t) => appendSkeleton(t));
      setDirty(true);
    },
    tab,
    setTab,
    parsed,
    contradictory,
    canSave,
    canRun,
    dirty,
    isSaving,
    error,
    save,
  };
}
