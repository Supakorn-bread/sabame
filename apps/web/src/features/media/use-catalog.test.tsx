import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
import { useCatalogAnime, useCatalogSearch } from "./use-catalog";
import { trackerStore } from "@/features/tracker/store";
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("remote catalog search", () => {
  it("can retry a failed search without changing the query", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useCatalogSearch("Cowboy"));
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(result.current.error).toBe(true);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ results: [{ id: "mal-1", title: "Cowboy Bebop" }] }));
    act(() => result.current.retry());
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(result.current.results.map(item => item.id)).toEqual(["mal-1"]);
    expect(result.current.loading).toBe(false);
  });
  it("keeps canonical account entries in local search instead of demo aliases", () => {
    const previous = trackerStore.getState();
    trackerStore.setState({ malUser: { id: 42, name: "Viewer" }, catalog: { "mal-42310": { id: "mal-42310", title: "Cyberpunk: Edgerunners", subtitle: "", synopsis: "", genres: [], totalEpisodes: 10, episodeMinutes: 24, accent: "violet" } } });
    const { result, unmount } = renderHook(() => useCatalogSearch("Cyberpunk"));
    expect(result.current.results.map(item => item.id)).toEqual(["mal-42310"]);
    unmount();
    trackerStore.setState({ malUser: previous.malUser, catalog: previous.catalog });
  });
  it("puts MAL-wide remote matches before account-only matches", async () => {
    const previous = trackerStore.getState();
    trackerStore.setState({ malUser: { id: 42, name: "Viewer" }, catalog: { "mal-2": { id: "mal-2", title: "Naruto", subtitle: "", synopsis: "", genres: [], totalEpisodes: 220, episodeMinutes: 23, accent: "violet" } } });
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ results: [{ id: "mal-1", title: "Naruto Shippuden", subtitle: "", synopsis: "", genres: [], totalEpisodes: 500, episodeMinutes: 23, accent: "violet" }] }));
    const { result } = renderHook(() => useCatalogSearch("Naruto"));
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(result.current.results.map(item => item.id).slice(0, 2)).toEqual(["mal-1", "mal-2"]);
    trackerStore.setState({ malUser: previous.malUser, catalog: previous.catalog });
  });
  it("refreshes seed artwork from fetched metadata without replacing tracker episode counts", async () => {
    const coverUrl = "https://cdn.myanimelist.net/images/anime/fresh.jpg";
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ id: "skyward-bloom", coverUrl, totalEpisodes: 99 }) } as Response);
    const { result } = renderHook(() => useCatalogAnime("skyward-bloom"));
    expect(result.current.anime?.coverUrl).toContain("cdn.myanimelist.net");
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(result.current.anime).toMatchObject({ coverUrl, totalEpisodes: 28, heroUrl: undefined });
  });
  it("keeps the real poster snapshot when metadata is unavailable", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useCatalogAnime("skyward-bloom"));
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(result.current.anime?.coverUrl).toBe("https://cdn.myanimelist.net/images/anime/1015/138006l.jpg");
  });
  it("keeps local results available when the remote API fails", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useCatalogSearch("Cyberpunk"));
    expect(result.current.results[0].id).toBe("neon-requiem");
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(result.current.error).toBe(true);
    expect(result.current.results[0].id).toBe("neon-requiem");
  });
  it("debounces queries, aborts stale searches and does not duplicate seed hits", async () => {
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const { result, rerender } = renderHook(({ query }) => useCatalogSearch(query), { initialProps: { query: "Frieren" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    const firstSignal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ id: "neon-requiem", title: "Duplicate" }] }) } as Response);
    rerender({ query: "Cyberpunk" });
    expect(firstSignal?.aborted).toBe(true);
    await act(async () => { finish({ ok: true, json: async () => ({ results: [{ id: "mal-1", title: "Stale" }] }) } as Response); await vi.advanceTimersByTimeAsync(350); });
    expect(result.current.results.map((item) => item.id)).toEqual(["neon-requiem"]);
  });
});
