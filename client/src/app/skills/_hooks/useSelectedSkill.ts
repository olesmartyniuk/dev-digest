"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** `?skill=` state for the Skills Lab's master-detail layout. */
export function useSelectedSkill() {
  const search = useSearchParams();
  const router = useRouter();

  const selectedId = search.get("skill");

  const select = React.useCallback(
    (id: string | null) => {
      const sp = new URLSearchParams(search.toString());
      if (id) sp.set("skill", id);
      else sp.delete("skill");
      router.replace(`/skills?${sp.toString()}`);
    },
    [search, router],
  );

  return { selectedId, select };
}
