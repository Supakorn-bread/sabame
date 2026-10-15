import type { StateStorage } from "zustand/middleware";
import { describe, expect, it, vi } from "vitest";

import { createTrackerStore } from "@/features/tracker/store";
import { getTrackedLibrary } from "@/features/tracker/selectors";
import type { MalLibraryItem, MalLibraryResponse, MalListStatus, MalMutationRequest, MalOperation, MalUser } from "./types";
import { createMalClient, type MalFetcher } from "./client";

const user: MalUser = { id: 7, name: "Mizuki" };
const updatedAt = "2026-09-22T08:00:00.000Z";

function remote(watchedEpisodes: number): MalListStatus {
  return {
    status: watchedEpisodes > 0 ? "watching" : "plan_to_watch",
    num_episodes_watched: watchedEpisodes,
    score: 0,
    is_rewatching: false,
    updated_at: updatedAt,
  };
}

function item(animeId: string, watchedEpisodes = 0): MalLibraryItem {
  return {
    anime: {
      id: animeId,
      title: `Anime ${animeId}`,
      subtitle: "",
      synopsis: "",
      genres: [],
      totalEpisodes: 12,
      episodeMinutes: 24,
      accent: "violet",
    },
    entry: {
      animeId,
      status: watchedEpisodes > 0 ? "watching" : "planned",
      watchedEpisodes,
      currentEpisode: watchedEpisodes + 1,
      playbackSeconds: 0,
      updatedAt,
    },
    remote: remote(watchedEpisodes),
  };
}

function library(
  items: MalLibraryItem[],
  operations: MalOperation[] = [],
  imported = true,
  account = user,
): MalLibraryResponse {
  return { user: account, items, operations, imported, lastSyncedAt: updatedAt };
}

function memoryStorage() {
  const values = new Map<string, string>();
  const storage: StateStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
  return { storage, values };
}

function activeStore(animeIds = ["mal-100"]) {
  let nextId = 1;
  const { storage, values } = memoryStorage();
  const store = createTrackerStore({
    storage,
    createOperationId: () => `operation-${String(nextId++).padStart(8, "0")}`,
    onMalOperation: () => undefined,
  });
  const version = store.getState().beginMalBootstrap();
  store.getState().activateMalAccount(version, true, user);
  store.getState().applyMalLibrary(version, library(animeIds.map((animeId) => item(animeId))), 0);
  store.getState().finishMalBootstrap(version);
  return { store, values };
}

function mutationBody(init?: RequestInit) {
  return JSON.parse(String(init?.body)) as MalMutationRequest;
}

describe("paginated MAL libraries", () => {
  it("retries a busy read page without repeating the import", async () => {
    const { store } = activeStore();
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ ...library([item("mal-100")]), nextCursor: "next-page" }))
      .mockResolvedValueOnce(Response.json({ error: { code: "sync_busy" } }, { status: 409 }))
      .mockResolvedValueOnce(Response.json(library([item("mal-200")])));
    await createMalClient({ store, fetch: fetcher }).sync();
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual(["/api/mal/import", "/api/mal/list?cursor=next-page", "/api/mal/list?cursor=next-page"]);
    expect(Object.keys(store.getState().library).sort()).toEqual(["mal-100", "mal-200"]);
  });

  it("bounds busy-page retries and preserves the visible library", async () => {
    const { store } = activeStore(["mal-999"]);
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ ...library([]), nextCursor: "next-page" }))
      .mockImplementation(async () => Response.json({ error: { code: "sync_busy" } }, { status: 409 }));
    await createMalClient({ store, fetch: fetcher }).sync();
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(Object.keys(store.getState().library)).toEqual(["mal-999"]);
  });

  it("assembles every page before applying the imported snapshot", async () => {
    const { store } = activeStore(["mal-999"]);
    store.getState().setPlaybackPosition("mal-999", 123, 1440, 1);
    const fetcher: MalFetcher = vi.fn().mockResolvedValueOnce(Response.json({ ...library([item("mal-100")]), nextCursor: "next-page" }))
      .mockResolvedValueOnce(Response.json(library([item("mal-200")])));
    await createMalClient({ store, fetch: fetcher }).sync();
    expect(fetcher).toHaveBeenCalledWith("/api/mal/list?cursor=next-page", expect.objectContaining({ cache: "no-store" }));
    expect(Object.keys(getTrackedLibrary(store.getState())).sort()).toEqual(["mal-100", "mal-200"]);
    expect(store.getState().library["mal-999"].playbackSeconds).toBe(123);
  });
  it("preserves the previous visible snapshot if a later page fails", async () => {
    const { store } = activeStore(["mal-999"]);
    store.getState().setPlaybackPosition("mal-999", 123, 1440, 1);
    const fetcher: MalFetcher = vi.fn().mockResolvedValueOnce(Response.json({ ...library([item("mal-100")]), nextCursor: "next-page" }))
      .mockResolvedValueOnce(Response.json({ error: { code: "library_changed", message: "Retry sync" } }, { status: 409 }));
    await createMalClient({ store, fetch: fetcher }).sync();
    expect(Object.keys(store.getState().library)).toEqual(["mal-999"]);
    expect(store.getState().malSync.status).toBe("error");
  });
});

function mutationSuccess(animeId: string, request: MalMutationRequest) {
  const watchedEpisodes = request.changes.watchedEpisodes ?? 0;
  return Response.json({
    operation: {
      id: request.operationId,
      animeId,
      changes: request.changes,
      base: request.base,
      state: "synced",
      remote: remote(watchedEpisodes),
    },
    item: item(animeId, watchedEpisodes),
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("MAL account client", () => {
  it("imports the remote list on first sign-in", async () => {
    const { storage } = memoryStorage();
    const store = createTrackerStore({ storage, onMalOperation: () => undefined });
    const fetcher = vi.fn<MalFetcher>(async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const path = String(input);
      if (path === "/api/auth/session") return Response.json({ configured: true, user });
      if (path === "/api/mal/list") return Response.json(library([], [], false));
      if (path === "/api/mal/import") return Response.json(library([item("mal-100", 4)]));
      throw new Error(`Unexpected request: ${path}`);
    });

    await createMalClient({ store, fetch: fetcher }).initialize();

    expect(fetcher.mock.calls.map(([input]) => String(input))).toEqual([
      "/api/auth/session", "/api/mal/list", "/api/mal/import",
    ]);
    expect(fetcher.mock.calls[2][1]?.method).toBe("POST");
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({ expectedUserId: user.id });
    expect(store.getState().library["mal-100"].watchedEpisodes).toBe(4);
  });

  it("refreshes MAL on Sync now and preserves the pending intent's original baseline", async () => {
    const { store } = activeStore();
    store.getState().setWatchedEpisodes("mal-100", 3);
    const requests: MalMutationRequest[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/mal/import") return Response.json(library([item("mal-100", 2)]));
      if (path === "/api/mal/anime/mal-100") {
        const request = mutationBody(init);
        requests.push(request);
        return mutationSuccess("mal-100", request);
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    await createMalClient({ store, fetch: fetcher }).sync();

    expect(fetcher.mock.calls[0][0]).toBe("/api/mal/import");
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ expectedUserId: user.id });
    expect(requests[0].changes).toEqual({ watchedEpisodes: 3 });
    expect(requests[0].base).toEqual(remote(0));
    expect(store.getState().library["mal-100"].watchedEpisodes).toBe(3);
  });

  it("records a failed server operation once without recursively resubmitting it", async () => {
    const { store } = activeStore();
    store.getState().setWatchedEpisodes("mal-100", 2);
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = mutationBody(init);
      return Response.json({
        operation: {
          id: request.operationId,
          animeId: "mal-100",
          changes: request.changes,
          base: request.base,
          state: "failed",
          error: "mal_unavailable",
        },
      });
    });

    await createMalClient({ store, fetch: fetcher }).flush();

    expect(fetcher).toHaveBeenCalledOnce();
    expect(store.getState().malSync.operations[0]).toMatchObject({
      state: "failed", error: "mal_unavailable", submitted: true,
    });
  });

  it("treats an error-shaped 409 as a failure and retries the exact submitted request", async () => {
    const { store } = activeStore();
    store.getState().setWatchedEpisodes("mal-100", 2);
    const requests: MalMutationRequest[] = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = mutationBody(init);
      requests.push(request);
      if (requests.length === 1) {
        return Response.json({ error: { code: "sync_busy", message: "Another sync is running." } }, { status: 409 });
      }
      return mutationSuccess("mal-100", request);
    });
    const client = createMalClient({ store, fetch: fetcher });

    await client.flush();
    expect(store.getState().malSync.operations[0]).toMatchObject({
      state: "failed", error: "Another sync is running.", submitted: true,
    });

    await client.retryChanges();

    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(store.getState().malSync.operations[0].state).toBe("synced");
  });

  it("serializes mutations across different titles for the account", async () => {
    const { store } = activeStore(["mal-100", "mal-200"]);
    store.getState().setWatchedEpisodes("mal-100", 1);
    store.getState().setWatchedEpisodes("mal-200", 2);
    const first = deferred<Response>();
    const second = deferred<Response>();
    const calls: Array<{ path: string; request: MalMutationRequest }> = [];
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ path: String(input), request: mutationBody(init) });
      return calls.length === 1 ? first.promise : second.promise;
    });
    const pending = createMalClient({ store, fetch: fetcher }).flush();

    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].path).toBe("/api/mal/anime/mal-100");
    first.resolve(mutationSuccess("mal-100", calls[0].request));
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].path).toBe("/api/mal/anime/mal-200");
    second.resolve(mutationSuccess("mal-200", calls[1].request));
    await pending;
  });

  it("blocks later edits for a conflicted title while continuing other titles", async () => {
    const { store } = activeStore(["mal-100", "mal-200"]);
    store.getState().setWatchedEpisodes("mal-100", 1);
    store.getState().setWatchedEpisodes("mal-100", 2);
    store.getState().setWatchedEpisodes("mal-200", 3);
    const sentIds: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = mutationBody(init);
      sentIds.push(request.operationId);
      const animeId = String(input).endsWith("mal-100") ? "mal-100" : "mal-200";
      if (request.operationId === "operation-00000001") {
        return Response.json({
          operation: {
            id: request.operationId,
            animeId,
            changes: request.changes,
            base: request.base,
            state: "conflict",
            remote: remote(4),
          },
        }, { status: 409 });
      }
      return mutationSuccess(animeId, request);
    });

    await createMalClient({ store, fetch: fetcher }).flush();

    expect(sentIds).toEqual(["operation-00000001", "operation-00000003"]);
    expect(store.getState().malSync.operations.map(({ id, state }) => ({ id, state }))).toEqual([
      { id: "operation-00000001", state: "conflict" },
      { id: "operation-00000002", state: "pending" },
      { id: "operation-00000003", state: "synced" },
    ]);
  });

  it("ignores a mutation response once logout starts and clears only after successful revocation", async () => {
    const { store } = activeStore();
    store.getState().setWatchedEpisodes("mal-100", 2);
    const mutation = deferred<Response>();
    let logoutAttempt = 0;
    let submittedRequest: MalMutationRequest | undefined;
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.includes("/api/mal/anime/")) {
        submittedRequest = mutationBody(init);
        return mutation.promise;
      }
      logoutAttempt += 1;
      return Promise.resolve(logoutAttempt === 1
        ? Response.json({ error: { code: "mal_unavailable", message: "Try again." } }, { status: 503 })
        : Response.json({ success: true }));
    });
    const client = createMalClient({ store, fetch: fetcher });
    const flushing = client.flush();
    await vi.waitFor(() => expect(submittedRequest).toBeDefined());

    const failedLogout = client.signOut();
    mutation.resolve(mutationSuccess("mal-100", submittedRequest!));
    await flushing;
    await expect(failedLogout).rejects.toMatchObject({ code: "mal_unavailable" });

    expect(store.getState().malUser?.id).toBe(user.id);
    expect(store.getState().malSync.operations[0]).toMatchObject({ state: "pending", submitted: true });

    await client.signOut();
    expect(store.getState().malUser).toBeNull();
  });

  it("does not let an old account's response update a newly activated account", async () => {
    const { store } = activeStore();
    store.getState().setWatchedEpisodes("mal-100", 2);
    const mutation = deferred<Response>();
    let submittedRequest: MalMutationRequest | undefined;
    const client = createMalClient({
      store,
      fetch: (_input, init) => {
        submittedRequest = mutationBody(init);
        return mutation.promise;
      },
    });
    const flushing = client.flush();
    await vi.waitFor(() => expect(submittedRequest).toBeDefined());

    store.getState().clearMalAccount(true);
    const secondUser = { id: 8, name: "Hana" };
    const version = store.getState().beginMalBootstrap();
    store.getState().activateMalAccount(version, true, secondUser);
    store.getState().applyMalLibrary(version, library([item("mal-200", 5)], [], true, secondUser));
    mutation.resolve(mutationSuccess("mal-100", submittedRequest!));
    await flushing;

    expect(store.getState().malUser).toEqual(secondUser);
    expect(store.getState().library).toEqual(expect.objectContaining({
      "mal-200": expect.objectContaining({ watchedEpisodes: 5 }),
    }));
    expect(store.getState().library["mal-100"]).toBeUndefined();
  });

  it("persists no OAuth credentials from oversized API payloads", async () => {
    const { storage, values } = memoryStorage();
    const store = createTrackerStore({ storage, onMalOperation: () => undefined });
    const unsafeUser = { ...user, accessToken: "access-secret", refreshToken: "refresh-secret" };
    const unsafeItem = { ...item("mal-100"), accessToken: "nested-secret" };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/auth/session") return Response.json({ configured: true, user: unsafeUser });
      return Response.json(library([unsafeItem], [], true, unsafeUser));
    });

    await createMalClient({ store, fetch: fetcher }).initialize();

    const persisted = [...values.values()].join("\n");
    expect(persisted).not.toContain("access-secret");
    expect(persisted).not.toContain("refresh-secret");
    expect(persisted).not.toContain("nested-secret");
  });
});

function changedPayload(value: unknown, path: string, replacement: unknown, remove = false): unknown {
  const payload = structuredClone(value) as Record<string, unknown>;
  const keys = path.split(".");
  let parent = payload;
  for (const key of keys.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
  if (remove) delete parent[keys.at(-1)!];
  else parent[keys.at(-1)!] = replacement;
  return payload;
}

describe("MAL response validation", () => {
  it.each([
    ["configured", undefined, true],
    ["configured", "true"],
    ["user", undefined, true],
    ["user", []],
    ["user.id", 0],
    ["user.id", 1.5],
    ["user.id", Number.MAX_SAFE_INTEGER + 1],
    ["user.name", undefined, true],
    ["user.name", ""],
    ["user.name", "x".repeat(101)],
    ["user.picture", 1],
  ])("keeps the current account when session field %s is invalid (%s)", async (path, replacement, remove = false) => {
    const { store } = activeStore();
    const fetcher = vi.fn().mockResolvedValue(Response.json(
      changedPayload({ configured: true, user }, path as string, replacement, remove === true),
    ));

    await createMalClient({ store, fetch: fetcher }).initialize();

    expect(store.getState().malUser).toEqual(user);
    expect(store.getState().malSync.status).toBe("error");
    expect(Object.keys(store.getState().library)).toEqual(["mal-100"]);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  const invalidLibraryFields: Array<[string, unknown, boolean?]> = [
    ["user", null], ["items", null], ["operations", {}], ["imported", "yes"],
    ["lastSyncedAt", undefined, true], ["lastSyncedAt", "yesterday"],
    ["nextCursor", 42], ["nextCursor", ""], ["nextCursor", "x".repeat(1025)],
    ...["id", "title", "subtitle", "synopsis", "genres", "totalEpisodes", "episodeMinutes", "accent"]
      .map((field): [string, unknown, boolean] => [`items.0.anime.${field}`, undefined, true]),
    ["items.0.anime.id", "mal-0"], ["items.0.anime.id", "mal-100000000"],
    ["items.0.anime.title", ""], ["items.0.anime.title", "x".repeat(301)],
    ["items.0.anime.synopsis", "x".repeat(10001)], ["items.0.anime.genres", [1]],
    ["items.0.anime.totalEpisodes", 0], ["items.0.anime.totalEpisodes", 10001],
    ["items.0.anime.episodeMinutes", -1], ["items.0.anime.episodeMinutes", 1441],
    ["items.0.anime.accent", "orange"], ["items.0.anime.coverUrl", 42],
    ["items.0.anime.heroUrl", []], ["items.0.anime.score", 8],
    ...["animeId", "status", "watchedEpisodes", "currentEpisode", "playbackSeconds", "updatedAt"]
      .map((field): [string, unknown, boolean] => [`items.0.entry.${field}`, undefined, true]),
    ["items.0.entry.animeId", "mal-300"], ["items.0.entry.status", "plan_to_watch"],
    ["items.0.entry.watchedEpisodes", 1.5], ["items.0.entry.watchedEpisodes", 10001],
    ["items.0.entry.currentEpisode", 0], ["items.0.entry.currentEpisode", 10001],
    ["items.0.entry.playbackSeconds", -1], ["items.0.entry.playbackSeconds", 86401],
    ["items.0.entry.playbackDurationSeconds", "24"], ["items.0.entry.personalScore", 11],
    ["items.0.entry.isRewatching", 1], ["items.0.entry.updatedAt", "never"],
    ...["status", "num_episodes_watched", "score", "is_rewatching", "updated_at"]
      .map((field): [string, unknown, boolean] => [`items.0.remote.${field}`, undefined, true]),
    ["items.0.remote.status", "planned"], ["items.0.remote.num_episodes_watched", -1],
    ["items.0.remote.num_episodes_watched", 10001], ["items.0.remote.score", 11],
    ["items.0.remote.is_rewatching", "false"], ["items.0.remote.updated_at", "never"],
    ...["id", "animeId", "changes", "base", "state"]
      .map((field): [string, unknown, boolean] => [`operations.0.${field}`, undefined, true]),
    ["operations.0.changes", {}], ["operations.0.changes.status", "plan_to_watch"],
    ["operations.0.changes.watchedEpisodes", 10001], ["operations.0.state", "done"],
    ["operations.0.base", {}], ["operations.0.remote", []], ["operations.0.error", {}],
    ["operations.0.submitted", "yes"],
  ];
  const pending: MalOperation = {
    id: "operation-00000001", animeId: "mal-200", base: null,
    changes: { watchedEpisodes: 1 }, state: "pending",
  };

  it.each(invalidLibraryFields)("keeps the complete visible library when a later page field %s is invalid (%s)", async (path, replacement, remove = false) => {
    const { store } = activeStore(["mal-999"]);
    const previous = store.getState().library;
    const payload = changedPayload(library([item("mal-200")], [pending]), path, replacement, remove);
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ ...library([item("mal-100")]), nextCursor: "next-page" }))
      .mockResolvedValueOnce(Response.json(payload));

    await createMalClient({ store, fetch: fetcher }).sync();

    expect(store.getState().library).toEqual(previous);
    expect(store.getState().malSync.status).toBe("error");
    expect(store.getState().malSync.operations).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["operation.id", "operation-00000999"], ["operation.animeId", "mal-200"],
    ["operation.state", undefined, true], ["operation.state", "done"],
    ["operation.changes", undefined, true], ["operation.changes", {}],
    ["operation.changes.watchedEpisodes", 3], ["operation.changes.status", "completed"],
    ["operation.base", undefined, true], ["operation.base", null],
    ["operation.base.num_episodes_watched", 1], ["operation.base.updated_at", "2026-09-23T08:00:00.000Z"],
    ["operation.remote.score", 11], ["operation.error", []], ["operation.submitted", "yes"],
    ["item.anime.id", "mal-200"], ["item.entry.animeId", "mal-200"],
    ["item.entry.status", "bad"], ["item.remote", null], ["removed", "true"],
  ])("preserves submitted intent and retries it when mutation field %s is invalid (%s)", async (path, replacement, remove = false) => {
    const { store } = activeStore();
    store.getState().setWatchedEpisodes("mal-100", 2);
    const intent = store.getState().malSync.operations[0];
    const requests: MalMutationRequest[] = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = mutationBody(init);
      requests.push(request);
      const response = mutationSuccess("mal-100", request);
      return requests.length === 1
        ? Response.json(changedPayload(await response.json(), path as string, replacement, remove === true))
        : response;
    });
    const client = createMalClient({ store, fetch: fetcher });

    await client.flush();

    expect(store.getState().malSync.operations).toEqual([{
      ...intent, submitted: true, state: "failed", error: "The MAL service returned an unreadable response.",
    }]);
    expect(store.getState().library["mal-100"].watchedEpisodes).toBe(2);
    expect(store.getState().library["mal-200"]).toBeUndefined();
    expect(store.getState().malSync.remote["mal-100"]).toEqual(remote(0));

    await client.retryChanges();

    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(store.getState().malSync.operations[0].state).toBe("synced");
  });

  const inconsistentMutationOutcomes: Array<[MalOperation["state"], boolean, boolean | undefined]> = [
    ["synced", true, true], ["synced", false, undefined], ["synced", false, false],
    ["conflict", false, true], ["failed", false, true], ["pending", false, true],
    ["conflict", true, undefined], ["failed", true, undefined], ["pending", true, undefined],
  ];

  it.each(inconsistentMutationOutcomes)("preserves intent and library for inconsistent %s outcome with item=%s removed=%s", async (state, hasItem, removed) => {
    const { store } = activeStore();
    store.getState().setWatchedEpisodes("mal-100", 2);
    const intent = store.getState().malSync.operations[0];
    const previousLibrary = store.getState().library;
    const previousRemote = store.getState().malSync.remote;
    const requests: MalMutationRequest[] = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = mutationBody(init);
      requests.push(request);
      if (requests.length > 1) return mutationSuccess("mal-100", request);
      return Response.json({
        operation: { id: request.operationId, animeId: "mal-100", base: request.base,
          changes: request.changes, state, remote: remote(5) },
        ...(hasItem ? { item: item("mal-100", 5) } : {}),
        ...(removed !== undefined ? { removed } : {}),
      });
    });
    const client = createMalClient({ store, fetch: fetcher });

    await client.flush();

    expect(store.getState().malSync.operations).toEqual([{
      ...intent, submitted: true, state: "failed", error: "The MAL service returned an unreadable response.",
    }]);
    expect(store.getState().library).toEqual(previousLibrary);
    expect(store.getState().malSync.remote).toEqual(previousRemote);

    await client.retryChanges();

    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(store.getState().malSync.operations[0].state).toBe("synced");
    expect(store.getState().library["mal-100"].watchedEpisodes).toBe(2);
  });

  it("rejects a mutation item for another title even when its own ids agree", async () => {
    const { store } = activeStore();
    store.getState().setWatchedEpisodes("mal-100", 2);
    const intent = store.getState().malSync.operations[0];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const response = await mutationSuccess("mal-100", mutationBody(init)).json();
      response.item = item("mal-200", 2);
      return Response.json(response);
    });

    await createMalClient({ store, fetch: fetcher }).flush();

    expect(store.getState().malSync.operations).toEqual([{
      ...intent, submitted: true, state: "failed", error: "The MAL service returned an unreadable response.",
    }]);
    expect(store.getState().library["mal-100"].watchedEpisodes).toBe(2);
    expect(store.getState().library["mal-200"]).toBeUndefined();
  });

  it("accepts a synced receipt whose latest snapshot no longer contains the title", async () => {
    const { store } = activeStore();
    store.getState().setWatchedEpisodes("mal-100", 2);
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = mutationBody(init);
      return Response.json({
        operation: { id: request.operationId, animeId: "mal-100", base: request.base,
          changes: request.changes, state: "synced", remote: remote(2) },
        removed: true,
      });
    });

    await createMalClient({ store, fetch: fetcher }).flush();

    expect(store.getState().malSync.operations[0].state).toBe("synced");
    expect(getTrackedLibrary(store.getState())["mal-100"]).toBeUndefined();
    expect(store.getState().library["mal-100"].currentEpisode).toBe(3);
  });

  it.each([true, false])("accepts an anonymous configured=%s session", async (configured) => {
    const { store } = activeStore();
    const fetcher = vi.fn().mockResolvedValue(Response.json({ configured, user: null }));

    await createMalClient({ store, fetch: fetcher }).initialize();

    expect(store.getState().malUser).toBeNull();
    expect(store.getState().malConfigured).toBe(configured);
    expect(store.getState().authReady).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("accepts normalized optional fields and bounds while discarding additive library fields", async () => {
    const { store, values } = activeStore(["mal-999"]);
    const candidate = item("mal-100");
    Object.assign(candidate.anime, {
      totalEpisodes: null, episodeMinutes: 0, score: "8.5",
      coverUrl: "https://cdn.myanimelist.net/cover.jpg", heroUrl: "https://cdn.myanimelist.net/hero.jpg",
      accessToken: "anime-secret",
    });
    Object.assign(candidate.entry, {
      watchedEpisodes: 10_000, currentEpisode: 10_000, playbackSeconds: 0.5,
      playbackDurationSeconds: 0.5, personalScore: 10, isRewatching: true, accessToken: "entry-secret",
    });
    Object.assign(candidate.remote, { num_episodes_watched: 10_000, score: 10, accessToken: "remote-secret" });
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      ...library([candidate]), lastSyncedAt: null,
      user: { ...user, picture: "https://cdn.myanimelist.net/user.jpg", accessToken: "user-secret" },
    }));

    await createMalClient({ store, fetch: fetcher }).sync();

    expect(store.getState().malSync.status).toBe("synced");
    expect(store.getState().library["mal-100"]).toEqual({
      animeId: "mal-100", status: "planned", watchedEpisodes: 10_000, currentEpisode: 10_000,
      playbackSeconds: 0.5, playbackDurationSeconds: 0.5, personalScore: 10, isRewatching: true, updatedAt,
    });
    expect(store.getState().catalog["mal-100"]).toMatchObject({
      totalEpisodes: null, episodeMinutes: 0, score: "8.5", coverUrl: "https://cdn.myanimelist.net/cover.jpg",
    });
    expect([...values.values()].join("\n")).not.toContain("-secret");
  });

  it("accepts idempotent synced receipts with a newer item snapshot", async () => {
    const { store } = activeStore();
    store.getState().setWatchedEpisodes("mal-100", 2);
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = mutationBody(init);
      return Response.json({
        operation: { id: request.operationId, animeId: "mal-100", base: request.base,
          changes: request.changes, state: "synced", remote: remote(2) },
        item: item("mal-100", 5),
      });
    });

    await createMalClient({ store, fetch: fetcher }).flush();

    expect(store.getState().malSync.operations[0].state).toBe("synced");
    expect(store.getState().library["mal-100"].watchedEpisodes).toBe(5);
    expect(store.getState().malSync.remote["mal-100"]).toEqual(remote(5));
  });

  it("normalizes additive fields without persisting unknown nested credentials", async () => {
    const { store, values } = activeStore();
    store.getState().setWatchedEpisodes("mal-100", 2);
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = mutationBody(init);
      const payload = await mutationSuccess("mal-100", request).json();
      payload.operation.base.accessToken = "base-secret";
      payload.operation.changes.accessToken = "changes-secret";
      payload.operation.remote.accessToken = "remote-secret";
      payload.item.entry.accessToken = "entry-secret";
      payload.item.remote.accessToken = "item-remote-secret";
      payload.operation.accessToken = "operation-secret";
      return Response.json(payload);
    });

    await createMalClient({ store, fetch: fetcher }).flush();

    expect(store.getState().malSync.operations[0].state).toBe("synced");
    expect([...values.values()].join("\n")).not.toContain("-secret");
    expect(store.getState().library["mal-100"].watchedEpisodes).toBe(2);
  });
});
