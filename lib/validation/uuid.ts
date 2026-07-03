const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function parseUuid(value: string, label = "id"): string {
  const trimmed = value.trim();
  if (!isUuid(trimmed)) {
    throw new Error(`Invalid ${label}.`);
  }
  return trimmed;
}
