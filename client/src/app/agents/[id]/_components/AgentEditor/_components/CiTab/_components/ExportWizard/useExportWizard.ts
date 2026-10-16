"use client";

import React from "react";
import type { CiExport, CiPostAs, CiPreview, CiTrigger } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useCiInstall, useCiPreview } from "@/lib/hooks/ci";
import { DEFAULT_POST_AS, DEFAULT_TRIGGERS, LAST_STEP, PROVIDER_UNSUPPORTED_CODE } from "./constants";
import { applyDraft, downloadZip } from "./helpers";

export type InstallMode = "open_pr" | "zip";

export interface UseExportWizardArgs {
  agentId: string;
  repoId: string;
  initialStep: 0 | 1;
}

/**
 * Wizard state. Everything lives here until the modal unmounts (AC-10), so
 * going Back never loses the user's edits. The preview (generated files) is
 * re-requested whenever the settings that shape it change.
 */
export function useExportWizard({ agentId, repoId, initialStep }: UseExportWizardArgs) {
  const previewMutation = useCiPreview(agentId);
  const installMutation = useCiInstall(agentId);

  const [step, setStep] = React.useState<number>(initialStep);
  const [postAs, setPostAsState] = React.useState<CiPostAs>(DEFAULT_POST_AS);
  const [triggers, setTriggersState] = React.useState<CiTrigger[]>(DEFAULT_TRIGGERS);
  const [preview, setPreview] = React.useState<CiPreview | null>(null);
  const [previewing, setPreviewing] = React.useState(false);
  const [previewError, setPreviewError] = React.useState<ApiError | null>(null);
  const [workflowDraft, setWorkflowDraft] = React.useState<string | null>(null);
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const [installMode, setInstallMode] = React.useState<InstallMode>("open_pr");
  const [installError, setInstallError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<CiExport | null>(null);
  const [zipped, setZipped] = React.useState(false);

  // Ignore a preview response that has been superseded by a newer request.
  const latest = React.useRef(0);
  const { mutateAsync: requestPreview } = previewMutation;

  const loadPreview = React.useCallback(
    async (opts: { postAs: CiPostAs; triggers: CiTrigger[] }): Promise<boolean> => {
      const ticket = ++latest.current;
      setPreviewing(true);
      setPreviewError(null);
      try {
        const p = await requestPreview({
          repo_id: repoId,
          target: "gha",
          post_as: opts.postAs,
          triggers: opts.triggers,
        });
        if (ticket !== latest.current) return false;
        setPreview(p);
        setWorkflowDraft(null);
        setSelectedPath((prev) => (p.files.some((f) => f.path === prev) ? prev : (p.files[0]?.path ?? null)));
        return true;
      } catch (e) {
        if (ticket === latest.current) setPreviewError(e instanceof ApiError ? e : new ApiError(String(e), 0));
        return false;
      } finally {
        if (ticket === latest.current) setPreviewing(false);
      }
    },
    [requestPreview, repoId],
  );

  // "Update CI config" opens straight on Preview, so fetch it on mount.
  const started = React.useRef(false);
  React.useEffect(() => {
    if (initialStep !== 1 || started.current) return;
    started.current = true;
    void loadPreview({ postAs: DEFAULT_POST_AS, triggers: DEFAULT_TRIGGERS });
  }, [initialStep, loadPreview]);

  const setPostAs = React.useCallback(
    (v: CiPostAs) => {
      setPostAsState(v);
      void loadPreview({ postAs: v, triggers });
    },
    [loadPreview, triggers],
  );

  const toggleTrigger = React.useCallback(
    (t: CiTrigger) => {
      const next = triggers.includes(t) ? triggers.filter((x) => x !== t) : [...triggers, t];
      if (next.length === 0) return; // at least one trigger must stay checked
      setTriggersState(next);
      void loadPreview({ postAs, triggers: next });
    },
    [loadPreview, postAs, triggers],
  );

  const providerBlocked = previewError?.code === PROVIDER_UNSUPPORTED_CODE;
  const canContinue = step === 0 ? !providerBlocked && !previewing : step < LAST_STEP ? !!preview && !previewing : false;

  const next = React.useCallback(async () => {
    if (!canContinue) return;
    if (step === 0) {
      // Reuse an existing preview (and the user's edit) when coming back to Target.
      if (preview || (await loadPreview({ postAs, triggers }))) setStep(1);
      return;
    }
    setStep((s) => Math.min(LAST_STEP, s + 1));
  }, [canContinue, step, preview, loadPreview, postAs, triggers]);

  const back = React.useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  const install = React.useCallback(async () => {
    if (!preview) return;
    setInstallError(null);
    const zip = installMode === "zip";
    try {
      const res = await installMutation.mutateAsync({
        repo_id: repoId,
        target: "gha",
        post_as: postAs,
        triggers,
        action: zip ? "files" : "open_pr",
        workflow: workflowDraft ?? undefined,
      });
      if (zip) {
        downloadZip(applyDraft(preview.files, workflowDraft));
        setZipped(true);
      }
      setResult(res);
    } catch (e) {
      setInstallError(e instanceof Error ? e.message : String(e));
      setInstallMode("zip"); // keep the manual route offered (AC-16)
    }
  }, [preview, installMode, installMutation, repoId, postAs, triggers, workflowDraft]);

  return {
    step,
    postAs,
    triggers,
    preview,
    previewing,
    previewError,
    providerBlocked,
    workflowDraft,
    setWorkflowDraft,
    selectedPath,
    setSelectedPath,
    installMode,
    setInstallMode,
    installing: installMutation.isPending,
    installError,
    result,
    zipped,
    canContinue,
    setPostAs,
    toggleTrigger,
    next,
    back,
    install,
  };
}
