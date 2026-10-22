// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./catalog", () => ({ fetchMetadata: vi.fn() }));
import { fetchMetadata } from "./catalog";
import { anizoneAdapter, getAnizoneEpisodes } from "./anizone";
const origin = "https://anizone.to";
const asset = "00000000-0000-0000-0000-000000000001";
const cdn = `https://seiryuu.vid-cdn.xyz/${asset}`;
function field(name: string, value: unknown) {
  const encoded = JSON.stringify(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'").replaceAll('"', "\\u0022");
  return `${name}: JSON.parse('${encoded}')`;
}
const series = (changes: object = {}) => ({ slug: "series01", url: `${origin}/anime/series01`, main_title: "Synthetic Season", title_list: { 1: "Synthetic Season" }, start_year: 2021, episode_count: 3, ...changes });
const episode = (number: number, changes: object = {}) => ({ slug: String(number), url: `${origin}/anime/series01/${number}`, type: "Regular Episode", title_list: { 1: `Synthetic ${number}` }, ...changes });
let sequence = 0;
let animeId: string;
let searchItems: unknown[];
let episodes: unknown[];
let lazy: boolean;
let config: object;
beforeEach(() => {
  animeId = `mal-${10000 + sequence++}`;
  vi.mocked(fetchMetadata).mockResolvedValue({ id: "mal:anime:1", providerId: "mal", catalogType: "ANIME", title: { romaji: "Synthetic Season", english: "Synthetic Season" }, year: 2021, episodeCount: 3 });
  searchItems = [series()]; episodes = [episode(3), episode(1)]; lazy = false;
  config = { src: `${cdn}/master.m3u8`, subtitles: [{ file: `${cdn}/subtitles/0_en.ass`, language: "en", title: "English", format: "ass" }] };
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const url = new URL(input);
    if (url.origin !== origin) throw new Error("unexpected media fetch");
    if (url.pathname === "/anime") return new Response(field("items", searchItems));
    if (url.pathname === "/anime/series01") return new Response(`${field("anmTitles", { 1: "Synthetic Season" })}, ${field("items", episodes)}, hasMore: ${lazy}`);
    if (/^\/anime\/series01\/[1-3]$/.test(url.pathname)) return new Response(`x-data="vidstackPlayer(JSON.parse('${JSON.stringify(config).replaceAll("\\", "\\\\").replaceAll('"', "\\u0022")}'))"` + (lazy ? [3, 1, 2].map((n) => `<a x-data="{${field("epsTitles", { 1: `Synthetic ${n}` })}}" href="${origin}/anime/series01/${n}">${n}</a>`).join("") : ""));
    throw new Error("unexpected URL");
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
const signal = () => new AbortController().signal;
const resolve = (number = 1) => anizoneAdapter.resolve({ animeId, episodeNumber: number }, signal());
describe("Anizone discovery", () => {
  it("matches canonical identity and resolves a real episode number rather than its array position", async () => {
    expect(await getAnizoneEpisodes(animeId, signal())).toEqual([{ number: 1, title: "Synthetic 1" }, { number: 3, title: "Synthetic 3" }]);
    expect(await resolve(3)).toEqual({ video: { url: `${cdn}/master.m3u8`, type: "hls" }, subtitles: [{ url: `${cdn}/subtitles/0_en.ass`, language: "en", label: "English", format: "ass" }] });
    await expect(resolve(2)).rejects.toThrow("episode_unavailable");
  });
  it("reads actual complete episode navigation when the series inventory is lazy loaded", async () => {
    lazy = true;
    expect(await getAnizoneEpisodes(animeId, signal())).toEqual([1, 2, 3].map((number) => ({ number, title: `Synthetic ${number}` })));
  });
  it("recognizes an exact synonym and safely decodes escaped apostrophes without evaluating page code", async () => {
    vi.mocked(fetchMetadata).mockResolvedValue({ id: "mal:anime:1", providerId: "mal", catalogType: "ANIME", title: { english: "Synthetic's Season" }, synonyms: ["Synthetic Season"], year: 2021, episodeCount: 3 });
    expect((await resolve()).video.type).toBe("hls");
  });
  it.each([{ start_year: 2020 }, { episode_count: 12 }, { main_title: "Other Season", title_list: { 1: "Other Season" } }])("rejects incorrect identity %j", async (changes) => {
    searchItems = [series(changes)];
    await expect(resolve()).rejects.toThrow("no_source");
  });
  it("rejects ambiguous exact series and duplicated episode mappings", async () => {
    searchItems = [series(), series({ slug: "series02", url: `${origin}/anime/series02` })];
    await expect(resolve()).rejects.toThrow("mapping_required");
    searchItems = [series()]; episodes = [episode(1), episode(1)];
    await expect(resolve()).rejects.toThrow("mapping_required");
  });
  it("rejects outside-season episode numbers and cross-origin control links", async () => {
    episodes = [episode(4)]; await expect(resolve()).rejects.toThrow("mapping_required");
    episodes = [episode(1, { url: "https://evil.test/anime/series01/1" })]; await expect(resolve()).rejects.toThrow("mapping_required");
  });
  it("requires English subtitles from the same video asset and rejects unapproved CDNs", async () => {
    config = { src: `${cdn}/master.m3u8`, subtitles: [] };
    await expect(resolve()).rejects.toThrow("english_subtitle_unavailable");
    config = { src: "https://evil.test/master.m3u8", subtitles: [] };
    await expect(resolve()).rejects.toThrow("resource_host_not_allowed");
    config = { src: `${cdn}/master.m3u8`, subtitles: [{ file: `${cdn.replace(/1$/, "2")}/subtitles/0_en.ass`, language: "en", format: "ass" }] };
    await expect(resolve()).rejects.toThrow("mapping_required");
  });
  it("reports unavailable control pages and respects cancellation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("challenge", { status: 403 })));
    await expect(resolve()).rejects.toThrow("provider_unavailable");
    const controller = new AbortController(); controller.abort();
    await expect(getAnizoneEpisodes(animeId, controller.signal)).rejects.toThrow();
  });
});
