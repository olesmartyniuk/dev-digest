"use client";

import React from "react";
import type { DiffCommentApi } from "@/components/diff-viewer";
import { useCreatePrComment, usePrComments } from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";

/**
 * The inline-comment adapter handed to `DiffViewer`.
 *
 * Memoized as a whole: the viewer passes it down to every line, so rebuilding
 * the object each render would defeat memoization all the way down the diff.
 */
export function useDiffComments(prId: string | null, canComment?: boolean) {
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);

  const onSubmit = React.useCallback<DiffCommentApi["onSubmit"]>(
    async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
    [create],
  );

  const commenting: DiffCommentApi = React.useMemo(
    () => ({
      comments: comments ?? [],
      canComment: !!canComment && !!prId,
      showComments,
      posting: create.isPending,
      onSubmit,
    }),
    [comments, canComment, prId, showComments, create.isPending, onSubmit],
  );

  const toggleComments = React.useCallback(() => setShowComments((v) => !v), []);

  return { commenting, commentCount: comments?.length ?? 0, showComments, toggleComments };
}
