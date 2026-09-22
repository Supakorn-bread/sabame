export type LibraryStatus = "watching" | "planned" | "completed" | "on_hold" | "dropped";

export type AnimeAccent = "violet" | "cyan" | "rose" | "amber" | "indigo" | "emerald";

export interface Anime {
  id: string;
  title: string;
  subtitle: string;
  synopsis: string;
  genres: string[];
  totalEpisodes: number | null;
  episodeMinutes: number;
  accent: AnimeAccent;
  coverUrl?: string;
  heroUrl?: string;
  score?: string;
}

export interface LibraryEntry {
  animeId: string;
  status: LibraryStatus;
  watchedEpisodes: number;
  currentEpisode: number;
  playbackSeconds: number;
  playbackDurationSeconds?: number;
  personalScore?: number;
  isRewatching?: boolean;
  updatedAt: string;
}

export interface DemoSession {
  email?: string;
  displayName: string;
  loginAt: string;
  malUserId?: number;
  username?: string;
  picture?: string;
}

export interface CredentialErrors {
  email?: string;
  password?: string;
}

export type CredentialValidation =
  | { valid: true; errors: Record<string, never> }
  | { valid: false; errors: CredentialErrors };
