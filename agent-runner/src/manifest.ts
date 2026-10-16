import { parse } from 'yaml';
import { AgentManifest, CI_SLUG_RE } from '@devdigest/shared';

export type ManifestResult =
  | { ok: true; manifest: AgentManifest }
  | { ok: false; error: string };

/**
 * Parse + validate a manifest with the SAME shared schema the studio writes it
 * with. The manifest is repo-editable, so every skill slug is also checked
 * against `CI_SLUG_RE` before it is turned into a file path.
 */
export function loadManifest(text: string): ManifestResult {
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (e) {
    return { ok: false, error: `invalid YAML: ${(e as Error).message}` };
  }
  const parsed = AgentManifest.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    return { ok: false, error: msg };
  }
  const bad = parsed.data.skills.find((s) => !CI_SLUG_RE.test(s));
  if (bad !== undefined) return { ok: false, error: `skills: invalid skill slug "${bad}"` };
  return { ok: true, manifest: parsed.data };
}
