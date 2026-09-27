"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ANIME_CATALOG, getAnimeById } from "@/features/tracker/seed";
import { useTrackerStore } from "@/features/tracker/store";
import type { Anime } from "@/features/tracker/types";

export function useCatalogSearch(query: string) {
  const malUser = useTrackerStore((state) => state.malUser);
  const catalog = useTrackerStore((state) => state.catalog);
  const key = query.trim().toLowerCase();
  const [attempt, setAttempt] = useState(0);
  const [remote, setRemote] = useState<{ key: string; results: Anime[]; error: boolean }>({ key: "", results: [], error: false });
  useEffect(() => {
    if (key.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/anime/search?q=${encodeURIComponent(key)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("catalog_unavailable");
        const data = await response.json();
        if (!controller.signal.aborted) setRemote({ key, results: Array.isArray(data.results) ? data.results : [], error: false });
      } catch { if (!controller.signal.aborted) setRemote({ key, results: [], error: true }); }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, attempt]);
  const localCatalog = malUser ? Object.values(catalog) : ANIME_CATALOG;
  const local = key ? localCatalog.filter((anime) => `${anime.title} ${anime.subtitle} ${anime.genres.join(" ")}`.toLowerCase().includes(key)) : [];
  // Once the remote catalog responds, put its MAL-wide matches first. Account
  // entries remain useful local fallbacks and are appended without duplicates.
  const ordered = remote.key === key ? [...remote.results, ...local] : local;
  const results = new Map(ordered.map((anime) => [anime.id, anime]));
  function retry() {
    setRemote({ key: "", results: [], error: false });
    setAttempt((value) => value + 1);
  }
  return { results: [...results.values()].slice(0, 20), error: remote.key === key && remote.error, loading: key.length >= 2 && remote.key !== key, retry };
}
export function useCatalogAnime(animeId: string) {
  const router = useRouter();
  const seed = getAnimeById(animeId);
  const saved = useTrackerStore((state) => state.catalog[animeId]);
  const register = useTrackerStore((state) => state.registerAnime);
  const [artwork, setArtwork] = useState<{ id: string; coverUrl: string } | null>(null);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/anime/${encodeURIComponent(animeId)}`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("catalog_unavailable");
      const anime: Anime = await response.json();
      if (!controller.signal.aborted) {
        if (seed) {
          if (anime.id === animeId && anime.coverUrl?.startsWith("https://cdn.myanimelist.net/images/anime/")) setArtwork({ id: animeId, coverUrl: anime.coverUrl });
        } else if (anime.id !== animeId) router.replace(`/watch/${encodeURIComponent(anime.id)}`);
        else register(anime);
      }
    }).catch(() => { if (!controller.signal.aborted) setFailure(animeId); });
    return () => controller.abort();
  }, [animeId, seed, register, router]);
  const anime = seed && artwork?.id === animeId ? { ...seed, coverUrl: artwork.coverUrl, heroUrl: undefined } : seed ?? saved;
  return { anime, error: failure === animeId };
}
export function useCatalogEpisodes(animeId: string, enabled: boolean) {
  const [result, setResult] = useState<{ id: string; numbers: number[] }>({ id: "", numbers: [] });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch(`/api/anime/${encodeURIComponent(animeId)}/episodes`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json();
      if (!controller.signal.aborted && Array.isArray(data.episodes)) {
        const numbers = data.episodes.map((item: { number?: unknown }) => item.number).filter((number: unknown): number is number => typeof number === "number" && Number.isSafeInteger(number) && number > 0 && number <= 10_000);
        setResult({ id: animeId, numbers: [...new Set<number>(numbers)].sort((a, b) => a - b).slice(0, 2000) });
      }
    }).catch(() => {});
    return () => controller.abort();
  }, [animeId, enabled]);
  return result.id === animeId ? result.numbers : [];
}
