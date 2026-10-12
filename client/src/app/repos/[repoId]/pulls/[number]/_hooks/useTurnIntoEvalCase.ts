/* useTurnIntoEvalCase — route-level wrapper over the lib hook. Owns the toast
   copy: success links to the agent's Evals tab, and a 409 message names the
   failed precondition. Toasts go through the module-level `notify` bridge, so
   no provider is needed in tests. Exposes which finding is in flight. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { notify } from "@/lib/toast";
import { useTurnIntoEvalCase as useTurnMutation } from "@/lib/hooks/eval";

export function useTurnIntoEvalCase() {
  const t = useTranslations("eval");
  const { mutate } = useTurnMutation();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const turn = React.useCallback(
    (findingId: string) => {
      setPendingId(findingId);
      mutate(findingId, {
        onSuccess: (res) =>
          notify.success(t(res.created ? "turnIntoCase.created" : "turnIntoCase.existing"), {
            label: t("turnIntoCase.openEvals"),
            href: `/agents/${res.case.owner_id}?tab=evals`,
          }),
        onError: (err) => notify.error(err.message),
        onSettled: () => setPendingId(null),
      });
    },
    [mutate, t],
  );

  return React.useMemo(() => ({ turn, pendingId }), [turn, pendingId]);
}
