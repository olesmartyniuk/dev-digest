"use client";

import React from "react";

/**
 * A "just copied" flag that resets itself after `ms`.
 *
 * The timer is cleared on unmount — copying and then closing the drawer used to
 * leave a pending timeout that set state on an unmounted component.
 */
export function useCopiedFlag(ms = 1500): [boolean, () => void] {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const flag = React.useCallback(() => {
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), ms);
  }, [ms]);

  return [copied, flag];
}
