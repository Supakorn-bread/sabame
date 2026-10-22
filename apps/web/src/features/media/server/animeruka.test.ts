// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./catalog", () => ({ fetchMetadata: vi.fn() }));
vi.mock("./resource-fetch", () => ({ fetchResource: vi.fn() }));
import { fetchMetadata } from "./catalog";
import { fetchResource } from "./resource-fetch";
import { animerukaAdapter, getAnimerukaServers } from "./animeruka";
import { resolveProviderCandidates } from "../resolver";
import { MediaError } from "../types";

const origin = "https://animeruka.com";
const cdn = "https://cdn2.maimeorder.com/hls/SyntheticManifestToken000000==.txt";
const episodeTitle = (number: number) => `Synthetic Season ตอนที่ ${number} ซับไทย`;
const anchor = (url: string, title: string) => `<a href="${url}">${title}</a>`;
const episodeLink = (number: number) => anchor(`${origin}/ep/synthetic-season-ep-${number}/`, episodeTitle(number));
let search: string, detail: string, heading: string, controls: string, embed: string, videoTitle: string, videoUrl: string;
function option(id: string, label: string, post = "123") { return `<li class='dooplay_player_option' data-type='tv' data-post='${post}' data-nume='${id}'><span class='title'>${label}</span></li>`; }
const config = `<script>var dtAjax = {"play_method":"wp_json","player_api":"${origin}/wp-json/dooplayer/v2/","player_v":"1234abcd"};</script>`;
const request = { animeId: "mal-123", episodeNumber: 1 };
const signal = () => new AbortController().signal;
beforeEach(() => {
  vi.mocked(fetchMetadata).mockResolvedValue({ id: "mal:anime:123", providerId: "mal", catalogType: "ANIME", title: { english: "Synthetic Season", romaji: "Synthetic Season" }, episodeCount: 12, format: "TV" });
  search = anchor(`${origin}/anime/synthetic-season/`, "Synthetic Season ซับไทย");
  detail = "<h1>Synthetic Season ซับไทย ยังไม่จบ (อัพเดตตอนล่าสุด)</h1>" + [3, 1, 2, 4].map(episodeLink).join("");
  heading = episodeTitle(1);
  controls = option("1", "หลัก") + option("2", "สำรอง1") + option("3", "สำรอง2");
  embed = "https://animemami.xyz/v/syntheticVideo01";
  videoTitle = `${episodeTitle(1)}.mp4`;
  videoUrl = cdn;
  vi.mocked(fetchResource).mockImplementation(async (value, abortSignal) => {
    abortSignal.throwIfAborted();
    const url = new URL(value);
    let body: string;
    if (url.origin === origin && url.pathname === "/") body = search;
    else if (url.pathname === "/anime/synthetic-season/") body = detail;
    else if (url.pathname === "/ep/synthetic-season-ep-1/") body = `<h1>${heading}</h1>` + controls + config;
    else if (url.pathname.startsWith("/wp-json/")) body = JSON.stringify({ type: "iframe", embed_url: embed });
    else if (url.hostname === "animemami.xyz") body = `<div data-page="${JSON.stringify({ component: "Player/Show", props: { video: { title: videoTitle, type: "direct", url: videoUrl, subtitle_path: null } } }).replaceAll('"', '&quot;')}"></div>`;
    else throw new Error("unexpected control request");
    return { body: Buffer.from(body), status: 200, headers: {}, url: value };
  });
});
afterEach(() => vi.clearAllMocks());
describe("AnimeRuka exact identity and current episode origin choices", () => {
  it("discovers current DOM labels and IDs without requesting any player or media resource", async () => {
    expect(await getAnimerukaServers(request, signal())).toEqual({ provider: "animeruka", defaultServerId: "1", servers: [{ id: "1", label: "หลัก" }, { id: "2", label: "สำรอง1" }, { id: "3", label: "สำรอง2" }] });
    expect(vi.mocked(fetchResource).mock.calls.every(([value]) => new URL(value).hostname === "animeruka.com" && !value.includes("/wp-json/"))).toBe(true);
  });
  it("resolves the default origin with embedded Thai, no invented quality and no subtitle overlay", async () => {
    expect(await animerukaAdapter.resolve(request, signal())).toEqual({ selectedServerId: "1", video: { url: cdn, type: "hls" }, subtitles: [], embeddedSubtitles: { language: "th", label: "Thai (embedded)", removable: false } });
    expect(fetchResource).toHaveBeenCalledWith(`${origin}/wp-json/dooplayer/v2/123/tv/1?v=1234abcd`, expect.any(AbortSignal), expect.objectContaining({ policy: "animeruka", maxBytes: 2_097_152 }));
  });
  it("offers only current nondefault origins as automatic alternatives", async () => {
    const bundles = [];
    for await (const bundle of animerukaAdapter.resolveAlternatives!(request, signal())) bundles.push(bundle);
    expect(bundles.map((bundle) => bundle.selectedServerId)).toEqual(["2", "3"]);
  });
  it("matches a Roman alias with Thai descriptions while retaining relative episode identity", async () => {
    const suffix = "ตอนที่ 1 (25) ซับไทย";
    const name = "Jujutsu Kaisen 2nd Season มหาเวทย์ผนึกมาร (ภาค 2)";
    vi.mocked(fetchMetadata).mockResolvedValue({ id: "mal:anime:123", providerId: "mal", catalogType: "ANIME", title: { romaji: "Jujutsu Kaisen 2nd Season" }, episodeCount: 23, format: "TV" });
    search = anchor(`${origin}/anime/synthetic-season/`, `${name} ซับไทย`);
    detail = `<h1>${name} ซับไทย ยังไม่จบ (อัพเดตตอนล่าสุด)</h1>` + anchor(`${origin}/ep/synthetic-season-ep-1/`, `${name} ${suffix}`);
    heading = `${name} ${suffix}`; videoTitle = `${heading}.mp4`;
    expect(await animerukaAdapter.resolve(request, signal())).toMatchObject({ selectedServerId: "1", video: { url: cdn } });
    await expect(animerukaAdapter.resolve({ ...request, episodeNumber: 25 }, signal())).rejects.toThrow("episode_unavailable");
    search = search.replace("ภาค 2", "ภาค 3");
    await expect(animerukaAdapter.resolve(request, signal())).rejects.toThrow("no_source");
  });
  it("selects a current origin explicitly and rejects stale IDs before resolving a player", async () => {
    await animerukaAdapter.resolve({ ...request, serverId: "3" }, signal());
    expect(fetchResource).toHaveBeenCalledWith(`${origin}/wp-json/dooplayer/v2/123/tv/3?v=1234abcd`, expect.any(AbortSignal), expect.any(Object));
    vi.clearAllMocks();
    await expect(animerukaAdapter.resolve({ ...request, serverId: "9" }, signal())).rejects.toThrow("invalid_request");
    expect(vi.mocked(fetchResource).mock.calls.some(([value]) => value.includes("/wp-json/"))).toBe(false);
  });
  it("reports unsupported origin hosts without fetching them or trying the next server", async () => {
    embed = "https://player.abyssplayer.com/synthetic";
    await expect(animerukaAdapter.resolve({ ...request, serverId: "2" }, signal())).rejects.toThrow("unsupported_server");
    expect(vi.mocked(fetchResource).mock.calls.filter(([value]) => value.includes("/wp-json/")).map(([value]) => new URL(value).pathname)).toEqual(["/wp-json/dooplayer/v2/123/tv/2"]);
    expect(vi.mocked(fetchResource).mock.calls.some(([value]) => new URL(value).hostname === "player.abyssplayer.com")).toBe(false);
  });
  it.each(["Synthetic Season 2 ซับไทย", "Synthetic Season ภาค 2 ซับไทย", "Synthetic Season Movie ซับไทย", "Synthetic Season พากย์ไทย"])("rejects incompatible canonical listings %s", async (title) => {
    search = anchor(`${origin}/anime/synthetic-season/`, title);
    await expect(getAnimerukaServers(request, signal())).rejects.toThrow("no_source");
  });
  it("rejects ambiguous series, changed headings and incomplete or conflicting episode evidence", async () => {
    const original = detail;
    search += anchor(`${origin}/anime/other-season/`, "Synthetic Season ซับไทย");
    await expect(getAnimerukaServers(request, signal())).rejects.toThrow("mapping_required");
    search = anchor(`${origin}/anime/synthetic-season/`, "Synthetic Season ซับไทย");
    detail = original.replace("<h1>Synthetic Season", "<h1>Different Season");
    await expect(getAnimerukaServers(request, signal())).rejects.toThrow("mapping_required");
    detail = original.replace(episodeLink(2), "");
    await expect(getAnimerukaServers(request, signal())).rejects.toThrow("mapping_required");
    detail = original + anchor(`${origin}/ep/other-ep-1/`, episodeTitle(1));
    await expect(getAnimerukaServers(request, signal())).rejects.toThrow("mapping_required");
    detail = original; heading = episodeTitle(2);
    await expect(getAnimerukaServers(request, signal())).rejects.toThrow("mapping_required");
  });
  it("allows a contiguous ongoing inventory but requires completed inventories to match the canonical count", async () => {
    await expect(getAnimerukaServers({ ...request, episodeNumber: 5 }, signal())).rejects.toThrow("episode_unavailable");
    detail = detail.replace("ยังไม่จบ (อัพเดตตอนล่าสุด)", "จบแล้ว");
    await expect(getAnimerukaServers(request, signal())).rejects.toThrow("mapping_required");
    vi.mocked(fetchMetadata).mockResolvedValue({ id: "mal:anime:123", providerId: "mal", catalogType: "ANIME", title: { english: "Synthetic Season" }, episodeCount: 4, format: "TV" });
    expect((await getAnimerukaServers(request, signal())).servers).toHaveLength(3);
  });
  it("rejects duplicate or mixed episode controls and unapproved control URLs", async () => {
    const original = controls;
    controls += option("1", "duplicate"); await expect(getAnimerukaServers(request, signal())).rejects.toThrow("mapping_required");
    controls = original + option("4", "wrong episode", "124"); await expect(getAnimerukaServers(request, signal())).rejects.toThrow("no_source");
    controls = original;
    search = anchor("https://evil.test/anime/synthetic-season/", "Synthetic Season ซับไทย"); await expect(getAnimerukaServers(request, signal())).rejects.toThrow();
  });
  it("never evaluates page code and binds the native video title to the verified episode", async () => {
    videoTitle = `${episodeTitle(2)}.mp4`; await expect(animerukaAdapter.resolve(request, signal())).rejects.toThrow("mapping_required");
    videoTitle = `${episodeTitle(1)}.mp4`; videoUrl = cdn.replace("cdn2.maimeorder.com", "evil.test");
    await expect(animerukaAdapter.resolve(request, signal())).rejects.toThrow("resource_host_not_allowed");
    controls = "<script>globalThis.process.exit()</script>";
    await expect(getAnimerukaServers(request, signal())).rejects.toThrow("no_source");
  });
  it("preserves the player control deadline as timeout instead of source absence", async () => {
    const read = vi.mocked(fetchResource).getMockImplementation()!;
    vi.mocked(fetchResource).mockImplementation(async (...args) => {
      if (new URL(args[0]).pathname.startsWith("/wp-json/")) throw new DOMException("request timed out", "TimeoutError");
      return read(...args);
    });
    const result = await resolveProviderCandidates({ ...request, serverId: "1" }, [animerukaAdapter], { signal: signal(), validateVideo: async () => {}, probeSubtitle: async () => "vtt" });
    expect(result).toEqual([{ provider: "animeruka", code: "timeout" }]);
  });
  it("preserves cancellation and upstream failures", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(getAnimerukaServers(request, controller.signal)).rejects.toThrow();
    vi.mocked(fetchResource).mockRejectedValue(new MediaError("upstream_unavailable"));
    await expect(getAnimerukaServers(request, signal())).rejects.toThrow("provider_unavailable");
  });
});
