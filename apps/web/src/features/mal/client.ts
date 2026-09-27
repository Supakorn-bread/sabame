"use client";

import type { StoreApi } from "zustand/vanilla";

import { setMalOperationListener, trackerStore, type TrackerStore } from "@/features/tracker/store";
import type {
  MalLibraryResponse,
  MalMutationRequest,
  MalMutationResponse,
  MalOperation,
  MalSessionResponse,
} from "./types";

interface ErrorResponse {
  error?: { code?: string; message?: string };
}

type MutationResponse = MalMutationResponse & { removed?: boolean };
export type MalFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const REQUEST_TIMEOUT_MS = 45_000;
const IMPORT_TIMEOUT_MS = 110_000;

function requestSignal(timeout = REQUEST_TIMEOUT_MS) {
  return AbortSignal.timeout(timeout);
}

export class MalClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MalClientError";
  }
}

async function responseJson<T>(response: Response): Promise<T> {
  try {
    return await response.json() as T;
  } catch {
    throw new MalClientError("The MAL service returned an unreadable response.", "invalid_response", response.status);
  }
}

function errorFromBody(response: Response, body: ErrorResponse = {}) {
  return new MalClientError(
    body.error?.message ?? "MyAnimeList could not complete this request.",
    body.error?.code ?? "mal_request_failed",
    response.status,
  );
}

async function apiError(response: Response) {
  try {
    return errorFromBody(response, await response.json() as ErrorResponse);
  } catch {
    return errorFromBody(response);
  }
}

function isMutationResponse(value: unknown): value is MutationResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const operation = (value as { operation?: unknown }).operation;
  return Boolean(operation && typeof operation === "object" && !Array.isArray(operation)
    && typeof (operation as { id?: unknown }).id === "string"
    && typeof (operation as { animeId?: unknown }).animeId === "string");
}

function syncError(store: StoreApi<TrackerStore>, error: unknown) {
  const message = error instanceof Error ? error.message : "MyAnimeList could not complete this request.";
  const reconnect = error instanceof MalClientError && (error.status === 401 || error.code === "reconnect_required");
  if (store.getState().malUser) store.getState().setMalSync(reconnect ? "reconnect" : "error", message);
  else store.setState((state) => ({
    malSync: { ...state.malSync, status: reconnect ? "reconnect" : "error", error: message },
  }));
}

function operationError(operation: MalOperation) {
  if (operation.error === "reconnect_required") return "Reconnect MyAnimeList to retry this change.";
  if (operation.error === "mal_unavailable") return "MyAnimeList is temporarily unavailable. Retry this change shortly.";
  return operation.error ?? "MyAnimeList could not sync this change.";
}

export interface MalAccountClient {
  initialize: () => Promise<void>;
  sync: () => Promise<void>;
  signOut: () => Promise<void>;
  resolveConflict: (animeId: string, resolution: "local" | "remote") => Promise<void>;
  retryChanges: () => Promise<void>;
  flush: () => Promise<void>;
}

export function createMalClient(options: {
  store?: StoreApi<TrackerStore>;
  fetch?: MalFetcher;
} = {}): MalAccountClient {
  const store = options.store ?? trackerStore;
  const fetcher: MalFetcher = options.fetch ?? ((input, init) => fetch(input, init));
  const accountTails = new Map<number, Promise<void>>();
  const flushes = new Map<number, Promise<void>>();
  const logouts = new Map<number, Promise<void>>();
  const loggingOut = new Set<number>();
  let requestEpoch = 0;

  const readLibraryPage = async (path: string) => {
    const signal = requestSignal();
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetcher(path, { cache: "no-store", signal });
      if (response.ok) return response;
      const error = await apiError(response);
      if (error.code !== "sync_busy" || attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt));
    }
  };

  const getLibrary = async (path: "/api/mal/list" | "/api/mal/import", userId?: number) => {
    const response = path.endsWith("/import") ? await fetcher(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedUserId: userId }),
      signal: requestSignal(IMPORT_TIMEOUT_MS),
    }) : await readLibraryPage(path);
    if (!response.ok) throw await apiError(response);
    const library = await responseJson<MalLibraryResponse>(response);
    const seen = new Set<string>();
    let cursor = library.nextCursor;
    // Keep the existing visible list until the entire snapshot has arrived.
    while (cursor) {
      if (typeof cursor !== "string" || cursor.length > 1024 || seen.has(cursor) || seen.size >= 10_000) {
        throw new MalClientError("The MAL service returned invalid pagination.", "invalid_response", 502);
      }
      seen.add(cursor);
      const next = await readLibraryPage(`/api/mal/list?cursor=${encodeURIComponent(cursor)}`);
      if (!next.ok) throw await apiError(next);
      const page = await responseJson<MalLibraryResponse>(next);
      if (page.user.id !== library.user.id || page.imported !== library.imported || page.lastSyncedAt !== library.lastSyncedAt) {
        throw new MalClientError("Your library changed while loading. Retry sync.", "library_changed", 409);
      }
      library.items.push(...page.items);
      library.operations.push(...page.operations);
      cursor = page.nextCursor;
    }
    delete library.nextCursor;
    return library;
  };

  const send = async (operation: MalOperation, resolution?: "local" | "remote", discardOperationIds: string[] = []) => {
    const before = store.getState();
    const userId = before.malUser?.id;
    const sessionVersion = before.malSessionVersion;
    if (!userId) return;
    const currentOperation = before.malSync.operations.find((candidate) => candidate.id === operation.id) ?? operation;
    const submitted = currentOperation.submitted
      ? currentOperation
      : before.rebasePendingMalOperation(userId, currentOperation.id) ?? currentOperation;
    const epoch = requestEpoch;
    const request: MalMutationRequest = {
      expectedUserId: userId,
      operationId: submitted.id,
      base: submitted.base,
      changes: submitted.changes,
      ...(resolution ? { resolution } : {}),
    };
    try {
      const response = await fetcher(`/api/mal/anime/${encodeURIComponent(operation.animeId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: requestSignal(),
      });
      const body = await responseJson<MutationResponse | ErrorResponse>(response);
      if (!response.ok && !(response.status === 409 && isMutationResponse(body))) {
        throw errorFromBody(response, body as ErrorResponse);
      }
      if (!isMutationResponse(body)) {
        throw new MalClientError("The MAL service returned an unreadable response.", "invalid_response", response.status);
      }
      const current = store.getState();
      if (epoch !== requestEpoch || current.malSessionVersion !== sessionVersion || current.malUser?.id !== userId) return;
      current.applyMalOperation(
        userId,
        submitted.id,
        body.operation,
        body.item,
        body.removed,
        resolution === "remote" ? discardOperationIds : [],
      );
    } catch (error) {
      const current = store.getState();
      if (epoch !== requestEpoch || current.malSessionVersion !== sessionVersion || current.malUser?.id !== userId) return;
      const reconnect = error instanceof MalClientError && (error.status === 401 || error.code === "reconnect_required");
      current.markFailedMalOperation(userId, submitted.id,
        error instanceof Error ? error.message : operationError(submitted), reconnect);
    }
  };

  const enqueue = (userId: number, work: () => Promise<void>) => {
    const previous = accountTails.get(userId) ?? Promise.resolve();
    const task = previous.catch(() => undefined).then(work);
    accountTails.set(userId, task);
    const cleanUp = () => {
      if (accountTails.get(userId) === task) accountTails.delete(userId);
    };
    void task.then(cleanUp, cleanUp);
    return task;
  };

  const drain = async (userId: number) => {
    while (!loggingOut.has(userId)) {
      const state = store.getState();
      if (state.malUser?.id !== userId) return;
      const blockedAnime = new Set<string>();
      let next: MalOperation | undefined;
      for (const operation of state.malSync.operations) {
        if (operation.state === "conflict" || operation.state === "failed") {
          blockedAnime.add(operation.animeId);
        } else if (operation.state === "pending" && !blockedAnime.has(operation.animeId)) {
          next = operation;
          break;
        }
      }
      if (!next) return;
      await send(next);
      const remaining = store.getState().malSync.operations.find((candidate) => candidate.id === next.id);
      if (remaining?.state === "pending") return;
    }
  };

  const flush = () => {
    const userId = store.getState().malUser?.id;
    if (!userId || loggingOut.has(userId)) return Promise.resolve();
    const active = flushes.get(userId);
    if (active) return active;
    const task = enqueue(userId, () => drain(userId));
    flushes.set(userId, task);
    const cleanUp = () => {
      if (flushes.get(userId) === task) flushes.delete(userId);
    };
    void task.then(cleanUp, cleanUp);
    return task;
  };

  const initialize = async () => {
    const version = store.getState().beginMalBootstrap();
    try {
      const response = await fetcher("/api/auth/session", { cache: "no-store", signal: requestSignal() });
      if (!response.ok) throw await apiError(response);
      const session = await responseJson<MalSessionResponse>(response);
      if (!store.getState().activateMalAccount(version, session.configured, session.user)) return;
      if (!session.user) return;
      const revision = store.getState().malRevision;
      let library = await getLibrary("/api/mal/list");
      if (!library.imported) library = await getLibrary("/api/mal/import", session.user.id);
      if (!store.getState().applyMalLibrary(version, library, revision)) return;
      await flush();
    } catch (error) {
      if (store.getState().malSessionVersion === version) syncError(store, error);
    } finally {
      store.getState().finishMalBootstrap(version);
    }
  };

  const sync = async () => {
    const before = store.getState();
    if (!before.malUser) return;
    const userId = before.malUser.id;
    const version = before.malSessionVersion;
    const revision = before.malRevision;
    before.setMalSync("syncing");
    try {
      await enqueue(userId, async () => {
        if (loggingOut.has(userId) || store.getState().malUser?.id !== userId) return;
        const library = await getLibrary("/api/mal/import", userId);
        store.getState().applyMalLibrary(version, library, revision);
        await drain(userId);
      });
    } catch (error) {
      if (store.getState().malSessionVersion === version) syncError(store, error);
    }
  };

  const signOut = async () => {
    const before = store.getState();
    const userId = before.malUser?.id;
    if (!userId) return;
    const active = logouts.get(userId);
    if (active) return active;
    const configured = before.malConfigured;
    const sessionVersion = before.malSessionVersion;
    loggingOut.add(userId);
    requestEpoch += 1;
    const task = (async () => {
      try {
        const response = await fetcher("/api/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          signal: requestSignal(),
        });
        if (!response.ok) throw await apiError(response);
        const current = store.getState();
        if (current.malSessionVersion === sessionVersion && current.malUser?.id === userId) {
          current.clearMalAccount(configured);
        }
      } finally {
        loggingOut.delete(userId);
      }
    })();
    logouts.set(userId, task);
    const cleanUp = () => {
      if (logouts.get(userId) === task) logouts.delete(userId);
    };
    void task.then(cleanUp, cleanUp);
    return task;
  };

  const resolveConflict = async (animeId: string, resolution: "local" | "remote") => {
    const candidates = store.getState().malSync.operations;
    const operation = candidates.find((candidate) =>
      candidate.animeId === animeId && (candidate.state === "conflict" || candidate.state === "failed"));
    if (!operation) return;
    const userId = store.getState().malUser?.id;
    if (!userId || loggingOut.has(userId)) return;
    const discardOperationIds = resolution === "remote"
      ? candidates.filter(candidate => candidate.animeId === animeId && candidate.state === "pending").map(candidate => candidate.id)
      : [];
    await enqueue(userId, () => send(operation, resolution, discardOperationIds));
    await flush();
  };

  const retryChanges = async () => {
    store.getState().retryFailedMalOperations();
    await flush();
  };

  return { initialize, sync, signOut, resolveConflict, retryChanges, flush };
}

const defaultClient = createMalClient();
setMalOperationListener(() => { void defaultClient.flush(); });

export function initializeMalAccount() {
  return defaultClient.initialize();
}

export function syncMalAccount() {
  return defaultClient.sync();
}

export function signOutMalAccount() {
  return defaultClient.signOut();
}

export function resolveMalConflict(animeId: string, resolution: "local" | "remote") {
  return defaultClient.resolveConflict(animeId, resolution);
}

export function retryMalChanges() {
  return defaultClient.retryChanges();
}
