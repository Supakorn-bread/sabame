import type { StateStorage } from "zustand/middleware";
import { describe, expect, it, vi } from "vitest";

import { createTrackerStore } from "@/features/tracker/store";
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
    const fetcher: MalFetcher = vi.fn().mockResolvedValueOnce(Response.json({ ...library([item("mal-100")]), nextCursor: "next-page" }))
      .mockResolvedValueOnce(Response.json(library([item("mal-200")])));
    await createMalClient({ store, fetch: fetcher }).sync();
    expect(fetcher).toHaveBeenCalledWith("/api/mal/list?cursor=next-page", expect.objectContaining({ cache: "no-store" }));
    expect(Object.keys(store.getState().library).sort()).toEqual(["mal-100", "mal-200"]);
  });
  it("preserves the previous visible snapshot if a later page fails", async () => {
    const { store } = activeStore(["mal-999"]);
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
