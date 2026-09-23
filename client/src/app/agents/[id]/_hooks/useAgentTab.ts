"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Tabs the editor knows how to render; anything else falls back to config. */
const VALID_TABS = ["config", "skills"];

/** `?tab=` state for the agent editor, guarded against unknown values. */
export function useAgentTab(agentId: string) {
  const search = useSearchParams();
  const router = useRouter();

  const requested = search.get("tab") ?? "";
  const tab = VALID_TABS.includes(requested) ? requested : "config";

  const setTab = React.useCallback(
    (t: string) => {
      const sp = new URLSearchParams(search.toString());
      sp.set("tab", t);
      router.replace(`/agents/${agentId}?${sp.toString()}`);
    },
    [search, router, agentId],
  );

  return { tab, setTab };
}
