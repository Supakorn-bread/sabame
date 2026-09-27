import type { RawSubtitle } from "./types";

const aliases: Record<string, string> = {
  thai: "th", th: "th", tha: "th", "ภาษาไทย": "th", "ไทย": "th",
  english: "en", en: "en", eng: "en", japanese: "ja", ja: "ja", jpn: "ja",
  spanish: "es", es: "es", spa: "es", italian: "it", it: "it", ita: "it",
  portuguese: "pt", pt: "pt", por: "pt", french: "fr", fr: "fr", fra: "fr",
  german: "de", de: "de", deu: "de", chinese: "zh", zh: "zh", zho: "zh",
};
export function normalizeLanguage(value: unknown): string {
  if (typeof value !== "string") return "und";
  const normalized = value.trim().toLowerCase().replaceAll("_", "-");
  if (aliases[normalized]) return aliases[normalized];
  // Accept complete language tags, never arbitrary label prefixes (e.g. Theatre).
  const tag = /^([a-z]{2,3})(?:-[a-z0-9]{2,8})+$/.exec(normalized);
  return tag && aliases[tag[1]] ? aliases[tag[1]] : "und";
}
export function isThaiSubtitle(track: Pick<RawSubtitle, "language" | "label">) {
  return [track.language, track.label].some((value) => normalizeLanguage(value) === "th");
}
