import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackerStore } from "@/features/tracker/store";
import { useCatalogAnime } from "./use-catalog";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const initial = trackerStore.getState();
const anime = { id: "mal-101", title: "Catalog title", subtitle: "", synopsis: "", genres: [], totalEpisodes: 12, episodeMinutes: 24, accent: "violet" };

beforeEach(() => {
  trackerStore.setState(initial, true);
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => { cleanup(); trackerStore.setState(initial, true); vi.unstubAllGlobals(); });

describe("catalog account ownership", () => {
  it("loads canonical metadata after bootstrap into the authenticated account", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(anime));
    const { result } = renderHook(() => useCatalogAnime(anime.id));
    expect(result.current.anime).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => {
      const version = trackerStore.getState().beginMalBootstrap();
      trackerStore.getState().activateMalAccount(version, true, { id: 42, name: "Viewer" });
      trackerStore.getState().finishMalBootstrap(version);
    });
    expect(result.current.anime?.title).toBe("Catalog title");
    expect(trackerStore.getState().malAccounts["42"].catalog[anime.id].title).toBe("Catalog title");
    expect(trackerStore.getState().demoCatalog[anime.id]).toBeUndefined();
  });
  it("ignores metadata started by a previous account even if the fetch ignores abort", async () => {
    let finish!: (value: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const version = trackerStore.getState().beginMalBootstrap();
    trackerStore.getState().activateMalAccount(version, true, { id: 42, name: "Viewer" });
    trackerStore.getState().finishMalBootstrap(version);
    renderHook(() => useCatalogAnime(anime.id));
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    act(() => {
      const nextVersion = trackerStore.getState().beginMalBootstrap();
      trackerStore.getState().activateMalAccount(nextVersion, true, { id: 99, name: "Other" });
    });
    await act(async () => { finish(Response.json(anime)); });
    expect(signal?.aborted).toBe(true);
    expect(trackerStore.getState().malAccounts["42"].catalog[anime.id]).toBeUndefined();
    expect(trackerStore.getState().malAccounts["99"].catalog[anime.id]).toBeUndefined();
    expect(trackerStore.getState().catalog[anime.id]).toBeUndefined();
  });
});
