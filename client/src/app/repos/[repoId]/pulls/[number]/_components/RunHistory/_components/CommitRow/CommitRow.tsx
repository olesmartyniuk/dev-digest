"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import type { PrCommit } from "@devdigest/shared";
import { s } from "../../styles";

/** A commit marker in the timeline — shows which commit the next run ran against. */
export function CommitRow({ commit }: { commit: PrCommit }) {
  return (
    <div style={s.commitRow}>
      <Icon.GitCommit size={15} style={s.commitIcon} />
      <span className="mono" style={s.commitSha}>
        {commit.sha.slice(0, 7)}
      </span>
      <span style={s.commitMessage} title={commit.message}>
        {commit.message.split("\n")[0]}
      </span>
      <span style={s.commitMuted}>{commit.author}</span>
      {commit.committed_at && (
        <span style={s.commitMuted}>{new Date(commit.committed_at).toLocaleTimeString()}</span>
      )}
    </div>
  );
}
