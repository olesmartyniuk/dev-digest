"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAddRepo } from "@/lib/hooks";
import { ApiError } from "@/lib/api";

/**
 * Add-repository form: the URL field, the Esc escape hatch, and the import
 * itself (which navigates to the new repo's PR list on success).
 */
export function useAddRepoForm() {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const addRepo = useAddRepo();

  const close = React.useCallback(() => router.push("/"), [router]);

  // Escapable (the footer advertises Esc — make it real).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const submit = React.useCallback(async () => {
    if (!repoUrl.trim()) return;
    setError(null);
    try {
      const repo = await addRepo.mutateAsync(repoUrl.trim());
      router.push(`/repos/${repo.id}/pulls`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add repository");
    }
  }, [repoUrl, addRepo, router]);

  return { repoUrl, setRepoUrl, error, submit, close, addRepo };
}
