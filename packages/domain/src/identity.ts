export function normalizeTitle(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
export function exactEpisode<T extends { number: number }>(units: T[], number: number, count?: number | null): T | undefined {
  if (!Number.isSafeInteger(number) || number < 1 || count && number > count) return;
  const matches = units.filter((unit) => unit.number === number);
  return matches.length === 1 ? matches[0] : undefined;
}
