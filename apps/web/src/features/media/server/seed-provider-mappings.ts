import "server-only";

interface SeedProviderSegment {
  rawMediaId: string;
  title: string;
  episodeStart: number;
  episodeEnd: number;
  providerEpisodeOffset: number;
  expectedUnitCount: number;
}

const animeParadiseSeedMappings: Record<string, SeedProviderSegment[]> = {
  "skyward-bloom": [{ rawMediaId: "NIUsb960SxtXls4h", title: "Frieren: Beyond Journey’s End", episodeStart: 1, episodeEnd: 28, providerEpisodeOffset: 0, expectedUnitCount: 28 }],
  "neon-requiem": [],
  "moonlit-recipe": [
    { rawMediaId: "CpNZsvj09oGxwRF0", title: "Mushoku Tensei: Jobless Reincarnation Season 2", episodeStart: 1, episodeEnd: 12, providerEpisodeOffset: 0, expectedUnitCount: 12 },
    { rawMediaId: "083jwmRQ17PMS4jy", title: "Mushoku Tensei: Jobless Reincarnation Season 2 Part 2", episodeStart: 13, episodeEnd: 24, providerEpisodeOffset: 12, expectedUnitCount: 12 },
  ],
  "constellation-code": [{ rawMediaId: "E8rjQS8jYwW2K6pF", title: "JUJUTSU KAISEN Season 2", episodeStart: 1, episodeEnd: 23, providerEpisodeOffset: 0, expectedUnitCount: 23 }],
  "last-shrine": [{ rawMediaId: "n65FbTbSr8ul9KIH", title: "Demon Slayer: Kimetsu no Yaiba Hashira Training Arc", episodeStart: 1, episodeEnd: 8, providerEpisodeOffset: 0, expectedUnitCount: 8 }],
  "harbor-of-wishes": [{ rawMediaId: "qB1wHS2287gbxySv", title: "The Eminence in Shadow", episodeStart: 1, episodeEnd: 20, providerEpisodeOffset: 0, expectedUnitCount: 20 }],
};

// Exact one-to-one MAL identities can reuse the reviewed delivery mappings.
// The combined Mushoku demo entry is deliberately excluded.
const canonicalAliases: Record<string, string> = {
  "mal-52991": "skyward-bloom", "mal-42310": "neon-requiem",
  "mal-51009": "constellation-code", "mal-55701": "last-shrine", "mal-48316": "harbor-of-wishes",
};
export function hasAnimeParadiseSeedConfiguration(animeId: string) {
  return Object.hasOwn(animeParadiseSeedMappings, canonicalAliases[animeId] ?? animeId);
}

export function animeParadiseSeedSegment(animeId: string, episodeNumber: number) {
  return animeParadiseSeedMappings[canonicalAliases[animeId] ?? animeId]?.find(({ episodeStart, episodeEnd }) => episodeNumber >= episodeStart && episodeNumber <= episodeEnd);
}
