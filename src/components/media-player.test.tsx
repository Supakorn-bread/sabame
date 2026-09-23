import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaPlayer } from "./media-player";
import type { MediaResult } from "@/features/media/types";

const result: MediaResult = { provider: "fixture", video: { url: "/fixture.mp4", type: "mp4" },
  metadata: { animeId: "mal-1", episodeNumber: 1 }, thaiStatus: "present", selectionReason: "thai_subtitle",
  subtitles: [{ language: "th", label: "Thai", url: "/thai.vtt", format: "vtt", default: true, availability: "available", displaySupported: true, syncStatus: "unverified" }] };
const props = () => ({ animeId: "mal-1", title: "Test anime", episode: 1, initialPosition: 10, onPositionChange: vi.fn(), onComplete: vi.fn() });
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => result }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("real media player", () => {
  it("resolves only on Play, restores position from actual duration, and selects Thai or Off", async () => {
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
    fireEvent.ended(video); expect(callbacks.onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Mark episode complete" }));
    expect(callbacks.onComplete).toHaveBeenCalledOnce();
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
    ["provider_unavailable", "The video provider is temporarily unavailable"],
    ["timeout", "Finding a source took too long"],
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
