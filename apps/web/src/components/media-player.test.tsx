import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaPlayer } from "./media-player";
import { createTrackerStore } from "@/features/tracker/store";
import type { MediaResult } from "@/features/media/types";

const hlsHarness = vi.hoisted(() => ({
  events: { MANIFEST_PARSED: "manifestParsed", LEVELS_UPDATED: "levelsUpdated", ERROR: "error" },
  isSupported: vi.fn(() => true),
  instances: [] as Array<{
    levels: Array<{ height: number }>;
    nextLevel: number;
    listeners: Map<string, (event: string, data: { fatal?: boolean }) => void>;
    off: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    attachMedia: ReturnType<typeof vi.fn>;
    loadSource: ReturnType<typeof vi.fn>;
  }>,
}));
vi.mock("hls.js", () => {
  class HlsMock {
    static Events = hlsHarness.events;
    static isSupported = hlsHarness.isSupported;
    levels: Array<{ height: number }> = [];
    nextLevel = -1;
    listeners = new Map<string, (event: string, data: { fatal?: boolean }) => void>();
    off = vi.fn((event: string) => { this.listeners.delete(event); });
    destroy = vi.fn();
    attachMedia = vi.fn();
    loadSource = vi.fn();
    constructor() { hlsHarness.instances.push(this); }
    on(event: string, listener: (event: string, data: { fatal?: boolean }) => void) { this.listeners.set(event, listener); }
  }
  return { default: HlsMock };
});

const result: MediaResult = { provider: "fixture", video: { url: "/fixture.mp4", type: "mp4" },
  metadata: { animeId: "mal-1", episodeNumber: 1 }, thaiStatus: "present", selectionReason: "thai_subtitle",
  subtitles: [{ language: "th", label: "Thai", url: "/thai.vtt", format: "vtt", default: true, availability: "available", displaySupported: true, syncStatus: "unverified" }] };
const props = () => ({ animeId: "mal-1", title: "Test anime", episode: 1, initialPosition: 10, onPositionChange: vi.fn(), onComplete: vi.fn() });
beforeEach(() => {
  hlsHarness.instances.length = 0;
  hlsHarness.isSupported.mockReturnValue(true);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => result }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("real media player", () => {
  it("shows a provider-catalog loading status until the catalog is ready", () => {
    const callbacks = props();
    const { container, rerender } = render(<MediaPlayer {...callbacks} providerLoading />);
    expect(container.querySelector(".aspect-video")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Checking provider catalog");
    expect(screen.queryByRole("button", { name: "Play episode" })).not.toBeInTheDocument();
    expect(container.querySelector("video")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();

    rerender(<MediaPlayer {...callbacks} providerLoading={false} />);
    expect(screen.getByRole("button", { name: "Play episode" })).toBeEnabled();
  });
  it("shows the same loading presentation during a manual source lookup", async () => {
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const { container } = render(<MediaPlayer {...props()} imageUrl="https://example.com/cover.jpg" />);

    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    expect(screen.getByRole("status")).toHaveTextContent("Finding source");
    expect(screen.queryByRole("button", { name: "Play episode" })).not.toBeInTheDocument();
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector(".aspect-video")?.getAttribute("style")).toBeNull();

    await act(async () => finish({ ok: true, json: async () => result } as Response));
    expect(await screen.findByRole("combobox", { name: "Subtitles" })).toBeVisible();
    expect(container.querySelector("video")).toBeInTheDocument();
    expect(screen.queryByText("Finding source…")).not.toBeInTheDocument();
  });
  it("resolves only on Play, restores position from actual duration, and uses the provider default when English is absent", async () => {
    const callbacks = props(); const { container } = render(<MediaPlayer {...callbacks} />);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    const video = container.querySelector("video")!;
    Object.defineProperty(video, "duration", { configurable: true, value: 100 });
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(10);
    expect(screen.getByRole("combobox", { name: "Subtitles" })).toHaveValue("0");
    fireEvent.change(screen.getByRole("combobox", { name: "Subtitles" }), { target: { value: "off" } });
    expect(screen.getByRole("combobox", { name: "Subtitles" })).toHaveValue("off");
    video.currentTime = 25; fireEvent.pause(video);
    expect(callbacks.onPositionChange).toHaveBeenLastCalledWith(25, 100);
  });
  it("defaults to English subtitles even when the provider marks Thai as default", async () => {
    const englishResult: MediaResult = { ...result, subtitles: [
      result.subtitles[0],
      { language: "en-US", label: "English", url: "/english.vtt", format: "vtt", default: false, availability: "available", displaySupported: true, syncStatus: "unverified" },
    ] };
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => englishResult } as Response);
    const { container } = render(<MediaPlayer {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    expect(screen.getByRole("combobox", { name: "Subtitles" })).toHaveValue("1");
    const tracks = container.querySelectorAll("track");
    expect(tracks[0]).not.toHaveAttribute("default");
    expect(tracks[1]).toHaveAttribute("default");
    expect(container.querySelector("video")?.getAttribute("src")).toBe(englishResult.video.url);
  });
  it("uses HLS.js levels when supported and changes quality without replacing or seeking the video", async () => {
    const hlsResult: MediaResult = { ...result, video: { url: "/master.m3u8", type: "hls" } };
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => hlsResult } as Response);
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("maybe");
    const callbacks = props();
    const { container } = render(<MediaPlayer {...callbacks} />);
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(hlsHarness.instances).toHaveLength(1));
    const hls = hlsHarness.instances[0];
    const video = container.querySelector("video")!;
    await waitFor(() => expect(hls.attachMedia).toHaveBeenCalledWith(video));
    hls.levels = [{ height: 1080 }, { height: 720 }, { height: 720 }];
    act(() => hls.listeners.get(hlsHarness.events.MANIFEST_PARSED)?.(hlsHarness.events.MANIFEST_PARSED, {}));

    const quality = await screen.findByRole("combobox", { name: "Video quality" });
    expect(quality).toHaveValue("-1");
    expect(Array.from(quality.querySelectorAll("option")).map(({ value, textContent }) => [value, textContent])).toEqual([
      ["-1", "Auto"], ["0", "1080p"], ["1", "720p (Level 2)"], ["2", "720p (Level 3)"],
    ]);

    Object.defineProperty(video, "duration", { configurable: true, value: 100 });
    fireEvent.loadedMetadata(video);
    video.currentTime = 37;
    const playCalls = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;
    fireEvent.change(quality, { target: { value: "2" } });
    expect(quality).toHaveValue("2");
    expect(hls.nextLevel).toBe(2);
    expect(container.querySelector("video")).toBe(video);
    expect(video.currentTime).toBe(37);
    expect(vi.mocked(HTMLMediaElement.prototype.play)).toHaveBeenCalledTimes(playCalls);
    expect(callbacks.onComplete).not.toHaveBeenCalled();

    fireEvent.change(quality, { target: { value: "-1" } });
    expect(quality).toHaveValue("-1");
    expect(hls.nextLevel).toBe(-1);
  });
  it("cleans HLS listeners and resets to Auto when requesting a fresh source", async () => {
    const hlsResult: MediaResult = { ...result, video: { url: "/master.m3u8", type: "hls" } };
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => hlsResult } as Response);
    const { container } = render(<MediaPlayer {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(hlsHarness.instances).toHaveLength(1));
    const firstHls = hlsHarness.instances[0];
    firstHls.levels = [{ height: 1080 }, { height: 720 }];
    act(() => firstHls.listeners.get(hlsHarness.events.MANIFEST_PARSED)?.(hlsHarness.events.MANIFEST_PARSED, {}));
    const firstQuality = await screen.findByRole("combobox", { name: "Video quality" });
    fireEvent.change(firstQuality, { target: { value: "1" } });
    expect(firstHls.nextLevel).toBe(1);

    let finishRefresh!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise((resolve) => { finishRefresh = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Request fresh source" }));
    await waitFor(() => expect(firstHls.destroy).toHaveBeenCalledOnce());
    expect(firstHls.listeners.size).toBe(0);
    expect(firstHls.off).toHaveBeenCalledTimes(3);

    await act(async () => finishRefresh({ ok: true, json: async () => hlsResult } as Response));
    await waitFor(() => expect(hlsHarness.instances).toHaveLength(2));
    const refreshedHls = hlsHarness.instances[1];
    refreshedHls.levels = [{ height: 1080 }, { height: 720 }];
    act(() => refreshedHls.listeners.get(hlsHarness.events.MANIFEST_PARSED)?.(hlsHarness.events.MANIFEST_PARSED, {}));
    expect(await screen.findByRole("combobox", { name: "Video quality" })).toHaveValue("-1");
    expect(container.querySelector("video")).toBeInTheDocument();
  });
  it("starts a keyed episode with Auto and disposes the previous HLS instance", async () => {
    const hlsResult: MediaResult = { ...result, video: { url: "/master.m3u8", type: "hls" } };
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => hlsResult } as Response);
    const callbacks = props();
    const { rerender } = render(<MediaPlayer key="1" {...callbacks} />);
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(hlsHarness.instances).toHaveLength(1));
    const firstHls = hlsHarness.instances[0];
    firstHls.levels = [{ height: 1080 }, { height: 720 }];
    act(() => firstHls.listeners.get(hlsHarness.events.MANIFEST_PARSED)?.(hlsHarness.events.MANIFEST_PARSED, {}));
    fireEvent.change(await screen.findByRole("combobox", { name: "Video quality" }), { target: { value: "1" } });
    expect(firstHls.nextLevel).toBe(1);

    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => hlsResult } as Response);
    rerender(<MediaPlayer key="2" {...callbacks} episode={2} />);
    await waitFor(() => expect(firstHls.destroy).toHaveBeenCalledOnce());
    expect(firstHls.listeners.size).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(hlsHarness.instances).toHaveLength(2));
    const secondHls = hlsHarness.instances[1];
    secondHls.levels = [{ height: 1080 }, { height: 720 }];
    act(() => secondHls.listeners.get(hlsHarness.events.MANIFEST_PARSED)?.(hlsHarness.events.MANIFEST_PARSED, {}));
    expect(await screen.findByRole("combobox", { name: "Video quality" })).toHaveValue("-1");
    expect(vi.mocked(fetch).mock.calls[1][1]?.body).toBe(JSON.stringify({ episodeNumber: 2 }));
  });
  it.each([
    ["MP4", "mp4", true],
    ["native HLS fallback", "hls", false],
  ] as const)("shows source-controlled quality for %s without invented resolutions", async (_name, type, hlsSupported) => {
    const source: MediaResult = { ...result, video: { url: type === "hls" ? "/native.m3u8" : "/source.mp4", type } };
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => source } as Response);
    if (!hlsSupported) {
      hlsHarness.isSupported.mockReturnValue(false);
      vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("maybe");
    }
    render(<MediaPlayer {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    expect(await screen.findByText("Quality is controlled by the source.")).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Video quality" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /\d+p/ })).not.toBeInTheDocument();
    if (type === "hls") {
      expect(hlsHarness.instances).toHaveLength(0);
      expect(HTMLMediaElement.prototype.canPlayType).toHaveBeenCalledWith("application/vnd.apple.mpegurl");
    }
  });
  it("completes once when playback ends", async () => {
    const callbacks = props(); const { container } = render(<MediaPlayer {...callbacks} />);
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    const video = container.querySelector("video")!;
    Object.defineProperty(video, "duration", { configurable: true, value: 100 });
    video.currentTime = 95;
    fireEvent.ended(video);
    fireEvent.ended(video);
    expect(callbacks.onPositionChange).toHaveBeenLastCalledWith(95, 100);
    expect(callbacks.onComplete).toHaveBeenCalledOnce();
  });
  it("keeps manual completion and ignores end events after it", async () => {
    const callbacks = props(); const { container } = render(<MediaPlayer {...callbacks} />);
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    const video = container.querySelector("video")!;
    Object.defineProperty(video, "duration", { configurable: true, value: 100 });
    video.currentTime = 90;
    fireEvent.click(screen.getByRole("button", { name: "Mark episode complete" }));
    fireEvent.ended(video);
    fireEvent.ended(video);
    expect(callbacks.onPositionChange).toHaveBeenLastCalledWith(90, 100);
    expect(callbacks.onComplete).toHaveBeenCalledOnce();
  });
  it("queues one MAL progress update for the expected episode", async () => {
    const store = createTrackerStore({
      storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      createOperationId: () => "ended-episode-1",
    });
    const version = store.getState().beginMalBootstrap();
    store.getState().activateMalAccount(version, true, { id: 1, name: "viewer-1" });
    store.getState().registerAnime({ id: "mal-1", title: "Test anime", subtitle: "", synopsis: "", genres: [], totalEpisodes: 3, episodeMinutes: 24, accent: "violet" });
    store.getState().ensureEntry("mal-1");
    const callbacks = { ...props(), onComplete: () => store.getState().markEpisodeComplete("mal-1", 1) };
    const { container } = render(<MediaPlayer {...callbacks} />);
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    const video = container.querySelector("video")!;
    Object.defineProperty(video, "duration", { configurable: true, value: 100 });
    fireEvent.ended(video);
    store.getState().markEpisodeComplete("mal-1", 1);
    expect(store.getState().library["mal-1"]).toMatchObject({ watchedEpisodes: 1, currentEpisode: 2 });
    expect(store.getState().malSync.operations.map(({ changes }) => changes)).toEqual([{ watchedEpisodes: 1 }]);
  });
  it("throttles time updates and flushes the latest position on unmount", async () => {
    const callbacks = props(); const { container, unmount } = render(<MediaPlayer {...callbacks} />);
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    const video = container.querySelector("video")!;
    Object.defineProperty(video, "duration", { value: 100 });
    video.currentTime = 12; fireEvent.timeUpdate(video);
    video.currentTime = 13; fireEvent.timeUpdate(video);
    expect(callbacks.onPositionChange).toHaveBeenCalledTimes(1);
    unmount(); expect(callbacks.onPositionChange).toHaveBeenLastCalledWith(13, 100);
  });
  it("shows mapping failures and can request a fresh source", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: async () => ({ error: { code: "mapping_required" } }) } as Response);
    render(<MediaPlayer {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be matched safely");
    fireEvent.click(screen.getByRole("button", { name: "Request fresh source" }));
    expect(await screen.findByRole("combobox", { name: "Subtitles" })).toBeVisible();
  });
  it.each([
    ["metadata_unavailable", "Anime details are temporarily unavailable"],
    ["upstream_unavailable", "The video provider is temporarily unavailable"],
    ["provider_unavailable", "The video provider is temporarily unavailable"],
    ["timeout", "Finding a source took too long"],
    ["english_subtitle_unavailable", "no usable English subtitles"],
    ["no_source", "No playable source is available for this title"],
  ])("explains %s without conflating an outage with a missing title", async (code, message) => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: async () => ({ error: { code } }) } as Response);
    render(<MediaPlayer {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Request fresh source" })).toBeEnabled();
  });
  it("aborts old episode requests and ignores their late responses", async () => {
    let complete!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }));
    const { rerender, container } = render(<MediaPlayer key="1" {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    rerender(<MediaPlayer key="2" {...props()} episode={2} />);
    expect(signal?.aborted).toBe(true);
    await act(async () => complete({ ok: true, json: async () => result } as Response));
    expect(container.querySelector("video")).toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("does not complete a new episode when an old pending source ends", async () => {
    let complete!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }));
    const callbacks = props();
    const newComplete = vi.fn();
    const { rerender, container } = render(<MediaPlayer {...callbacks} />);
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    rerender(<MediaPlayer {...callbacks} episode={2} onComplete={newComplete} />);
    await act(async () => complete({ ok: true, json: async () => result } as Response));
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    const video = container.querySelector("video")!;
    Object.defineProperty(video, "duration", { configurable: true, value: 100 });
    fireEvent.ended(video);
    expect(callbacks.onComplete).not.toHaveBeenCalled();
    expect(newComplete).not.toHaveBeenCalled();
  });
  it("offers manual play after autoplay rejection and reports dead subtitle tracks", async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error("NotAllowedError"));
    const { container } = render(<MediaPlayer {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    Object.defineProperty(container.querySelector("video"), "duration", { value: 100 });
    fireEvent.loadedMetadata(container.querySelector("video")!);
    expect(await screen.findByRole("button", { name: "Play video" })).toBeVisible();
    fireEvent.error(container.querySelector("track")!);
    expect(screen.getByRole("combobox", { name: "Subtitles" })).toHaveValue("off");
    expect(screen.getByRole("option", { name: "Thai (unavailable)" })).toBeDisabled();
  });
});
