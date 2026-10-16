/* useAgentSelection — which agents are ticked for a multi-agent run. Local UI
   state (nothing server-side); starts empty (D15: none pre-ticked). Selection
   order = toggle order. */
"use client";

import React from "react";

export function useAgentSelection() {
  const [selected, setSelected] = React.useState<string[]>([]);

  const isSelected = React.useCallback((id: string) => selected.includes(id), [selected]);
  const toggle = React.useCallback(
    (id: string) =>
      setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    [],
  );
  const clear = React.useCallback(() => setSelected([]), []);
  const selectAll = React.useCallback((ids: string[]) => setSelected([...new Set(ids)]), []);

  return { selected, isSelected, toggle, clear, selectAll, count: selected.length };
}
