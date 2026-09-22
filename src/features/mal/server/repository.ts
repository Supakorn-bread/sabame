import "server-only";
import { DatabaseSync } from "node:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { MalLibraryItem, MalOperation, MalUser } from "../types";
import { malConfig, MalError } from "./config";
import { hashToken, randomToken } from "./crypto";

export interface Account { user: MalUser; tokens: string; expiresAt: number; imported: boolean; lastSyncedAt: string | null }
interface Row { [key: string]: unknown }

export class MalRepository {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, profile TEXT NOT NULL, tokens TEXT NOT NULL, expires INTEGER NOT NULL, imported INTEGER NOT NULL DEFAULT 0, synced TEXT);
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES accounts(id), expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS oauth (hash TEXT PRIMARY KEY, state_hash TEXT NOT NULL, verifier TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS entries (user_id INTEGER NOT NULL REFERENCES accounts(id), anime_id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(user_id,anime_id));
      CREATE TABLE IF NOT EXISTS operations (user_id INTEGER NOT NULL REFERENCES accounts(id), id TEXT NOT NULL, anime_id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(user_id,id));
      CREATE TABLE IF NOT EXISTS leases (user_id INTEGER PRIMARY KEY, owner TEXT NOT NULL, expires INTEGER NOT NULL);`);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  saveAccount(user: MalUser, tokens: string, expiresAt: number) {
    this.db.prepare("INSERT INTO accounts(id,profile,tokens,expires) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET profile=excluded.profile,tokens=excluded.tokens,expires=excluded.expires,imported=0,synced=NULL").run(user.id, JSON.stringify(user), tokens, expiresAt);
  }
  updateTokens(userId: number, tokens: string, expiresAt: number) {
    this.db.prepare("UPDATE accounts SET tokens=?,expires=? WHERE id=?").run(tokens, expiresAt, userId);
  }
  account(id: number): Account {
    const row = this.db.prepare("SELECT * FROM accounts WHERE id=?").get(id) as Row | undefined;
    if (!row) throw new MalError("unauthorized", 401);
    return { user: JSON.parse(row.profile as string), tokens: row.tokens as string, expiresAt: Number(row.expires), imported: Boolean(row.imported), lastSyncedAt: row.synced as string | null };
  }
  createSession(userId: number) {
    const token = randomToken();
    this.db.prepare("DELETE FROM sessions WHERE expires<=?").run(Date.now());
    this.db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(hashToken(token), userId, Date.now() + 30 * 86400_000);
    return token;
  }
  session(token: string | undefined) {
    if (!token || token.length > 100) return null;
    const row = this.db.prepare("SELECT user_id FROM sessions WHERE hash=? AND expires>?").get(hashToken(token), Date.now());
    return row ? this.account(Number(row.user_id)).user : null;
  }
  logout(token: string | undefined) {
    if (token) this.db.prepare("DELETE FROM sessions WHERE hash=?").run(hashToken(token));
  }
  createOAuth(state: string, encryptedVerifier: string) {
    const token = randomToken();
    this.db.prepare("DELETE FROM oauth WHERE expires<=?").run(Date.now());
    this.db.prepare("INSERT INTO oauth VALUES(?,?,?,?)").run(hashToken(token), hashToken(state), encryptedVerifier, Date.now() + 10 * 60_000);
    return token;
  }
  consumeOAuth(token: string, state: string): string {
    return this.transaction(() => {
      const row = this.db.prepare("SELECT * FROM oauth WHERE hash=? AND state_hash=? AND expires>?").get(hashToken(token), hashToken(state), Date.now());
      if (!row) throw new MalError("invalid_callback", 400);
      this.db.prepare("DELETE FROM oauth WHERE hash=?").run(hashToken(token));
      return row.verifier as string;
    });
  }
  entries(userId: number): MalLibraryItem[] {
    return this.db.prepare("SELECT payload FROM entries WHERE user_id=? ORDER BY anime_id").all(userId).map(row => JSON.parse(row.payload as string));
  }
  entry(userId: number, animeId: string): MalLibraryItem | undefined {
    const row = this.db.prepare("SELECT payload FROM entries WHERE user_id=? AND anime_id=?").get(userId, animeId);
    return row ? JSON.parse(row.payload as string) : undefined;
  }
  saveEntry(userId: number, item: MalLibraryItem) {
    this.db.prepare("INSERT INTO entries VALUES(?,?,?) ON CONFLICT(user_id,anime_id) DO UPDATE SET payload=excluded.payload").run(userId, item.anime.id, JSON.stringify(item));
  }
  removeEntry(userId: number, animeId: string) {
    this.db.prepare("DELETE FROM entries WHERE user_id=? AND anime_id=?").run(userId, animeId);
  }
  markSynced(userId: number) {
    this.db.prepare("UPDATE accounts SET synced=? WHERE id=?").run(new Date().toISOString(), userId);
  }
  replaceEntries(userId: number, items: MalLibraryItem[]) {
    this.transaction(() => {
      // Preserve entries with pending edits until those edits are resolved.
      const pending = new Set(this.operations(userId).map(operation => operation.animeId));
      const retained = this.entries(userId).filter(item => pending.has(item.anime.id) && !items.some(next => next.anime.id === item.anime.id));
      this.db.prepare("DELETE FROM entries WHERE user_id=?").run(userId);
      for (const item of [...items, ...retained]) this.saveEntry(userId, item);
      this.db.prepare("UPDATE accounts SET imported=1,synced=? WHERE id=?").run(new Date().toISOString(), userId);
    });
  }
  operation(userId: number, id: string): MalOperation | undefined {
    const row = this.db.prepare("SELECT payload FROM operations WHERE user_id=? AND id=?").get(userId, id);
    return row ? JSON.parse(row.payload as string) : undefined;
  }
  operations(userId: number): MalOperation[] {
    return this.db.prepare("SELECT payload FROM operations WHERE user_id=?").all(userId).map(row => JSON.parse(row.payload as string) as MalOperation).filter(operation => operation.state !== "synced");
  }
  saveOperation(userId: number, operation: MalOperation) {
    this.db.prepare("INSERT INTO operations VALUES(?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET payload=excluded.payload").run(userId, operation.id, operation.animeId, JSON.stringify(operation));
  }
  async exclusive<T>(userId: number, fn: () => Promise<T>): Promise<T> {
    const owner = randomToken();
    const acquired = this.db.prepare("INSERT INTO leases VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE leases.expires<?").run(userId, owner, Date.now() + 180_000, Date.now());
    if (!acquired.changes) throw new MalError("sync_busy", 409);
    try { return await fn(); }
    finally { this.db.prepare("DELETE FROM leases WHERE user_id=? AND owner=?").run(userId, owner); }
  }
}

let cached: { path: string; repository: MalRepository } | undefined;
export function malRepository() {
  const path = malConfig().databasePath;
  if (!cached || cached.path !== path) cached = { path, repository: new MalRepository(path) };
  return cached.repository;
}
