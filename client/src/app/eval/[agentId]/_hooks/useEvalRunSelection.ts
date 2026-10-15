"use client";

import React from "react";

/** How many runs the Compare action takes. */
export const COMPARE_COUNT = 2;

/**
 * Selection state for the RECENT RUNS table. A third selection replaces the
 * OLDEST selected one (spec edge case); Compare is enabled only at exactly two.
 */
export function useEvalRunSelection() {
  const [selected, setSelected] = React.useState<string[]>([]);

  const toggle = React.useCallback((id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      const next = [...prev, id];
      return next.length > COMPARE_COUNT ? next.slice(next.length - COMPARE_COUNT) : next;
    });
  }, []);

  const clear = React.useCallback(() => setSelected([]), []);

  return { selected, toggle, clear, canCompare: selected.length === COMPARE_COUNT };
}
