import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaPlayer, type MediaSourceSelection } from "./media-player";
import { createTrackerStore } from "@/features/tracker/store";
import type { MediaResult, MediaServerList } from "@/features/media/types";

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

const result: MediaResult = { provider: "anizone", video: { url: "/fixture.mp4", type: "mp4" },
  metadata: { animeId: "mal-1", episodeNumber: 1 }, thaiStatus: "present", selectionReason: "thai_subtitle",
  subtitles: [{ language: "th", label: "Thai", url: "/thai.vtt", format: "vtt", default: true, availability: "available", displaySupported: true, syncStatus: "unverified" }] };
const resultForEpisode = (episodeNumber: number) => ({ ...result, metadata: { animeId: "mal-1", episodeNumber } });
const availableProviders = [
  { id: "animeparadise", label: "AnimeParadise", status: "available", subtitleLanguage: "en" },
  { id: "hianime", label: "HiAnime", status: "available", subtitleLanguage: "en" },
  { id: "anizone", label: "Anizone", status: "available", subtitleLanguage: "th" },
  { id: "anifume", label: "Anifume (Thai)", status: "available", subtitleLanguage: "th", qualities: [{ id: "360p", label: "360p" }, { id: "720p", label: "720p" }], selectedQualityId: "720p" },
  { id: "animeruka", label: "AnimeRuka", status: "available", subtitleLanguage: "th" },
];
const providerDiscovery = (episodeNumber = 1, providers = availableProviders, defaultProviderId = "anizone") => ({ metadata: { animeId: "mal-1", episodeNumber }, providers, defaultProviderId });
const animeRukaServerList: MediaServerList = { provider: "animeruka", defaultServerId: "main", servers: [
  { id: "main", label: "Main" }, { id: "backup-a", label: "Backup A" }, { id: "backup-b", label: "Backup B" }, { id: "backup-c", label: "Backup C" },
] };
const embeddedThaiResult: MediaResult = { ...result, provider: "anifume", video: { url: "/anifume.mp4", type: "mp4", quality: "720p" }, subtitles: [], embeddedSubtitles: { language: "th", label: "Thai", removable: false } };
type Endpoint = "providers" | "servers" | "media";
const endpointResponses: Record<Endpoint, Array<Response | Promise<Response>>> = { providers: [], servers: [], media: [] };
function response(payload: unknown, ok = true): Response {
  return { ok, json: async () => payload } as Response;
}
function queueResponse(endpoint: Endpoint, payload: unknown, ok = true) {
  endpointResponses[endpoint].push(Promise.resolve(response(payload, ok)));
}
function queuePendingResponse(endpoint: Endpoint, pendingResponse: Promise<Response>) {
  endpointResponses[endpoint].push(pendingResponse);
}
function requestEndpoint(input: RequestInfo | URL): Endpoint {
  const url = String(input);
  return url.includes("/media/providers?") ? "providers" : url.includes("/media/servers?") ? "servers" : "media";
}
function endpointCalls(endpoint: Endpoint) {
  return vi.mocked(fetch).mock.calls.filter(([input]) => requestEndpoint(input) === endpoint);
}
async function waitForProviderOptions() {
  return waitFor(() => {
    const source = screen.getByRole("combobox", { name: "Video source" });
    expect(source.querySelector('option[value="animeruka"]')).not.toBeNull();
    return source;
  });
}
const props = () => ({ animeId: "mal-1", title: "Test anime", episode: 1, initialPosition: 10, sourceSelection: "automatic" as MediaSourceSelection, onSourceSelectionChange: vi.fn<(source: MediaSourceSelection) => void>(), onPositionChange: vi.fn(), onComplete: vi.fn() });
function ControlledMediaPlayer({ callbacks, episode = callbacks.episode }: { callbacks: ReturnType<typeof props>; episode?: number }) {
  const [sourceSelection, setSourceSelection] = useState<MediaSourceSelection>(callbacks.sourceSelection);
  return <MediaPlayer key={`${callbacks.animeId}-${episode}`} {...callbacks} episode={episode} sourceSelection={sourceSelection} onSourceSelectionChange={setSourceSelection} />;
}
beforeEach(() => {
  endpointResponses.providers.length = 0;
  endpointResponses.servers.length = 0;
  endpointResponses.media.length = 0;
  hlsHarness.instances.length = 0;
  hlsHarness.isSupported.mockReturnValue(true);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const endpoint = requestEndpoint(input);
    const queued = endpointResponses[endpoint].shift();
    if (queued) return queued;
    if (endpoint === "providers") {
      const url = new URL(String(input), "http://localhost");
      return response(providerDiscovery(Number(url.searchParams.get("episodeNumber") ?? 1)));
    }
    if (endpoint === "servers") return response(animeRukaServerList);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as { episodeNumber?: number } : {};
    return response(resultForEpisode(body.episodeNumber ?? 1));
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("real media player", () => {
  it("shows a provider-catalog loading status until the catalog is ready", async () => {
    const callbacks = props();
    const { container, rerender } = render(<MediaPlayer {...callbacks} providerLoading />);
    expect(container.querySelector(".aspect-video")).toBeInTheDocument();
    expect(screen.getByText("Checking provider catalog…")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Play episode" })).not.toBeInTheDocument();
    expect(container.querySelector("video")).toBeNull();
    expect(endpointCalls("media")).toHaveLength(0);

    rerender(<MediaPlayer {...callbacks} providerLoading={false} />);
    await waitForProviderOptions();
    expect(screen.getByRole("button", { name: "Play episode" })).toBeEnabled();
  });
  it("blocks playback until availability confirms a source, then lets a retry unlock it", async () => {
    let finishAvailability!: (response: Response) => void;
    queuePendingResponse("providers", new Promise((resolve) => { finishAvailability = resolve; }));
    queueResponse("providers", providerDiscovery());
    const callbacks = props();
    render(<MediaPlayer {...callbacks} />);
    const play = screen.getByRole("button", { name: "Play episode" });
    expect(play).toBeDisabled();
    fireEvent.click(play);
    expect(endpointCalls("media")).toHaveLength(0);

    const providerAvailability = screen.getByRole("region", { name: "Provider availability" });
    await waitFor(() => expect(endpointCalls("providers")).toHaveLength(1));
    const uncertainDiscovery = {
      metadata: { animeId: "mal-1", episodeNumber: 1 },
      providers: [
        { id: "anizone", label: "Anizone", status: "timeout", code: "timeout" },
        { id: "hianime", label: "HiAnime", status: "unavailable", code: "provider_unavailable" },
      ],
    };
    await act(async () => finishAvailability(response(uncertainDiscovery)));
    expect(await within(providerAvailability).findByText("Could not check")).toBeVisible();
    expect(within(providerAvailability).getByText("No playable video is confirmed yet. Some provider checks could not finish; retry availability.")).toBeVisible();
    expect(within(providerAvailability).queryByText("No episode available")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Anizone.*Could not check/ })).toBeDisabled();
    expect(play).toBeDisabled();
    fireEvent.click(play);
    expect(endpointCalls("media")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Retry provider availability" }));
    await waitForProviderOptions();
    expect(play).toBeEnabled();
    fireEvent.click(play);
    await waitFor(() => expect(endpointCalls("media")).toHaveLength(1));
    expect(endpointCalls("media")[0][1]?.body).toBe(JSON.stringify({ episodeNumber: 1 }));
  });
  it("ignores availability responses from a previous episode", async () => {
    let finishEpisodeOne!: (response: Response) => void;
    queuePendingResponse("providers", new Promise((resolve) => { finishEpisodeOne = resolve; }));
    queueResponse("providers", providerDiscovery(2, [
      { id: "hianime", label: "HiAnime episode 2", status: "available", subtitleLanguage: "en" },
    ], "hianime"));
    const callbacks = props();
    const { rerender } = render(<MediaPlayer {...callbacks} />);
    await waitFor(() => expect(endpointCalls("providers")).toHaveLength(1));
    const oldSignal = endpointCalls("providers")[0][1]?.signal;

    rerender(<MediaPlayer {...callbacks} episode={2} />);
    const source = await screen.findByRole("combobox", { name: "Video source" });
    await screen.findByRole("option", { name: /HiAnime episode 2/ });
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => finishEpisodeOne(response(providerDiscovery(1, [
      { id: "animeparadise", label: "AnimeParadise episode 1", status: "available", subtitleLanguage: "th" },
    ], "animeparadise"))));

    expect(source).toHaveValue("automatic");
    expect(source.querySelector('option[value="animeparadise"]')).toBeNull();
    expect(screen.queryByText("AnimeParadise episode 1")).not.toBeInTheDocument();
  });
  it("clears a saved provider choice when the next episode does not list it as available", async () => {
    const callbacks = props();
    const { rerender } = render(<ControlledMediaPlayer callbacks={callbacks} />);
    const source = await waitForProviderOptions();
    fireEvent.change(source, { target: { value: "animeparadise" } });
    expect(source).toHaveValue("animeparadise");

    queueResponse("providers", providerDiscovery(2, [
      { id: "hianime", label: "HiAnime episode 2", status: "available", subtitleLanguage: "en" },
    ], "hianime"));
    rerender(<ControlledMediaPlayer callbacks={callbacks} episode={2} />);
    await screen.findByRole("option", { name: /HiAnime episode 2/ });
    const currentSource = screen.getByRole("combobox", { name: "Video source" });
    await waitFor(() => expect(currentSource).toHaveValue("automatic"));
    expect(currentSource.querySelector('option[value="animeparadise"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(endpointCalls("media")).toHaveLength(1));
    expect(endpointCalls("media")[0][1]?.body).toBe(JSON.stringify({ episodeNumber: 2 }));
  });
  it("shows the same loading presentation during a manual source lookup", async () => {
    let finish!: (response: Response) => void;
    queuePendingResponse("media", new Promise((resolve) => { finish = resolve; }));
    const { container } = render(<MediaPlayer {...props()} imageUrl="https://example.com/cover.jpg" />);

    await waitForProviderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    expect(screen.getByText("Finding source…")).toBeVisible();
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
    expect(endpointCalls("media")).toHaveLength(0);
    await waitForProviderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(endpointCalls("media")).toHaveLength(1));
    expect(endpointCalls("media")[0][1]?.body).toBe(JSON.stringify({ episodeNumber: 1 }));
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
  it("defaults to Thai subtitles even when the provider marks English as default", async () => {
    const englishResult: MediaResult = { ...result, subtitles: [
      { ...result.subtitles[0], default: false },
      { language: "en-US", label: "English", url: "/english.vtt", format: "vtt", default: true, availability: "available", displaySupported: true, syncStatus: "unverified" },
    ] };
    queueResponse("media", englishResult);
    const { container } = render(<MediaPlayer {...props()} />);
    await waitForProviderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    expect(screen.getByRole("combobox", { name: "Subtitles" })).toHaveValue("0");
    const tracks = container.querySelectorAll("track");
    expect(tracks[0]).toHaveAttribute("default");
    expect(tracks[1]).not.toHaveAttribute("default");
    expect(container.querySelector("video")?.getAttribute("src")).toBe(englishResult.video.url);
  });
  it("uses HLS.js levels when supported and changes quality without replacing or seeking the video", async () => {
    const hlsResult: MediaResult = { ...result, video: { url: "/master.m3u8", type: "hls" } };
    queueResponse("media", hlsResult);
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("maybe");
    const callbacks = props();
    const { container } = render(<MediaPlayer {...callbacks} />);
    await waitForProviderOptions();
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
    queueResponse("media", hlsResult);
    const { container } = render(<MediaPlayer {...props()} />);
    await waitForProviderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(hlsHarness.instances).toHaveLength(1));
    const firstHls = hlsHarness.instances[0];
    firstHls.levels = [{ height: 1080 }, { height: 720 }];
    act(() => firstHls.listeners.get(hlsHarness.events.MANIFEST_PARSED)?.(hlsHarness.events.MANIFEST_PARSED, {}));
    const firstQuality = await screen.findByRole("combobox", { name: "Video quality" });
    fireEvent.change(firstQuality, { target: { value: "1" } });
    expect(firstHls.nextLevel).toBe(1);

    let finishRefresh!: (response: Response) => void;
    queuePendingResponse("media", new Promise((resolve) => { finishRefresh = resolve; }));
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
    queueResponse("media", hlsResult);
    const callbacks = props();
    const { rerender } = render(<MediaPlayer key="1" {...callbacks} />);
    await waitForProviderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(hlsHarness.instances).toHaveLength(1));
    const firstHls = hlsHarness.instances[0];
    firstHls.levels = [{ height: 1080 }, { height: 720 }];
    act(() => firstHls.listeners.get(hlsHarness.events.MANIFEST_PARSED)?.(hlsHarness.events.MANIFEST_PARSED, {}));
    fireEvent.change(await screen.findByRole("combobox", { name: "Video quality" }), { target: { value: "1" } });
    expect(firstHls.nextLevel).toBe(1);

    rerender(<MediaPlayer key="2" {...callbacks} episode={2} />);
    await waitFor(() => expect(firstHls.destroy).toHaveBeenCalledOnce());
    expect(firstHls.listeners.size).toBe(0);
    const episodeTwoHlsResult: MediaResult = { ...hlsResult, metadata: { animeId: "mal-1", episodeNumber: 2 } };
    queueResponse("media", episodeTwoHlsResult);
    await waitForProviderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(hlsHarness.instances).toHaveLength(2));
    const secondHls = hlsHarness.instances[1];
    secondHls.levels = [{ height: 1080 }, { height: 720 }];
    act(() => secondHls.listeners.get(hlsHarness.events.MANIFEST_PARSED)?.(hlsHarness.events.MANIFEST_PARSED, {}));
    expect(await screen.findByRole("combobox", { name: "Video quality" })).toHaveValue("-1");
    expect(endpointCalls("media")[1][1]?.body).toBe(JSON.stringify({ episodeNumber: 2 }));
  });
  it.each([
    ["MP4", "mp4", true],
    ["native HLS fallback", "hls", false],
  ] as const)("shows source-controlled quality for %s without invented resolutions", async (_name, type, hlsSupported) => {
    const source: MediaResult = { ...result, video: { url: type === "hls" ? "/native.m3u8" : "/source.mp4", type } };
    queueResponse("media", source);
    if (!hlsSupported) {
      hlsHarness.isSupported.mockReturnValue(false);
      vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("maybe");
    }
    render(<MediaPlayer {...props()} />);
    await waitForProviderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    expect(await screen.findByText("Quality is controlled by the source.")).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Video quality" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /\d+p/ })).not.toBeInTheDocument();
    if (type === "hls") {
      expect(hlsHarness.instances).toHaveLength(0);
      expect(HTMLMediaElement.prototype.canPlayType).toHaveBeenCalledWith("application/vnd.apple.mpegurl");
    }
  });
  it("shows provider quality only when verified quality metadata is supplied", async () => {
    queueResponse("providers", providerDiscovery(1, availableProviders.map((provider) => provider.id === "anifume"
      ? { ...provider, qualities: [{ id: "720p", label: "720p" }], selectedQualityId: "720p" }
      : provider)));
    queueResponse("media", embeddedThaiResult);
    render(<MediaPlayer {...props()} />);

    await waitForProviderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));

    expect(await screen.findByText("Quality: 720p")).toBeVisible();
    expect(screen.queryByText("Quality is controlled by the source.")).not.toBeInTheDocument();
  });
  it("completes once when playback ends", async () => {
    const callbacks = props(); const { container } = render(<MediaPlayer {...callbacks} />);
    await waitForProviderOptions();
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
    await waitForProviderOptions();
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
    await waitForProviderOptions();
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
    await waitForProviderOptions();
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
    queueResponse("media", { error: { code: "mapping_required" } }, false);
    render(<MediaPlayer {...props()} />);
    await waitForProviderOptions();
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
    ["resource_timeout", "The video source took too long"],
    ["english_subtitle_unavailable", "no usable English subtitles"],
    ["no_source", "No playable source is available for this title"],
  ])("explains %s without conflating an outage with a missing title", async (code, message) => {
    queueResponse("media", { error: { code } }, false);
    render(<MediaPlayer {...props()} />);
    await waitForProviderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Request fresh source" })).toBeEnabled();
  });
  it("aborts old episode requests and ignores their late responses", async () => {
    let complete!: (response: Response) => void;
    queuePendingResponse("media", new Promise((resolve) => { complete = resolve; }));
    const { rerender, container } = render(<MediaPlayer key="1" {...props()} />);
    await waitForProviderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    const signal = endpointCalls("media")[0][1]?.signal;
    rerender(<MediaPlayer key="2" {...props()} episode={2} />);
    expect(signal?.aborted).toBe(true);
    await act(async () => complete({ ok: true, json: async () => result } as Response));
    expect(container.querySelector("video")).toBeNull();
    expect(endpointCalls("media")).toHaveLength(1);
  });
  it("lets the user choose Anizone before Play without fetching or autoplaying", async () => {
    const callbacks = props();
    render(<ControlledMediaPlayer callbacks={callbacks} />);

    const source = await waitForProviderOptions();
    expect(source).toHaveValue("automatic");
    fireEvent.change(source, { target: { value: "anizone" } });
    expect(source).toHaveValue("anizone");
    expect(endpointCalls("media")).toHaveLength(0);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();

    await waitForProviderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(endpointCalls("media")).toHaveLength(1));
    expect(endpointCalls("media")[0][1]?.body).toBe(JSON.stringify({ episodeNumber: 1, provider: "anizone" }));
    expect(await screen.findByRole("combobox", { name: "Subtitles" })).toBeVisible();
  });
  it("keeps Auto as the default and sends an explicit Anifume source request", async () => {
    queueResponse("media", embeddedThaiResult);
    const callbacks = props();
    render(<ControlledMediaPlayer callbacks={callbacks} />);

    const source = await waitForProviderOptions();
    expect(source).toHaveValue("automatic");
    expect(screen.getByRole("option", { name: /Anifume \(Thai\)/ })).toHaveValue("anifume");
    fireEvent.change(source, { target: { value: "anifume" } });
    expect(source).toHaveValue("anifume");
    expect(endpointCalls("media")).toHaveLength(0);

    await waitForProviderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(endpointCalls("media")).toHaveLength(1));
    expect(endpointCalls("media")[0][1]?.body).toBe(JSON.stringify({ episodeNumber: 1, provider: "anifume", qualityId: "720p" }));
  });
  it("keeps Auto Thai-first and uses the actual provider after the automatic request", async () => {
    queueResponse("providers", providerDiscovery(1, availableProviders, "anifume"));
    queueResponse("media", embeddedThaiResult);
    const callbacks = props();
    render(<ControlledMediaPlayer callbacks={callbacks} />);
    const source = await waitForProviderOptions();
    expect(source).toHaveValue("automatic");
    expect(screen.getByRole("option", { name: /Anifume \(Thai\).*Auto pick/ })).toBeInTheDocument();

    await waitForProviderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(endpointCalls("media")).toHaveLength(1));
    expect(endpointCalls("media")[0][1]?.body).toBe(JSON.stringify({ episodeNumber: 1 }));
    expect(await screen.findByRole("combobox", { name: "Video quality" })).toHaveValue("720p");
    expect(source).toHaveValue("automatic");
  });
  it("sends the changed Anifume MP4 quality and resumes at the saved position", async () => {
    const qualities = [{ id: "360p", label: "360p" }, { id: "720p", label: "720p" }];
    const result720: MediaResult = { ...embeddedThaiResult, qualities, selectedQualityId: "720p" };
    const result360: MediaResult = { ...embeddedThaiResult, video: { url: "/anifume-360.mp4", type: "mp4", quality: "360p" }, qualities, selectedQualityId: "360p" };
    queueResponse("media", result720);
    queueResponse("media", result360);
    const callbacks = props();
    const { container } = render(<ControlledMediaPlayer callbacks={callbacks} />);
    const source = await waitForProviderOptions();
    fireEvent.change(source, { target: { value: "anifume" } });
    await waitFor(() => expect(source).toHaveValue("anifume"));
    await waitForProviderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(endpointCalls("media")).toHaveLength(1));
    expect(endpointCalls("media")[0][1]?.body).toBe(JSON.stringify({ episodeNumber: 1, provider: "anifume", qualityId: "720p" }));

    let video = container.querySelector("video")!;
    Object.defineProperty(video, "duration", { configurable: true, value: 100 });
    fireEvent.loadedMetadata(video);
    video.currentTime = 30;
    fireEvent.change(await screen.findByRole("combobox", { name: "Video quality" }), { target: { value: "360p" } });
    await waitFor(() => expect(endpointCalls("media")).toHaveLength(2));
    expect(endpointCalls("media")[1][1]?.body).toBe(JSON.stringify({ episodeNumber: 1, provider: "anifume", qualityId: "360p" }));
    expect(callbacks.onPositionChange).toHaveBeenCalledWith(30, 100);

    await waitFor(() => expect(container.querySelector("video")?.getAttribute("src")).toBe("/anifume-360.mp4"));
    video = container.querySelector("video")!;
    Object.defineProperty(video, "duration", { configurable: true, value: 100 });
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(30);
    expect(screen.getByRole("combobox", { name: "Video quality" })).toHaveValue("360p");
  });
  it("remembers Anifume quality when switching to another provider and back", async () => {
    const qualities = [{ id: "360p", label: "360p" }, { id: "720p", label: "720p" }];
    const anifume720: MediaResult = { ...embeddedThaiResult, qualities, selectedQualityId: "720p" };
    const anifume360: MediaResult = { ...embeddedThaiResult, video: { url: "/anifume-360.mp4", type: "mp4", quality: "360p" }, qualities, selectedQualityId: "360p" };
    const hianime: MediaResult = { ...result, provider: "hianime" };
    queueResponse("media", anifume720);
    queueResponse("media", anifume360);
    queueResponse("media", hianime);
    queueResponse("media", anifume360);
    const callbacks = props();
    render(<ControlledMediaPlayer callbacks={callbacks} />);
    const source = await waitForProviderOptions();

    fireEvent.change(source, { target: { value: "anifume" } });
    await waitFor(() => expect(source).toHaveValue("anifume"));
    await waitForProviderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(endpointCalls("media")).toHaveLength(1));
    expect(endpointCalls("media")[0][1]?.body).toBe(JSON.stringify({ episodeNumber: 1, provider: "anifume", qualityId: "720p" }));

    fireEvent.change(await screen.findByRole("combobox", { name: "Video quality" }), { target: { value: "360p" } });
    await waitFor(() => expect(endpointCalls("media")).toHaveLength(2));
    expect(endpointCalls("media")[1][1]?.body).toBe(JSON.stringify({ episodeNumber: 1, provider: "anifume", qualityId: "360p" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Video quality" })).toHaveValue("360p"));

    fireEvent.change(source, { target: { value: "hianime" } });
    await waitFor(() => expect(endpointCalls("media")).toHaveLength(3));
    expect(endpointCalls("media")[2][1]?.body).toBe(JSON.stringify({ episodeNumber: 1, provider: "hianime" }));
    await waitFor(() => expect(source).toHaveValue("hianime"));

    fireEvent.change(source, { target: { value: "anifume" } });
    await waitFor(() => expect(endpointCalls("media")).toHaveLength(4));
    expect(endpointCalls("media")[3][1]?.body).toBe(JSON.stringify({ episodeNumber: 1, provider: "anifume", qualityId: "360p" }));
    await waitFor(() => expect(source).toHaveValue("anifume"));
    expect(await screen.findByRole("combobox", { name: "Video quality" })).toHaveValue("360p");
  });
  it("does not fall back after an explicitly selected provider fails", async () => {
    queueResponse("media", { error: { code: "provider_unavailable" } }, false);
    const callbacks = props();
    render(<ControlledMediaPlayer callbacks={callbacks} />);
    const source = await waitForProviderOptions();
    fireEvent.change(source, { target: { value: "hianime" } });
    await waitFor(() => expect(source).toHaveValue("hianime"));
    await waitForProviderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The video provider is temporarily unavailable");
    expect(endpointCalls("media")).toHaveLength(1);
    expect(endpointCalls("media")[0][1]?.body).toBe(JSON.stringify({ episodeNumber: 1, provider: "hianime" }));
    expect(source).toHaveValue("hianime");
  });
  it("discovers AnimeRuka servers before Play and sends the selected server in the media request", async () => {
    queueResponse("servers", animeRukaServerList);
    queueResponse("media", result);
    const callbacks = props();
    render(<ControlledMediaPlayer callbacks={callbacks} />);

    await waitForProviderOptions();
    fireEvent.change(screen.getByRole("combobox", { name: "Video source" }), { target: { value: "animeruka" } });
    const origin = await screen.findByRole("combobox", { name: "AnimeRuka server" });
    expect(endpointCalls("servers")[0][0]).toBe("/api/anime/mal-1/media/servers?episodeNumber=1&provider=animeruka");
    expect(endpointCalls("servers")[0][1]?.method).toBeUndefined();
    expect(origin).toHaveValue("main");
    expect(Array.from(origin.querySelectorAll("option")).map(({ textContent }) => textContent)).toEqual(["Main", "Backup A", "Backup B", "Backup C"]);
    expect(endpointCalls("servers")).toHaveLength(1);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();

    fireEvent.change(origin, { target: { value: "backup-c" } });
    expect(endpointCalls("servers")).toHaveLength(1);
    await waitForProviderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));

    await waitFor(() => expect(endpointCalls("media")).toHaveLength(1));
    expect(endpointCalls("media")[0][1]?.body).toBe(JSON.stringify({ episodeNumber: 1, provider: "animeruka", serverId: "backup-c" }));
    expect(await screen.findByRole("combobox", { name: "Subtitles" })).toBeVisible();
  });
  it("uses the selected Ruka fallback from discovery instead of the server-list default", async () => {
    const rukaProviders = availableProviders.map((provider) => provider.id === "animeruka"
      ? { ...provider, selectedServerId: "backup-c" }
      : provider);
    const rukaResult: MediaResult = { ...result, provider: "animeruka", selectedServerId: "backup-c" };
    queueResponse("providers", providerDiscovery(1, rukaProviders, "animeruka"));
    queueResponse("servers", animeRukaServerList);
    queueResponse("media", rukaResult);
    const callbacks = { ...props(), sourceSelection: "animeruka" as const };
    render(<MediaPlayer {...callbacks} />);
    const origin = await screen.findByRole("combobox", { name: "AnimeRuka server" });
    await waitForProviderOptions();
    await waitFor(() => expect(origin).toHaveValue("backup-c"));

    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(endpointCalls("media")).toHaveLength(1));
    expect(endpointCalls("media")[0][1]?.body).toBe(JSON.stringify({ episodeNumber: 1, provider: "animeruka", serverId: "backup-c" }));
  });
  it("uses Auto's actual AnimeRuka fallback server and promotes a chosen server", async () => {
    const rukaProviders = availableProviders.map((provider) => provider.id === "animeruka"
      ? { ...provider, selectedServerId: "backup-c" }
      : provider);
    const rukaResult: MediaResult = { ...result, provider: "animeruka", selectedServerId: "backup-c" };
    const changedServerResult: MediaResult = { ...rukaResult, selectedServerId: "backup-a", video: { url: "/backup-a.mp4", type: "mp4" } };
    queueResponse("providers", providerDiscovery(1, rukaProviders, "animeruka"));
    queueResponse("servers", animeRukaServerList);
    queueResponse("media", rukaResult);
    queueResponse("media", changedServerResult);
    const callbacks = props();
    const { container } = render(<ControlledMediaPlayer callbacks={callbacks} />);
    const source = await waitForProviderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(endpointCalls("media")).toHaveLength(1));
    expect(endpointCalls("media")[0][1]?.body).toBe(JSON.stringify({ episodeNumber: 1 }));
    const origin = await screen.findByRole("combobox", { name: "AnimeRuka server" });
    await waitFor(() => expect(origin).toHaveValue("backup-c"));

    const video = container.querySelector("video")!;
    Object.defineProperty(video, "duration", { configurable: true, value: 100 });
    fireEvent.loadedMetadata(video);
    video.currentTime = 24;
    fireEvent.change(origin, { target: { value: "backup-a" } });
    await waitFor(() => expect(endpointCalls("media")).toHaveLength(2));
    expect(endpointCalls("media")[1][1]?.body).toBe(JSON.stringify({ episodeNumber: 1, provider: "animeruka", serverId: "backup-a" }));
    expect(endpointCalls("servers")).toHaveLength(1);
    expect(source).toHaveValue("animeruka");
  });
  it("flushes and resumes playback when the user switches AnimeRuka servers", async () => {
    const backupResult: MediaResult = { ...result, video: { url: "/backup-a.mp4", type: "mp4" } };
    queueResponse("servers", animeRukaServerList);
    queueResponse("media", result);
    queueResponse("media", backupResult);
    const callbacks = { ...props(), sourceSelection: "animeruka" as const };
    const { container } = render(<MediaPlayer {...callbacks} />);
    const origin = await screen.findByRole("combobox", { name: "AnimeRuka server" });
    await waitForProviderOptions();

    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(endpointCalls("media")).toHaveLength(1));
    expect(endpointCalls("media")[0][1]?.body).toBe(JSON.stringify({ episodeNumber: 1, provider: "animeruka", serverId: "main" }));
    await waitFor(() => expect(container.querySelector("video")?.getAttribute("src")).toBe("/fixture.mp4"));
    let video = container.querySelector("video")!;
    Object.defineProperty(video, "duration", { configurable: true, value: 100 });
    fireEvent.loadedMetadata(video);
    video.currentTime = 37;

    fireEvent.change(origin, { target: { value: "backup-a" } });
    await waitFor(() => expect(endpointCalls("media")).toHaveLength(2));
    expect(endpointCalls("media")[1][1]?.body).toBe(JSON.stringify({ episodeNumber: 1, provider: "animeruka", serverId: "backup-a" }));
    expect(callbacks.onPositionChange).toHaveBeenCalledWith(37, 100);
    await waitFor(() => expect(container.querySelector("video")?.getAttribute("src")).toBe("/backup-a.mp4"));
    video = container.querySelector("video")!;
    Object.defineProperty(video, "duration", { configurable: true, value: 100 });
    fireEvent.loadedMetadata(video);

    expect(video.currentTime).toBe(37);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  });
  it("loads new AnimeRuka servers for an episode and ignores the stale response", async () => {
    const episodeTwoServers: MediaServerList = { provider: "animeruka", defaultServerId: "episode-two-main", servers: [
      { id: "episode-two-main", label: "Episode two main" }, { id: "episode-two-backup", label: "Episode two backup" },
    ] };
    let finishEpisodeOne!: (response: Response) => void;
    queuePendingResponse("servers", new Promise((resolve) => { finishEpisodeOne = resolve; }));
    queueResponse("servers", episodeTwoServers);
    const callbacks = { ...props(), sourceSelection: "animeruka" as const };
    const { rerender } = render(<MediaPlayer {...callbacks} />);
    await waitFor(() => expect(endpointCalls("servers")).toHaveLength(1));
    const oldSignal = endpointCalls("servers")[0][1]?.signal;

    rerender(<MediaPlayer {...callbacks} episode={2} />);
    await waitFor(() => expect(endpointCalls("servers")).toHaveLength(2));
    expect(oldSignal?.aborted).toBe(true);
    expect(endpointCalls("servers")[1][0]).toBe("/api/anime/mal-1/media/servers?episodeNumber=2&provider=animeruka");
    const origin = await screen.findByRole("combobox", { name: "AnimeRuka server" });
    expect(origin).toHaveValue("episode-two-main");
    expect(Array.from(origin.querySelectorAll("option")).map(({ textContent }) => textContent)).toEqual(["Episode two main", "Episode two backup"]);

    await act(async () => finishEpisodeOne({ ok: true, json: async () => animeRukaServerList } as Response));
    expect(screen.getByRole("combobox", { name: "AnimeRuka server" })).toHaveValue("episode-two-main");
    expect(screen.queryByRole("option", { name: "Backup C" })).not.toBeInTheDocument();
  });
  it("keeps AnimeRuka servers available after the main server fails without silently switching", async () => {
    queueResponse("servers", animeRukaServerList);
    queueResponse("media", { error: { code: "unsupported_server" } }, false);
    queueResponse("media", { error: { code: "unsupported_server" } }, false);
    const callbacks = { ...props(), sourceSelection: "animeruka" as const };
    render(<MediaPlayer {...callbacks} />);
    const origin = await screen.findByRole("combobox", { name: "AnimeRuka server" });

    await waitForProviderOptions();
    await waitForProviderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This AnimeRuka server is not supported by Sabame yet");
    expect(endpointCalls("media")[0][1]?.body).toBe(JSON.stringify({ episodeNumber: 1, provider: "animeruka", serverId: "main" }));
    expect(endpointCalls("media")).toHaveLength(1);
    expect(origin).toHaveValue("main");
    expect(Array.from(origin.querySelectorAll("option")).map(({ textContent }) => textContent)).toEqual(["Main", "Backup A", "Backup B", "Backup C"]);

    fireEvent.change(origin, { target: { value: "backup-a" } });
    await waitFor(() => expect(endpointCalls("media")).toHaveLength(2));
    expect(endpointCalls("media")[1][1]?.body).toBe(JSON.stringify({ episodeNumber: 1, provider: "animeruka", serverId: "backup-a" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This AnimeRuka server is not supported by Sabame yet");
    expect(screen.getByRole("combobox", { name: "AnimeRuka server" })).toHaveValue("backup-a");
  });
  it("shows a discovery error when AnimeRuka servers cannot be loaded", async () => {
    queueResponse("servers", { error: { code: "provider_unavailable" } }, false);
    queueResponse("servers", animeRukaServerList);
    const callbacks = props();
    render(<ControlledMediaPlayer callbacks={callbacks} />);

    await waitForProviderOptions();
    fireEvent.change(screen.getByRole("combobox", { name: "Video source" }), { target: { value: "animeruka" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("AnimeRuka servers are temporarily unavailable");
    expect(screen.queryByRole("combobox", { name: "AnimeRuka server" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry server discovery" }));
    expect(await screen.findByRole("combobox", { name: "AnimeRuka server" })).toHaveValue("main");
    expect(endpointCalls("servers")).toHaveLength(2);
  });
  it("explains embedded Thai subtitles without offering Off or external-track timing claims", async () => {
    queueResponse("media", embeddedThaiResult);
    render(<MediaPlayer {...props()} />);

    await waitForProviderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));

    expect(await screen.findByText("Thai subtitles are embedded in this video and cannot be turned off.")).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Subtitles" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Off" })).not.toBeInTheDocument();
    expect(screen.queryByText("No Thai subtitle in the returned tracks.")).not.toBeInTheDocument();
    expect(screen.queryByText("Thai track returned for this episode. Timing is unverified.")).not.toBeInTheDocument();
    expect(screen.queryByText("External subtitle timing has not been verified against this video.")).not.toBeInTheDocument();
  });
  it("aborts an in-flight Auto request when switching to Anizone and ignores the stale result", async () => {
    const anizoneResult: MediaResult = { ...result, video: { url: "/anizone.mp4", type: "mp4" } };
    let finishAuto!: (response: Response) => void;
    queuePendingResponse("media", new Promise((resolve) => { finishAuto = resolve; }));
    queueResponse("media", anizoneResult);
    const callbacks = props();
    const { container } = render(<ControlledMediaPlayer callbacks={callbacks} />);

    await waitForProviderOptions();
    await waitForProviderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    const autoSignal = endpointCalls("media")[0][1]?.signal;
    expect(endpointCalls("media")[0][1]?.body).toBe(JSON.stringify({ episodeNumber: 1 }));
    fireEvent.change(screen.getByRole("combobox", { name: "Video source" }), { target: { value: "anizone" } });
    await waitFor(() => expect(endpointCalls("media")).toHaveLength(2));

    expect(autoSignal?.aborted).toBe(true);
    expect(endpointCalls("media")[1][1]?.body).toBe(JSON.stringify({ episodeNumber: 1, provider: "anizone" }));
    await waitFor(() => expect(container.querySelector("video")?.getAttribute("src")).toBe("/anizone.mp4"));
    await act(async () => finishAuto({ ok: true, json: async () => result } as Response));
    expect(container.querySelector("video")?.getAttribute("src")).toBe("/anizone.mp4");
  });
  it("re-resolves the active episode on source change and resumes at the saved position", async () => {
    const anizoneResult: MediaResult = { ...result, video: { url: "/anizone.mp4", type: "mp4" } };
    queueResponse("media", result);
    queueResponse("media", anizoneResult);
    const callbacks = props();
    const { container } = render(<ControlledMediaPlayer callbacks={callbacks} />);

    await waitForProviderOptions();
    await waitForProviderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    let video = container.querySelector("video")!;
    Object.defineProperty(video, "duration", { configurable: true, value: 100 });
    fireEvent.loadedMetadata(video);
    video.currentTime = 37;

    fireEvent.change(screen.getByRole("combobox", { name: "Video source" }), { target: { value: "anizone" } });
    await waitFor(() => expect(endpointCalls("media")).toHaveLength(2));
    expect(endpointCalls("media")[1][1]?.body).toBe(JSON.stringify({ episodeNumber: 1, provider: "anizone" }));
    expect(callbacks.onPositionChange).toHaveBeenCalledWith(37, 100);
    await waitFor(() => expect(container.querySelector("video")?.getAttribute("src")).toBe("/anizone.mp4"));
    video = container.querySelector("video")!;
    Object.defineProperty(video, "duration", { configurable: true, value: 100 });
    fireEvent.loadedMetadata(video);

    expect(video.currentTime).toBe(37);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
    expect(container.querySelector("video")).toBe(video);
  });
  it.each([
    ["Anizone", "anizone"],
    ["Anifume (Thai)", "anifume"],
  ] as const)("keeps the selected %s source when a keyed episode changes", async (_label, selection) => {
    const callbacks = props();
    const { rerender } = render(<ControlledMediaPlayer callbacks={callbacks} />);
    await waitForProviderOptions();
    fireEvent.change(screen.getByRole("combobox", { name: "Video source" }), { target: { value: selection } });

    rerender(<ControlledMediaPlayer callbacks={callbacks} episode={2} />);
    expect(screen.getByRole("combobox", { name: "Video source" })).toHaveValue(selection);
    await waitForProviderOptions();
    await waitForProviderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    await waitFor(() => expect(endpointCalls("media")).toHaveLength(1));
    const body = JSON.parse(String(endpointCalls("media")[0][1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ episodeNumber: 2, provider: selection });
  });
  it("does not complete a new episode when an old pending source ends", async () => {
    let complete!: (response: Response) => void;
    queuePendingResponse("media", new Promise((resolve) => { complete = resolve; }));
    const callbacks = props();
    const newComplete = vi.fn();
    const { rerender, container } = render(<MediaPlayer {...callbacks} />);
    await waitForProviderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
    rerender(<MediaPlayer {...callbacks} episode={2} onComplete={newComplete} />);
    await act(async () => complete({ ok: true, json: async () => result } as Response));
    expect(container.querySelector("video")).toBeNull();
    expect(callbacks.onComplete).not.toHaveBeenCalled();
    expect(newComplete).not.toHaveBeenCalled();
  });
  it("offers manual play after autoplay rejection and reports dead subtitle tracks", async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error("NotAllowedError"));
    const { container } = render(<MediaPlayer {...props()} />);
    await waitForProviderOptions();
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
