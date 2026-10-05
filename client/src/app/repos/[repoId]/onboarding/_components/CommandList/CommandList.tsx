"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { IconBtn } from "@devdigest/ui";
import { s } from "./styles";

const COPIED_RESET_MS = 1500;

function CommandRow({ command }: { command: string }) {
  const t = useTranslations("onboarding");
  const [copied, setCopied] = React.useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_RESET_MS);
  };

  return (
    <li style={s.row}>
      <code className="mono" style={s.code}>
        {command}
      </code>
      <IconBtn icon={copied ? "Check" : "Copy"} label={copied ? t("copied") : t("copy")} onClick={copy} />
    </li>
  );
}

/** One row per grounded run command, each with its own copy-to-clipboard button (AC-8). */
export function CommandList({ commands }: { commands: string[] }) {
  return (
    <ol style={s.list}>
      {commands.map((cmd, i) => (
        <CommandRow key={`${i}-${cmd}`} command={cmd} />
      ))}
    </ol>
  );
}
