"use client";

import { useFormatter, useTranslations } from "next-intl";

export interface IndexStatusLineProps {
  count: number;
  scannedAt: string | null;
}

/** "N files · scanned …" — no chunk count (AC-17; this is a folder scan, not a semantic index). */
export function IndexStatusLine({ count, scannedAt }: IndexStatusLineProps) {
  const t = useTranslations("context");
  const format = useFormatter();
  if (!scannedAt) return <span>{t("status.never")}</span>;
  return <span>{t("status.line", { count, ago: format.relativeTime(new Date(scannedAt)) })}</span>;
}
