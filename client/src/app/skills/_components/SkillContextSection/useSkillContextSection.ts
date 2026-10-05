"use client";

import { useActiveRepo } from "@/lib/repo-context";
import {
  useContextListing,
  useSetSkillContext,
  useSkillContext,
  useSkillContextPreview,
} from "@/lib/hooks/context";

/** Data + attach/reorder + preview orchestration for the Skills Lab's "Project context to use" section. */
export function useSkillContextSection(skillId: string) {
  const { repoId } = useActiveRepo();
  const { data } = useSkillContext(skillId);
  const mutation = useSetSkillContext(skillId);
  const preview = useSkillContextPreview(skillId, repoId);
  const listing = useContextListing(repoId);

  return {
    repoId,
    attached: data?.paths ?? [],
    setAttached: (paths: string[]) => mutation.mutate(paths),
    busy: mutation.isPending,
    preview: preview.data,
    capChars: listing.data?.cap_chars,
  };
}
