import type { Anime, LibraryEntry, LibraryStatus } from "./tracker.js";

export interface MalUser { id: number; name: string; picture?: string }
export interface MalListStatus {
  status: "watching" | "completed" | "on_hold" | "dropped" | "plan_to_watch";
  num_episodes_watched: number;
  score: number;
  is_rewatching: boolean;
  updated_at: string;
}
export interface MalLibraryItem { anime: Anime; entry: LibraryEntry; remote: MalListStatus }
export interface MalChanges { watchedEpisodes?: number; status?: LibraryStatus }
export interface MalOperation {
  id: string;
  animeId: string;
  changes: MalChanges;
  base: MalListStatus | null;
  state: "pending" | "conflict" | "failed" | "synced";
  remote?: MalListStatus | null;
  error?: string;
  /** Browser outbox metadata: once submitted, the baseline must stay stable on retries. */
  submitted?: boolean;
}
export interface MalLibraryResponse {
  /** Opaque, account-scoped continuation. Apply the snapshot only after all pages arrive. */
  nextCursor?: string;
  user: MalUser;
  items: MalLibraryItem[];
  operations: MalOperation[];
  imported: boolean;
  lastSyncedAt: string | null;
}
export interface MalSessionResponse { configured: boolean; user: MalUser | null }
export interface MalMutationRequest {
  expectedUserId: number;
  operationId: string;
  base: MalListStatus | null;
  changes: MalChanges;
  resolution?: "local" | "remote";
}
export interface MalMutationResponse { operation: MalOperation; item?: MalLibraryItem; removed?: boolean }
