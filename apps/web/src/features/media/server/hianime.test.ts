// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
vi.mock("server-only", () => ({}));
vi.mock("./catalog", () => ({ fetchMetadata: vi.fn() }));
import { fetchMetadata } from "./catalog";
import { getHianimeEpisodes, hianimeAdapter } from "./hianime";

const signal = () => new AbortController().signal;
const embed = "https://zokoanime.video/stream/mal/42310/1/sub";
const episodeHtml = (number = 1, id = "17575", slug = "cyberpunk-edgerunners-1048") => `<a class="ssl-item ep-item" data-number="${number}" data-id="${id}" title="Let You Down" href="https://hianime.at/watch/${slug}?ep=${id}">`;
const serverHtml = (url = embed) => `<div class="server-item" data-type="sub" data-server-name="ZokoAnime" data-hash="${Buffer.from(url).toString("base64")}">`;
const config = (value: unknown) => {
  const key = Buffer.from("otaku-embed-v1");
  const bytes = Buffer.from(JSON.stringify(value));
  return `window.__P="${Buffer.from(bytes.map((byte, index) => byte ^ key[index % key.length])).toString("base64")}"`;
};
const source = { src: "https://hls.dramahot.top/title/master.m3u8", subtitles: [{ lang: "en", label: "English", src: "https://hls.dramahot.top/title/english.vtt" }] };
let episodes: string;
let servers: string;
let player: string;
let search: string;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchMetadata).mockResolvedValue({ id: "mal:anime:42310", providerId: "mal", catalogType: "ANIME", title: { english: "Cyberpunk: Edgerunners" }, episodeCount: 10 });
  episodes = episodeHtml();
  servers = serverHtml();
  player = config(source);
  search = '<h3 class="film-name"><a title="Cyberpunk: Edgerunners" href="https://hianime.at/cyberpunk-edgerunners-1048">Cyberpunk</a></h3>';
  fetchMock = vi.fn(async (value: URL) => {
    if (value.origin === "https://zokoanime.video") return new Response(player);
    if (value.pathname === "/search") return new Response(search);
    if (value.pathname === "/api/theme/episode/list/1048") return Response.json({ status: true, html: episodes });
    if (value.pathname === "/api/theme/episode/servers") return Response.json({ status: true, html: servers });
    throw new Error("unexpected_control_url");
  });
  vi.stubGlobal("fetch", fetchMock);
});
describe("current HiAnime provider boundary", () => {
  it("resolves an exact MAL episode with a declared English text track", async () => {
    expect(await hianimeAdapter.resolve({ animeId: "mal-42310", episodeNumber: 1 }, signal())).toEqual({
      video: { url: source.src, type: "hls" },
      subtitles: [{ url: source.subtitles[0].src, language: "en", label: "English", format: "vtt" }],
    });
    expect(fetchMock).toHaveBeenCalledWith(new URL(embed), expect.objectContaining({ redirect: "error", cache: "no-store" }));
  });
  it("resolves episode 2 English tracks with provider source labels", async () => {
    episodes = episodeHtml(2, "17576") + episodeHtml(1);
    fetchMock.mockImplementation(async (value: URL) => {
      if (value.href === "https://zokoanime.video/stream/mal/42310/2/sub") return new Response(player);
      if (value.pathname === "/search") return new Response(search);
      if (value.pathname === "/api/theme/episode/list/1048") return Response.json({ status: true, html: episodes });
      if (value.pathname === "/api/theme/episode/servers") return Response.json({ status: true, html: serverHtml(value.searchParams.get("episodeId") === "17576" ? "https://zokoanime.video/stream/mal/42310/2/sub" : embed) });
      throw new Error("unexpected_control_url");
    });
    player = config({ ...source, subtitles: [
      { lang: "en", label: "English - HIDI", src: "https://hls.dramahot.top/title/hidi.vtt" },
      { lang: "en", label: "English - BILI", src: "https://hls.dramahot.top/title/bili.vtt" },
    ] });
    expect(await hianimeAdapter.resolve({ animeId: "mal-42310", episodeNumber: 2 }, signal())).toEqual({
      video: { url: "https://hls.dramahot.top/title/master.m3u8", type: "hls" },
      subtitles: [
        { url: "https://hls.dramahot.top/title/hidi.vtt", language: "en", label: "English - HIDI", format: "vtt" },
        { url: "https://hls.dramahot.top/title/bili.vtt", language: "en", label: "English - BILI", format: "vtt" },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(new URL("https://zokoanime.video/stream/mal/42310/2/sub"), expect.objectContaining({ redirect: "error", cache: "no-store" }));
  });
  it("reads the canonical title link from captured current provider HTML", async () => {
    search = readFileSync(new URL("./fixtures/hianime-search.html", import.meta.url), "utf8");
    expect(await getHianimeEpisodes("mal-42310", signal())).toEqual([{ number: 1, title: "Let You Down" }]);
  });
  it("lists only actual episodes after verifying the provider MAL identity", async () => {
    episodes += episodeHtml(4, "17578");
    expect(await getHianimeEpisodes("mal-42310", signal())).toEqual([{ number: 1, title: "Let You Down" }, { number: 4, title: "Let You Down" }]);
    expect(fetchMock.mock.calls.some(([url]) => url.pathname === "/api/theme/episode/servers")).toBe(true);
  });
  it("rejects title matches whose embed identifies another MAL anime or episode", async () => {
    for (const url of ["https://zokoanime.video/stream/mal/52991/1/sub", "https://zokoanime.video/stream/mal/42310/2/sub"]) {
      servers = serverHtml(url);
      await expect(getHianimeEpisodes("mal-42310", signal())).rejects.toThrow("mapping_required");
    }
  });
  it("does not replace a missing episode with the closest source", async () => {
    await expect(hianimeAdapter.resolve({ animeId: "mal-42310", episodeNumber: 2 }, signal())).rejects.toThrow("episode_unavailable");
    expect(fetchMock.mock.calls.some(([url]) => url.origin === "https://zokoanime.video")).toBe(false);
  });
  it("rejects wrong-season watch links and episodes outside canonical metadata", async () => {
    episodes = episodeHtml(1, "17575", "cyberpunk-edgerunners-2-2842");
    await expect(getHianimeEpisodes("mal-42310", signal())).rejects.toThrow("mapping_required");
    episodes = episodeHtml(11);
    await expect(getHianimeEpisodes("mal-42310", signal())).rejects.toThrow("mapping_required");
  });
  it("rejects duplicate catalog matches rather than choosing a season", async () => {
    search += '<h3 class="film-name"><a title="Cyberpunk: Edgerunners" href="https://hianime.at/cyberpunk-other-2000">Other</a></h3>';
    await expect(getHianimeEpisodes("mal-42310", signal())).rejects.toThrow("mapping_required");
  });
  it("requires an English track and the verified delivery host", async () => {
    player = config({ ...source, subtitles: [{ lang: "en", label: "Theatre", src: source.subtitles[0].src }] });
    await expect(hianimeAdapter.resolve({ animeId: "mal-42310", episodeNumber: 1 }, signal())).rejects.toThrow("english_subtitle_unavailable");
    player = config({ ...source, src: "https://unverified.test/master.m3u8" });
    await expect(hianimeAdapter.resolve({ animeId: "mal-42310", episodeNumber: 1 }, signal())).rejects.toThrow("resource_host_not_allowed");
  });
  it.each([
    { lang: "en", label: "Englishish - HIDI" },
    { lang: "en", label: "Theatre - HIDI" },
    { lang: "fr", label: "English - HIDI" },
    { lang: "en", label: "French - English" },
  ])("rejects ambiguous or contradictory English track metadata $lang/$label", async (track) => {
    player = config({ ...source, subtitles: [{ ...track, src: "https://hls.dramahot.top/title/english.vtt" }] });
    await expect(hianimeAdapter.resolve({ animeId: "mal-42310", episodeNumber: 1 }, signal())).rejects.toThrow("english_subtitle_unavailable");
  });
  it("fails closed on upstream challenges and oversized responses", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Just a moment", { status: 403 }));
    await expect(getHianimeEpisodes("mal-42310", signal())).rejects.toThrow("provider_unavailable");
    fetchMock.mockResolvedValueOnce(new Response("x".repeat(1_048_577)));
    await expect(getHianimeEpisodes("mal-42310", signal())).rejects.toThrow("resource_too_large");
  });
});
