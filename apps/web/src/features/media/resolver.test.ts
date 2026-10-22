import { describe, expect, it, vi } from "vitest";
import { isThaiSubtitle, normalizeLanguage } from "./language";
import { resolveMedia, resolveProviderCandidates } from "./resolver";
import { detectSubtitleFormat, toWebVtt } from "./subtitles";
import { exactEpisode, normalizeTitle } from "./identity";
import { MediaError, type MediaProvider, type RawSubtitle, type SubtitleFormat } from "./types";

const episode = { animeId: "mal-1", episodeNumber: 1 };
const track = (language: string): RawSubtitle => ({ language, label: language, url: `https://example.com/${language}.vtt` });
const provider = (id: string, subtitles?: RawSubtitle[]): MediaProvider => ({ id, resolve: vi.fn(async () => ({ video: { url: `https://example.com/${id}.m3u8`, type: "hls" as const }, subtitles })) });
const options = () => ({ signal: new AbortController().signal, probeSubtitle: vi.fn(async (): Promise<SubtitleFormat> => "vtt"), validateVideo: vi.fn(async () => {}) });

describe("subtitle language normalization", () => {
  it.each(["Thai", "thai", "TH", "th", "tha", "th-TH", "th_TH", "ภาษาไทย"])("recognizes %s", (value) => {
    expect(normalizeLanguage(value)).toBe("th");
    expect(isThaiSubtitle({ language: value })).toBe(true);
    expect(isThaiSubtitle({ label: value })).toBe(true);
  });
  it.each(["Theatre", "The best", "Thames", "other", "", undefined, 42])("does not infer Thai from %s", (value) => expect(normalizeLanguage(value)).toBe("und"));
});
describe("episode-specific provider fallback", () => {
  it("models embedded Thai subtitles without probing or exposing switchable tracks", async () => {
    const opts = options();
    const result = await resolveMedia(episode, [{ id: "anifume", resolve: async () => ({ video: { url: "https://example.com/video.mp4", type: "mp4" }, subtitles: [track("en")], embeddedSubtitles: { language: "th", label: "Thai (embedded)", removable: false } }) }], opts);
    expect(result).toMatchObject({ provider: "anifume", subtitles: [], thaiStatus: "present", selectionReason: "thai_subtitle", embeddedSubtitles: { language: "th", removable: false } });
    expect(opts.probeSubtitle).not.toHaveBeenCalled();
  });
  it("selects a complete Thai bundle ahead of English", async () => {
    const spare = provider("unused", []);
    const result = await resolveMedia(episode, [provider("thai", [track("Thai")]), provider("english", [track("en")]), spare], options());
    expect(result).toMatchObject({ provider: "thai", thaiStatus: "present", selectionReason: "thai_subtitle" });
    expect(result.subtitles[0]).toMatchObject({ language: "th", default: true, syncStatus: "unverified" });
    expect(spare.resolve).toHaveBeenCalledTimes(1);
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
  it("falls back to displayable Thai when English cannot be displayed", async () => {
    const opts = options();
    opts.probeSubtitle.mockResolvedValueOnce("ass").mockResolvedValueOnce("vtt");
    const result = await resolveMedia(episode, [provider("multi", [track("en"), track("th")])], opts);
    expect(result.selectionReason).toBe("thai_subtitle");
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
  it("requires usable English when the fallback declares that requirement", async () => {
    for (const subtitles of [[], [track("th")], [track("en")]]) {
      const fallback = { ...provider("hianime", subtitles), requiresEnglishSubtitles: true };
      const opts = options();
      if (subtitles[0]?.language === "en") opts.probeSubtitle.mockRejectedValue(new Error("404"));
      await expect(resolveMedia(episode, [fallback], opts)).rejects.toThrow("english_subtitle_unavailable");
    }
    const fallback = { ...provider("hianime", [track("en")]), requiresEnglishSubtitles: true };
    const unsupported = options(); unsupported.probeSubtitle.mockResolvedValue("ass");
    await expect(resolveMedia(episode, [fallback], unsupported)).rejects.toThrow("english_subtitle_unavailable");
    const opts = options();
    expect(await resolveMedia(episode, [fallback], opts)).toMatchObject({ provider: "hianime", selectionReason: "english_subtitle" });
    expect(opts.validateVideo).toHaveBeenCalledWith("https://example.com/hianime.m3u8", expect.any(AbortSignal), "hianime");
    expect(opts.probeSubtitle).toHaveBeenCalledWith("https://example.com/en.vtt", expect.any(AbortSignal), "hianime");
  });
  it("retains the primary candidate when the fallback has no usable English", async () => {
    expect(await resolveMedia(episode, [provider("animeparadise", []), { ...provider("hianime", [track("th")]), requiresEnglishSubtitles: true }], options())).toMatchObject({ provider: "animeparadise", selectionReason: "video_only" });
  });
  it("times out an adapter that ignores cancellation and falls back", async () => {
    const hanging: MediaProvider = { id: "hanging", resolve: () => new Promise(() => {}) };
    expect(await resolveMedia(episode, [hanging, provider("good", [])], { ...options(), providerTimeout: 10 })).toMatchObject({ provider: "good" });
  });
  it("retains a valid earlier candidate when the overall deadline expires", async () => {
    expect(await resolveMedia(episode, [provider("good", []), { id: "hang", resolve: () => new Promise(() => {}) }], { ...options(), totalTimeout: 10 })).toMatchObject({ provider: "good" });
  });
  it("waits for a slower Thai source instead of returning faster English", async () => {
    const slowThai: MediaProvider = { id: "thai", resolve: async () => { await new Promise((resolve) => setTimeout(resolve, 15)); return { video: { url: "https://example.com/thai.mp4", type: "mp4" }, embeddedSubtitles: { language: "th", label: "Thai (embedded)", removable: false } }; } };
    expect(await resolveMedia(episode, [provider("english", [track("en")]), slowThai], { ...options(), providerTimeout: 100 })).toMatchObject({ provider: "thai", selectionReason: "thai_subtitle" });
  });
  it("requires English independently of the Thai preference score", async () => {
    expect(await resolveMedia(episode, [{ ...provider("hianime", [track("en"), track("th")]), requiresEnglishSubtitles: true }], options())).toMatchObject({ provider: "hianime", selectionReason: "thai_subtitle", subtitles: [{ language: "en", default: false }, { language: "th", default: true }] });
  });
  it("aborts pending providers when the caller cancels", async () => {
    const controller = new AbortController();
    const observed: AbortSignal[] = [];
    const pending = resolveMedia(episode, [{ id: "pending", resolve: async (_request, signal) => { observed.push(signal); return new Promise(() => {}); } }], { ...options(), signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 1));
    controller.abort(new MediaError("cancelled"));
    await expect(pending).rejects.toThrow("cancelled");
    expect(observed.map((signal) => signal.aborted)).toEqual([true]);
  });
  it("starts providers concurrently and distinguishes a timed out source from absence", async () => {
    const signals: AbortSignal[] = [];
    const result = await resolveProviderCandidates(episode, [{ id: "slow", resolve: async (_request, signal) => { signals.push(signal); return new Promise(() => {}); } }, { id: "absent", resolve: async () => { throw new MediaError("no_source"); } }, provider("ready", [track("en")])], { ...options(), providerTimeout: 10 });
    expect(result).toMatchObject([{ provider: "slow", code: "timeout" }, { provider: "absent", code: "no_source" }, { provider: "ready", media: { provider: "ready" } }]);
    expect(signals.map((signal) => signal.aborted)).toEqual([true]);
  });
  it("uses a real alternative in the same provider when the default video fails", async () => {
    const fallback = { video: { url: "https://example.com/360.mp4", type: "mp4" as const, quality: "360p" }, qualities: [{ id: "360p", label: "360p" }, { id: "720p", label: "720p" }], selectedQualityId: "360p", embeddedSubtitles: { language: "th" as const, label: "Thai (embedded)", removable: false as const } };
    const native: MediaProvider = { id: "anifume", resolve: async () => ({ ...fallback, video: { ...fallback.video, url: "https://example.com/dead.mp4", quality: "720p" } }), async *resolveAlternatives() { yield fallback; } };
    const opts = options(); opts.validateVideo.mockRejectedValueOnce(new MediaError("upstream_unavailable"));
    expect(await resolveMedia(episode, [native, provider("english", [track("en")])], opts)).toMatchObject({ provider: "anifume", video: { quality: "360p" }, selectedQualityId: "360p", selectionReason: "thai_subtitle" });
  });
  it.each([{ qualityId: "720p" }, { serverId: "1" }])("never substitutes an explicit source choice %j", async (choice) => {
    const alternatives = vi.fn(async function* () { yield { video: { url: "https://example.com/other.mp4", type: "mp4" as const } }; });
    const native: MediaProvider = { ...provider("native"), resolveAlternatives: alternatives };
    const opts = options(); opts.validateVideo.mockRejectedValue(new MediaError("invalid_video"));
    await expect(resolveMedia({ ...episode, ...choice }, [native], opts)).rejects.toThrow("invalid_video");
    expect(alternatives).not.toHaveBeenCalled();
  });
  it("keeps all alternative attempts inside the original provider deadline", async () => {
    const native: MediaProvider = { id: "anifume", resolve: async () => { throw new MediaError("no_source"); }, async *resolveAlternatives(_episode, signal) { await new Promise<void>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })); yield { video: { url: "https://example.com/late.mp4", type: "mp4" } }; } };
    expect(await resolveProviderCandidates(episode, [native], { ...options(), providerTimeout: 10 })).toEqual([{ provider: "anifume", code: "timeout" }]);
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
