import type { CiVerdict } from "@devdigest/shared";

/** ci.json `runs.status.*` key for a verdict. */
export function verdictKey(status: CiVerdict): "succeeded" | "noFindings" | "failed" {
  return status === "no_findings" ? "noFindings" : status;
}

/** Badge colours per verdict (never colour alone — the label is always shown). */
export function verdictColors(status: CiVerdict): { color: string; bg: string } {
  if (status === "failed") return { color: "var(--crit)", bg: "var(--crit-bg)" };
  if (status === "no_findings") return { color: "var(--ok)", bg: "var(--ok-bg)" };
  return { color: "var(--accent)", bg: "var(--bg-hover)" };
}

/** "4.2s" / "1m 05s"; "—" when unknown. */
export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

/** Only https links are rendered as anchors. */
export function safeJobUrl(url: string | null): string | null {
  return url && url.startsWith("https://") ? url : null;
}
