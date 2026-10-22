// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./catalog", () => ({ fetchMetadata: vi.fn() }));
import { fetchMetadata } from "./catalog";
import { anifumeAdapter } from "./anifume";

const origin = "https://anifume.com";
const cdn = "https://a16.rukoluo.com/f/Synthetic-Season/Synthetic-Season-03.mp4?m=syntheticToken01&e=1900000000";
const title = "Synthetic Season ชื่อไทย ตอนที่ 1-3 ซับไทย [จบ]";
let search: string;
let detail: string;
let player: string;
let heading: string;
const anchor = (path: string, label: string) => `<a href="${origin}${path}">${label}</a>`;
const epTitle = (number: number) => `Synthetic Season ตอนที่ ${number} ซับไทย`;
const episode = (number: number) => anchor(`/123/${"syntheticId" + number}`, epTitle(number));
const resolve = (number = 3) => anifumeAdapter.resolve({ animeId: "mal-123", episodeNumber: number }, new AbortController().signal);
beforeEach(() => {
  vi.mocked(fetchMetadata).mockResolvedValue({ id: "mal:anime:123", providerId: "mal", catalogType: "ANIME", title: { english: "Synthetic Season" }, episodeCount: 3, format: "TV" });
  search = anchor("/123", title);
  detail = `<h1>${title}</h1>` + [3, 1, 2].map(episode).join("");
  heading = epTitle(3);
  player = `"sources": [{"file":"${cdn}","label":"720p"},{"file":"${cdn.replace(".mp4?", "-q360.mp4?")}","label":"360p","default":"true"}]`;
  vi.stubGlobal("fetch", vi.fn(async (input: URL) => {
    if (input.origin !== origin) throw new Error("unexpected media fetch");
    if (input.pathname.startsWith("/search/")) return new Response(search);
    if (input.pathname === "/123") return new Response(detail);
    if (input.pathname.startsWith("/123/")) return new Response(`<h1>${heading}</h1>function mainv() { $.ajax({url: "/k49dF65fkfl2X0So2lFB06?u=syntheticOpaqueToken00000="}); }`);
    if (input.pathname === "/k49dF65fkfl2X0So2lFB06") return new Response('<iframe src="/player/s=a15&f=syntheticFileToken000000&m=syntheticToken000&e=1900000000&q=1"></iframe>');
    if (input.pathname.startsWith("/player/")) return new Response(player);
    throw new Error("unexpected control page");
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("Anifume identity and embedded Thai subtitles", () => {
  it("resolves the exact numbered episode with provider native embedded subtitles and no text track", async () => {
    expect(await resolve()).toEqual({ video: { url: cdn, type: "mp4", quality: "720p" }, qualities: [{ id: "360p", label: "360p" }, { id: "720p", label: "720p" }], selectedQualityId: "720p", subtitles: [], embeddedSubtitles: { language: "th", label: "Thai (embedded)", removable: false } });
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/k49dF65fkfl2X0So2lFB06" }), expect.objectContaining({ cache: "no-store", redirect: "error", headers: expect.objectContaining({ Referer: `${origin}/123/syntheticId3`, "X-Requested-With": "XMLHttpRequest" }) }));
  });
  it.each(["Synthetic Season 2 ชื่อไทย ตอนที่ 1-3 ซับไทย [จบ]", "Synthetic Season ชื่อไทย (ภาค2) ตอนที่ 1-3 ซับไทย [จบ]", "Synthetic Season Movie ชื่อไทย ตอนที่ 1-3 ซับไทย [จบ]", "Synthetic Season ชื่อไทย ตอนที่ 1-12 ซับไทย [จบ]", "Synthetic Season ชื่อไทย ตอนที่ 1-3 พากย์ไทย [จบ]"])("rejects incompatible titles and ranges %s", async (label) => {
    search = anchor("/123", label);
    await expect(resolve()).rejects.toThrow("no_source");
  });
  it("rejects ambiguous canonical series, external control links, and detail identity changes", async () => {
    search += anchor("/124", title); await expect(resolve()).rejects.toThrow("mapping_required");
    search = `<a href="https://evil.test/123">${title}</a>`; await expect(resolve()).rejects.toThrow("mapping_required");
    search = anchor("/123", title); detail = detail.replace("Synthetic Season", "Other Season"); await expect(resolve()).rejects.toThrow("mapping_required");
  });
  it("rejects missing, duplicated, out of range, and mismatched episode evidence", async () => {
    const valid = detail;
    detail = `<h1>${title}</h1>` + episode(1) + episode(3); await expect(resolve()).rejects.toThrow("mapping_required");
    detail = valid + episode(3); await expect(resolve()).rejects.toThrow("mapping_required");
    detail = valid + episode(4); await expect(resolve()).rejects.toThrow("mapping_required");
    detail = valid; heading = epTitle(2); await expect(resolve()).rejects.toThrow("mapping_required");
    await expect(resolve(4)).rejects.toThrow("episode_unavailable");
  });
  it("never evaluates provider JavaScript and rejects unapproved media resources", async () => {
    player = '"sources": [globalThis.process.exit()]'; await expect(resolve()).rejects.toThrow("no_source");
    player = `"sources": [{"file":"${cdn.replace("a16.rukoluo.com", "evil.test")}"}]`; await expect(resolve()).rejects.toThrow("resource_host_not_allowed");
    player = `"sources": [{"file":"${cdn.replace(".mp4?", ".m3u8?")}"}]`; await expect(resolve()).rejects.toThrow("invalid_resource");
  });
  it("recognizes a completed final episode and reports only offered labelled qualities", async () => {
    detail = detail.replace(`${epTitle(3)}</a>`, `${epTitle(3)} จบ</a>`); heading += " จบ";
    expect((await resolve()).video.url).toBe(cdn);
    player = `"sources": [{"file":"${cdn}","label":"480p","default":true}]`; expect((await resolve()).video.quality).toBe("480p");
    player = `"sources": [{"file":"${cdn}"}]`; await expect(resolve()).rejects.toThrow("no_source");
  });
  it("selects a current source quality and rejects stale or injected IDs", async () => {
    const request = { animeId: "mal-123", episodeNumber: 3, qualityId: "360p" };
    expect(await anifumeAdapter.resolve(request, new AbortController().signal)).toMatchObject({ video: { url: cdn.replace(".mp4?", "-q360.mp4?"), quality: "360p" }, selectedQualityId: "360p" });
    player = `"sources": [{"file":"${cdn}","label":"1080p"}]`;
    await expect(anifumeAdapter.resolve(request, new AbortController().signal)).rejects.toThrow("quality_unavailable");
    expect((await resolve()).video.quality).toBe("1080p");
    await expect(anifumeAdapter.resolve({ ...request, qualityId: "https://evil.test/file.mp4" }, new AbortController().signal)).rejects.toThrow("quality_unavailable");
  });
  it("rejects duplicate quality IDs instead of choosing an ambiguous source", async () => {
    player = `"sources": [{"file":"${cdn}","label":"720p"},{"file":"${cdn}","label":"720p"}]`;
    await expect(resolve()).rejects.toThrow("no_source");
  });
  it("retains timeout status when provider searches hit their own network deadline", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("request timed out", "TimeoutError"); }));
    await expect(resolve()).rejects.toThrow("timeout");
  });
  it("offers only non-default sources as automatic alternatives", async () => {
    const sources = [];
    for await (const bundle of anifumeAdapter.resolveAlternatives!({ animeId: "mal-123", episodeNumber: 3 }, new AbortController().signal)) sources.push(bundle);
    expect(sources.map((bundle) => ({ quality: bundle.video.quality, url: bundle.video.url }))).toEqual([{ quality: "360p", url: cdn.replace(".mp4?", "-q360.mp4?") }]);
  });
  it("respects cancellation and upstream challenges", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(anifumeAdapter.resolve({ animeId: "mal-123", episodeNumber: 1 }, controller.signal)).rejects.toThrow();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("challenge", { status: 403 })));
    await expect(resolve()).rejects.toThrow("provider_unavailable");
  });
});
