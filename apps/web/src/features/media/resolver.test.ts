import { describe, expect, it, vi } from "vitest";
import { isThaiSubtitle, normalizeLanguage } from "./language";
import { resolveMedia } from "./resolver";
import { detectSubtitleFormat, toWebVtt } from "./subtitles";
import { exactEpisode, normalizeTitle } from "./identity";
import { MediaError, type MediaProvider, type RawSubtitle } from "./types";

const episode = { animeId: "mal-1", episodeNumber: 1 };
const track = (language: string): RawSubtitle => ({ language, label: language, url: `https://example.com/${language}.vtt` });
const provider = (id: string, subtitles?: RawSubtitle[]): MediaProvider => ({ id, resolve: vi.fn(async () => ({ video: { url: `https://example.com/${id}.m3u8`, type: "hls" as const }, subtitles })) });
const options = () => ({ signal: new AbortController().signal, probeSubtitle: vi.fn(async () => "vtt" as const), validateVideo: vi.fn(async () => {}) });

describe("subtitle language normalization", () => {
  it.each(["Thai", "thai", "TH", "th", "tha", "th-TH", "th_TH", "ภาษาไทย"])("recognizes %s", (value) => {
    expect(normalizeLanguage(value)).toBe("th");
    expect(isThaiSubtitle({ language: value })).toBe(true);
    expect(isThaiSubtitle({ label: value })).toBe(true);
  });
  it.each(["Theatre", "The best", "Thames", "other", "", undefined, 42])("does not infer Thai from %s", (value) => expect(normalizeLanguage(value)).toBe("und"));
});
describe("episode-specific provider fallback", () => {
  it("selects video + Thai and stops remaining providers", async () => {
    const spare = provider("unused", []);
    const result = await resolveMedia(episode, [provider("english", [track("en")]), provider("thai", [track("Thai")]), spare], options());
    expect(result).toMatchObject({ provider: "thai", thaiStatus: "present", selectionReason: "thai_subtitle" });
    expect(result.subtitles[0]).toMatchObject({ language: "th", default: true, syncStatus: "unverified" });
    expect(spare.resolve).not.toHaveBeenCalled();
    expect(result.subtitles).toHaveLength(1); // No cross-provider merge.
  });
  it("keeps English over video only", async () => {
    expect(await resolveMedia(episode, [provider("english", [track("en")]), provider("bare", [])], options())).toMatchObject({ provider: "english", thaiStatus: "absent_in_returned_tracks", selectionReason: "english_subtitle" });
  });
  it("preserves multiple languages and only one default", async () => {
    const result = await resolveMedia(episode, [provider("multi", [track("en"), track("th"), track("ja")])], options());
    expect(result.subtitles).toHaveLength(3);
    expect(result.subtitles.filter((item) => item.default).map((item) => item.language)).toEqual(["th"]);
  });
  it("distinguishes empty tracks from missing subtitle data", async () => {
    expect(await resolveMedia(episode, [provider("bare", [])], options())).toMatchObject({ thaiStatus: "absent_in_returned_tracks", selectionReason: "video_only" });
    expect(await resolveMedia(episode, [provider("unknown")], options())).toMatchObject({ thaiStatus: "unknown" });
  });
  it("falls back after provider errors and invalid video", async () => {
    const broken = { id: "broken", resolve: vi.fn(async () => { throw new MediaError("provider_unavailable"); }) };
    const opts = options(); opts.validateVideo.mockRejectedValueOnce(new MediaError("invalid_video"));
    expect(await resolveMedia(episode, [broken, provider("invalid"), provider("good", [track("th")])], opts)).toMatchObject({ provider: "good" });
  });
  it("dead Thai URLs do not outrank usable English", async () => {
    const opts = options(); opts.probeSubtitle.mockRejectedValueOnce(new Error("404"));
    const result = await resolveMedia(episode, [provider("dead", [track("th")]), provider("english", [track("en")])], opts);
    expect(result.provider).toBe("english");
    const deadOptions = options(); deadOptions.probeSubtitle.mockRejectedValue(new Error("404"));
    expect(await resolveMedia(episode, [provider("dead", [track("th")])], deadOptions)).toMatchObject({ thaiStatus: "unavailable", selectionReason: "video_only", subtitles: [{ default: false, availability: "unavailable" }] });
  });
  it("times out an adapter that ignores cancellation and falls back", async () => {
    const hanging: MediaProvider = { id: "hanging", resolve: () => new Promise(() => {}) };
    expect(await resolveMedia(episode, [hanging, provider("good", [])], { ...options(), providerTimeout: 10 })).toMatchObject({ provider: "good" });
  });
  it("retains a valid earlier candidate when the overall deadline expires", async () => {
    expect(await resolveMedia(episode, [provider("good", []), { id: "hang", resolve: () => new Promise(() => {}) }], { ...options(), totalTimeout: 10 })).toMatchObject({ provider: "good" });
  });
  it("propagates cancellation and all-provider failure", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(resolveMedia(episode, [provider("a")], { ...options(), signal: controller.signal })).rejects.toThrow();
    await expect(resolveMedia(episode, [], options())).rejects.toThrow("no_source");
  });
});
describe("formats and episode identity", () => {
  it("detects extensionless VTT and converts SRT timing", () => {
    expect(detectSubtitleFormat("\uFEFFWEBVTT\n\n")).toBe("vtt");
    expect(toWebVtt("1\r\n00:00:01,000 --> 00:00:02,000\r\nสวัสดี")).toContain("00:00:01.000 --> 00:00:02.000");
    expect(detectSubtitleFormat("[Script Info]\nTitle: Test")).toBe("ass");
    expect(() => toWebVtt("<html>Error</html>")).toThrow();
  });
  it("never picks a nearby or duplicate episode or collapses season names", () => {
    expect(exactEpisode([{ number: 1 }, { number: 3 }], 2)).toBeUndefined();
    expect(exactEpisode([{ number: 2 }, { number: 2 }], 2)).toBeUndefined();
    expect(exactEpisode([{ number: 13 }], 13, 12)).toBeUndefined();
    expect(normalizeTitle("Frieren Season 2")).not.toBe(normalizeTitle("Frieren"));
  });
});
