import "server-only";
import type { MalLibraryItem, MalListStatus, MalUser } from "../types";
import { MalError } from "./config";

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MalError("invalid_mal_response");
  return value as Record<string, unknown>;
}
const integer = (value: unknown, max: number) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max;

export function listStatus(value: unknown): MalListStatus {
  const item = object(value);
  if (!["watching", "completed", "on_hold", "dropped", "plan_to_watch"].includes(String(item.status)) || !integer(item.num_episodes_watched, 10_000) || !integer(item.score, 10) || typeof item.is_rewatching !== "boolean" || typeof item.updated_at !== "string" || !Number.isFinite(Date.parse(item.updated_at))) throw new MalError("invalid_mal_response");
  return { status: item.status as MalListStatus["status"], num_episodes_watched: item.num_episodes_watched as number, score: item.score as number, is_rewatching: item.is_rewatching, updated_at: item.updated_at };
}
export function malUser(value: unknown): MalUser {
  const item = object(value);
  if (!integer(item.id, Number.MAX_SAFE_INTEGER) || item.id === 0 || typeof item.name !== "string" || !item.name.length || item.name.length > 100) throw new MalError("invalid_mal_response");
  return { id: item.id as number, name: item.name, ...(typeof item.picture === "string" && item.picture.startsWith("https://cdn.myanimelist.net/") ? { picture: item.picture } : {}) };
}
export function libraryItem(node: unknown, status: MalListStatus): MalLibraryItem {
  const item = object(node);
  if (!integer(item.id, 99_999_999) || item.id === 0 || typeof item.title !== "string" || !item.title.length || !integer(item.num_episodes, 10_000)) throw new MalError("invalid_mal_response");
  const animeId = `mal-${item.id}`;
  const totalEpisodes = item.num_episodes === 0 ? null : item.num_episodes as number;
  const pictures = item.main_picture && typeof item.main_picture === "object" ? item.main_picture as Record<string, unknown> : {};
  const largePicture = typeof pictures.large === "string" && pictures.large.startsWith("https://cdn.myanimelist.net/") ? pictures.large : undefined;
  const mediumPicture = typeof pictures.medium === "string" && pictures.medium.startsWith("https://cdn.myanimelist.net/") ? pictures.medium : undefined;
  const cover = largePicture ?? mediumPicture;
  const duration = typeof item.average_episode_duration === "number" && Number.isFinite(item.average_episode_duration) ? Math.max(0, Math.min(1440, Math.round(item.average_episode_duration / 60))) : 0;
  return {
    anime: { id: animeId, title: item.title.slice(0, 300), subtitle: "", synopsis: typeof item.synopsis === "string" ? item.synopsis.slice(0, 10_000) : "", genres: Array.isArray(item.genres) ? item.genres.flatMap(value => value && typeof value.name === "string" ? [value.name] : []).slice(0, 20) : [], totalEpisodes, episodeMinutes: duration, accent: "violet", ...(typeof item.mean === "number" ? { score: String(item.mean) } : {}), ...(cover ? { coverUrl: cover } : {}), ...(largePicture ? { heroUrl: largePicture } : {}) },
    entry: { animeId, status: status.status === "plan_to_watch" ? "planned" : status.status, watchedEpisodes: status.num_episodes_watched, currentEpisode: Math.max(1, Math.min(status.num_episodes_watched + 1, totalEpisodes ?? 10_000)), playbackSeconds: 0, personalScore: status.score, isRewatching: status.is_rewatching, updatedAt: status.updated_at },
    remote: status,
  };
}
