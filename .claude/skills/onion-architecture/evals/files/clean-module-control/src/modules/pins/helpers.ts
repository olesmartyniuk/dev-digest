export function normalizeNote(note?: string): string | null {
  const trimmed = note?.trim();
  return trimmed ? trimmed.slice(0, 280) : null;
}
