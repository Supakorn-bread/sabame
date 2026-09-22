// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { decrypt, encrypt } from "./crypto";
import { MalRepository } from "./repository";
import { libraryItem } from "./normalization";
import { hasConflict, mutateList, validateMutation } from "./sync";
import type { MalListStatus, MalMutationRequest } from "../types";

const repositories: MalRepository[] = [];
const base: MalListStatus = { status: "on_hold", num_episodes_watched: 2, score: 8, is_rewatching: false, updated_at: "2026-09-15T00:00:00Z" };
const node = { id: 100, title: "A real MAL title", num_episodes: 12 };
function repository() {
  const repo = new MalRepository(":memory:");
  repositories.push(repo);
  repo.saveAccount({ id: 1, name: "viewer" }, "encrypted", Date.now() + 3600_000);
  repo.saveAccount({ id: 2, name: "other" }, "encrypted", Date.now() + 3600_000);
  return repo;
}
const mutation = (): MalMutationRequest => ({ expectedUserId: 1, operationId: "operation-00000001", base: { ...base }, changes: { watchedEpisodes: 3 } });
afterEach(() => { for (const repo of repositories.splice(0)) repo.db.close(); vi.restoreAllMocks(); });

describe("MAL account security and persistence", () => {
  it("encrypts tokens and detects tampering or wrong keys", () => {
    const key = Buffer.alloc(32, 1);
    const encrypted = encrypt({ access: "PRIVATE_ACCESS", refresh: "PRIVATE_REFRESH" }, key);
    expect(encrypted).not.toContain("PRIVATE");
    expect(decrypt(encrypted, key)).toEqual({ access: "PRIVATE_ACCESS", refresh: "PRIVATE_REFRESH" });
    expect(() => decrypt(encrypted, Buffer.alloc(32, 2))).toThrow();
  });
  it("consumes authorization state once, rejects mismatched state and expires transactions", () => {
    const repo = repository();
    const cookie = repo.createOAuth("state", "encrypted-verifier");
    expect(() => repo.consumeOAuth(cookie, "wrong-state")).toThrow("invalid_callback");
    expect(repo.consumeOAuth(cookie, "state")).toBe("encrypted-verifier");
    expect(() => repo.consumeOAuth(cookie, "state")).toThrow("invalid_callback");
    const expired = repo.createOAuth("state", "encrypted-verifier");
    repo.db.exec("UPDATE oauth SET expires=0");
    expect(() => repo.consumeOAuth(expired, "state")).toThrow("invalid_callback");
  });
  it("isolates sessions, libraries and operations across accounts and revokes logout", () => {
    const repo = repository();
    const cookie = repo.createSession(1);
    repo.saveEntry(1, libraryItem(node, base));
    repo.saveOperation(1, { id: "op", animeId: "mal-100", base, changes: { watchedEpisodes: 3 }, state: "pending" });
    expect(repo.session(cookie)?.id).toBe(1);
    expect(repo.session("forged")).toBeNull();
    expect(repo.entries(2)).toEqual([]);
    expect(repo.operations(2)).toEqual([]);
    repo.logout(cookie);
    expect(repo.session(cookie)).toBeNull();
  });
  it("keeps full imports beyond browser caps and preserves on-hold/dropped/unknown totals", () => {
    const repo = repository();
    const items = Array.from({ length: 1100 }, (_, i) => libraryItem({ ...node, id: i + 1, num_episodes: 0 }, { ...base, status: i % 2 ? "dropped" : "on_hold" }));
    repo.replaceEntries(1, items);
    expect(repo.entries(1)).toHaveLength(1100);
    expect(repo.entries(1)[0].anime.totalEpisodes).toBeNull();
    expect(repo.entries(1)[0].entry.status).toBe("on_hold");
    repo.replaceEntries(1, []);
    expect(repo.entries(1)).toEqual([]);
    expect(repo.account(1).imported).toBe(true);
  });
  it("serializes account work across repository users and releases after failure", async () => {
    const repo = repository();
    await repo.exclusive(1, async () => {
      await expect(repo.exclusive(1, async () => {})).rejects.toThrow("sync_busy");
      await expect(repo.exclusive(2, async () => "other account")).resolves.toBe("other account");
    });
    await expect(repo.exclusive(1, async () => { throw new Error("failed"); })).rejects.toThrow("failed");
    await expect(repo.exclusive(1, async () => "released")).resolves.toBe("released");
  });
});

describe("MAL two-way reconciliation", () => {
  it("merges disjoint edits and preserves deliberate decreases", () => {
    expect(hasConflict(base, { ...base, score: 10, status: "dropped" }, { watchedEpisodes: 1 })).toBe(false);
    expect(hasConflict(base, { ...base, num_episodes_watched: 5 }, { watchedEpisodes: 3 })).toBe(true);
    expect(hasConflict(base, null, { watchedEpisodes: 3 })).toBe(true);
    expect(hasConflict(null, null, { status: "planned" })).toBe(false);
  });
  it("writes progress only, saves MAL acknowledgement and does not repeat an operation", async () => {
    const repo = repository();
    const client = { details: vi.fn().mockResolvedValue({ node, status: base }), update: vi.fn().mockResolvedValue({ ...base, num_episodes_watched: 3 }) };
    const first = await mutateList(repo, 1, "mal-100", mutation(), client);
    expect(client.update).toHaveBeenCalledWith("mal-100", { watchedEpisodes: 3 });
    expect(first.item?.remote.score).toBe(8);
    expect(first.item?.entry.status).toBe("on_hold");
    expect(first.operation.state).toBe("synced");
    await mutateList(repo, 1, "mal-100", mutation(), client);
    expect(client.update).toHaveBeenCalledTimes(1);
    expect(repo.operations(1)).toEqual([]);
  });
  it("surfaces conflicting edits and supports explicit use-MAL resolution", async () => {
    const repo = repository();
    const client = { details: vi.fn().mockResolvedValue({ node, status: { ...base, num_episodes_watched: 5 } }), update: vi.fn() };
    const result = await mutateList(repo, 1, "mal-100", mutation(), client);
    expect(result.operation.state).toBe("conflict");
    expect(client.update).not.toHaveBeenCalled();
    const resolved = await mutateList(repo, 1, "mal-100", { ...mutation(), resolution: "remote" }, client);
    expect(resolved.item?.entry.watchedEpisodes).toBe(5);
    expect(resolved.operation.state).toBe("synced");
    expect(client.update).not.toHaveBeenCalled();
  });
  it("persists failed writes and reconciles ambiguous success before retrying", async () => {
    const repo = repository();
    const client = { details: vi.fn().mockResolvedValue({ node, status: base }), update: vi.fn().mockRejectedValue(new Error("network failed")) };
    expect((await mutateList(repo, 1, "mal-100", mutation(), client)).operation.state).toBe("failed");
    expect(repo.operations(1)).toHaveLength(1);
    client.details.mockResolvedValue({ node, status: { ...base, num_episodes_watched: 3 } });
    expect((await mutateList(repo, 1, "mal-100", mutation(), client)).operation.state).toBe("synced");
    expect(client.update).toHaveBeenCalledTimes(1);
  });
  it("prevents changed payload reuse and stale concurrent operations", async () => {
    const repo = repository();
    const client = { details: vi.fn().mockRejectedValue(new Error("offline")), update: vi.fn() };
    await mutateList(repo, 1, "mal-100", mutation(), client);
    await expect(mutateList(repo, 1, "mal-100", { ...mutation(), changes: { watchedEpisodes: 8 } }, client)).rejects.toThrow("operation_mismatch");
    await expect(mutateList(repo, 1, "mal-100", { ...mutation(), operationId: "operation-00000002" }, client)).rejects.toThrow("sync_busy");
  });
  it("does not resurrect a remotely removed entry when choosing MAL", async () => {
    const repo = repository();
    repo.saveEntry(1, libraryItem(node, base));
    const client = { details: vi.fn().mockResolvedValue({ node, status: null }), update: vi.fn() };
    const result = await mutateList(repo, 1, "mal-100", { ...mutation(), resolution: "remote" }, client);
    expect(result.removed).toBe(true);
    expect(repo.entries(1)).toEqual([]);
    expect(client.update).not.toHaveBeenCalled();
  });
  it("validates ownership, bounded progress and allowlisted mutation fields", () => {
    expect(() => validateMutation(mutation(), 2)).toThrow("account_changed");
    expect(() => validateMutation({ ...mutation(), changes: { score: 9 } }, 1)).toThrow("invalid_request");
    expect(() => validateMutation({ ...mutation(), changes: { watchedEpisodes: -1 } }, 1)).toThrow("invalid_request");
    expect(validateMutation(mutation(), 1)).toEqual(mutation());
  });
});
