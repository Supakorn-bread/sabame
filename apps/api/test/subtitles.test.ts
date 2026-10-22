import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discoverSubdl,
  matchedSubdlFiles,
  publicSubdlUrl,
  subtitleSeason,
} from "../src/modules/subtitles/subdl.js";
import { SubtitlesService } from "../src/modules/subtitles/subtitles.service.js";
import type { fetchMetadata } from "@sabame/catalog/catalog";

type Metadata = Awaited<ReturnType<typeof fetchMetadata>>;
const metadata = {
  title: { english: "Example Story" },
  year: 2023,
  episodeCount: 12,
} as Metadata;
const file = {
  name: "Example Story - S01E01.th.srt",
  season: 1,
  episode: 1,
  language: "TH",
  format: "srt",
  size: 500,
  url: "/subtitle/packToken/fileToken?api_key=backend-only-secret",
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("SubDL matching boundary", () => {
  it("selects an explicit episode from a misleading season-pack name and strips credentials", () => {
    expect(
      matchedSubdlFiles(
        [
          {
            name: "Example S01E09.zip",
            unpack_files: [
              file,
              { ...file, name: "Example S01E02.th.srt", episode: 2 },
            ],
          },
        ],
        1,
        1,
      ),
    ).toEqual([{ url: "https://dl.subdl.com/subtitle/packToken/fileToken" }]);
  });
  it("refuses ambiguous files, bad markers, mismatched metadata, ZIPs, and oversized subtitles", () => {
    const invalid = [
      [{ ...file, name: "Example S01E01E02.th.srt" }],
      [{ ...file, name: "Example S01E01 & E02.th.srt" }],
      [file, file],
      [{ ...file, name: "Example S02E01.th.srt" }],
      [{ ...file, name: "Example S01E01-E02.th.srt" }],
      [{ ...file, name: "Example 01.th.srt" }],
      [{ ...file, episode: 2 }],
      [{ ...file, language: "EN" }],
      [{ ...file, format: "zip" }],
      [{ ...file, size: 1_048_577 }],
      [{ ...file, url: "https://evil.test/subtitle/a/b" }],
    ];
    for (const unpack_files of invalid)
      expect(matchedSubdlFiles([{ unpack_files }], 1, 1)).toEqual([]);
  });
  it("accepts only the exact public unpacked-file endpoint", () => {
    expect(publicSubdlUrl("/subtitle/a/b?api_key=secret#fragment")).toBe(
      "https://dl.subdl.com/subtitle/a/b",
    );
    for (const url of [
      "http://dl.subdl.com/subtitle/a/b",
      "https://user:pass@dl.subdl.com/subtitle/a/b",
      "/subtitle/a.zip",
      "//evil.test/subtitle/a/b",
    ])
      expect(publicSubdlUrl(url)).toBeUndefined();
  });
  it("refuses split-cour and conflicting season interpretations", () => {
    expect(subtitleSeason(metadata)).toBe(1);
    expect(
      subtitleSeason({ ...metadata, title: { english: "Example 2" } }),
    ).toBeUndefined();
    expect(
      subtitleSeason({ ...metadata, synonyms: ["Example Part 2"] }),
    ).toBeUndefined();
    expect(
      subtitleSeason({
        ...metadata,
        title: { english: "Example Season 2 Part 2" },
      }),
    ).toBeUndefined();
    expect(
      subtitleSeason({ ...metadata, title: { english: "Example Season 2" } }),
    ).toBe(2);
    expect(
      subtitleSeason({ ...metadata, title: { english: "Example Part 2" } }),
    ).toBeUndefined();
    expect(
      subtitleSeason({
        ...metadata,
        title: { english: "Example Season 2", romaji: "Example 3rd Season" },
      }),
    ).toBeUndefined();
  });
  it("requires a unique exact title and year before retrieving an episode", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          status: true,
          results: [
            { sd_id: 42, name: "Example Story", type: "tv", year: 2023 },
            { sd_id: 43, name: "Example Story", type: "tv", year: 2001 },
            {
              sd_id: 44,
              name: "Example Story The Movie",
              type: "movie",
              year: 2023,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          status: true,
          results: [{ sd_id: 42 }],
          subtitles: [{ unpack_files: [file] }],
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(
      await discoverSubdl(
        metadata,
        1,
        new AbortController().signal,
        "backend-secret",
      ),
    ).toEqual([{ url: "https://dl.subdl.com/subtitle/packToken/fileToken" }]);
    const request = new URL(fetcher.mock.calls[1][0]);
    expect([
      request.searchParams.get("sd_id"),
      request.searchParams.get("season_number"),
      request.searchParams.get("episode_number"),
    ]).toEqual(["42", "1", "1"]);
    expect(fetcher.mock.calls[0][1].cache).toBe("no-store");
  });
  it("refuses movies and a targeted response for a different catalog identity", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          status: true,
          results: [
            { sd_id: 42, name: "Example Story", type: "tv", year: 2023 },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          status: true,
          results: [{ sd_id: 99 }],
          subtitles: [{ unpack_files: [file] }],
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(
      await discoverSubdl(
        { ...metadata, format: "MOVIE" },
        1,
        new AbortController().signal,
        "secret",
      ),
    ).toEqual([]);
    expect(
      await discoverSubdl(metadata, 1, new AbortController().signal, "secret"),
    ).toEqual([]);
  });
  it("does not choose between ambiguous same-title catalog records", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: true,
          results: [
            { sd_id: 42, name: "Example Story", type: "tv", year: 2023 },
            { sd_id: 43, name: "Example Story", type: "tv", year: 2023 },
          ],
        }),
      ),
    );
    expect(
      await discoverSubdl(metadata, 1, new AbortController().signal, "secret"),
    ).toEqual([]);
  });
  it("leaves optional discovery disabled without backend credentials and validates episode input", async () => {
    vi.stubEnv("SUBDL_API_KEY", "");
    const service = new SubtitlesService();
    const response = await service.find(
      new Request("http://localhost/api/anime/mal-1/subtitles?episodeNumber=1"),
      "mal-1",
    );
    expect(await response.json()).toEqual({ candidates: [] });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const invalid = await service.find(
      new Request("http://localhost/api/anime/mal-1/subtitles?episodeNumber=0"),
      "mal-1",
    );
    expect(invalid.status).toBe(400);
  });
});
