import type {
  Anime,
  CredentialErrors,
  CredentialValidation,
  LibraryEntry,
  LibraryStatus,
} from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function validateDemoCredentials(email: string, password: string): CredentialValidation {
  const errors: CredentialErrors = {};

  if (!EMAIL_PATTERN.test(email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  if (password.length < 6) {
    errors.password = "Use at least 6 characters.";
  }

  return Object.keys(errors).length === 0
    ? { valid: true, errors: {} }
    : { valid: false, errors };
}

export function setWatchedEpisodes(
  entry: LibraryEntry,
  anime: Anime,
  watchedEpisodes: number,
  updatedAt: string,
): LibraryEntry {
  const watched = clamp(Math.floor(watchedEpisodes), 0, anime.totalEpisodes);
  const isComplete = watched === anime.totalEpisodes;

  return {
    ...entry,
    watchedEpisodes: watched,
    currentEpisode: isComplete ? anime.totalEpisodes : clamp(watched + 1, 1, anime.totalEpisodes),
    playbackSeconds: 0,
    status: isComplete ? "completed" : entry.status === "completed" ? "watching" : entry.status,
    updatedAt,
  };
}

export function setPlaybackPosition(
  entry: LibraryEntry,
  anime: Anime,
  playbackSeconds: number,
  updatedAt: string,
): LibraryEntry {
  return {
    ...entry,
    playbackSeconds: clamp(Math.floor(playbackSeconds), 0, anime.episodeMinutes * 60),
    updatedAt,
  };
}

export function selectEpisode(
  entry: LibraryEntry,
  anime: Anime,
  episode: number,
  updatedAt: string,
): LibraryEntry {
  return {
    ...entry,
    currentEpisode: clamp(Math.floor(episode), 1, anime.totalEpisodes),
    playbackSeconds: 0,
    status: "watching",
    updatedAt,
  };
}

export function completeEpisode(entry: LibraryEntry, anime: Anime, updatedAt: string): LibraryEntry {
  const watchedEpisodes = clamp(
    Math.max(entry.watchedEpisodes, entry.currentEpisode),
    0,
    anime.totalEpisodes,
  );
  const completed = watchedEpisodes === anime.totalEpisodes;

  return {
    ...entry,
    watchedEpisodes,
    currentEpisode: completed ? anime.totalEpisodes : watchedEpisodes + 1,
    playbackSeconds: 0,
    status: completed ? "completed" : "watching",
    updatedAt,
  };
}

export function setLibraryStatus(
  entry: LibraryEntry,
  status: LibraryStatus,
  updatedAt: string,
): LibraryEntry {
  return { ...entry, status, updatedAt };
}
