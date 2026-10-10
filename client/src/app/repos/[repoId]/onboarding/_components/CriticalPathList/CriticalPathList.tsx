"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { OnboardingLink } from "@devdigest/shared";
import { s } from "./styles";

/** Critical-path rows: mono path + one-line reason + an "Open" button that
 *  opens the in-app drawer — never a direct link out to GitHub (AC-7). */
export function CriticalPathList({
  links,
  onOpen,
}: {
  links: OnboardingLink[];
  onOpen: (path: string) => void;
}) {
  const t = useTranslations("onboarding");
  return (
    <ol style={s.list}>
      {links.map((link) => (
        <li key={link.path} style={s.row}>
          <span style={s.textWrap}>
            <div style={s.path}>{link.path}</div>
            <div style={s.label}>{link.label}</div>
          </span>
          <Button kind="ghost" size="sm" icon="Eye" onClick={() => onOpen(link.path)}>
            {t("open")}
          </Button>
        </li>
      ))}
    </ol>
  );
}
