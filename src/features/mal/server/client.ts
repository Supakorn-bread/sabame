import "server-only";
import type { MalChanges, MalLibraryItem, MalListStatus } from "../types";
import { malConfig, MalError } from "./config";
import { decrypt, encrypt } from "./crypto";
import { libraryItem, listStatus, object } from "./normalization";
import type { MalRepository } from "./repository";

export interface Tokens { accessToken: string; refreshToken: string; expiresAt: number }
const API = "https://api.myanimelist.net/v2";
const FIELDS = "list_status,num_episodes,main_picture,mean,genres,synopsis,average_episode_duration";

async function request(url: string, options: RequestInit): Promise<unknown> {
  let response: Response;
  try { response = await fetch(url, { ...options, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12_000) }); }
  catch { throw new MalError("mal_unavailable", 503); }
  if (!response.ok) {
    if (response.status === 401) throw new MalError("reconnect_required", 401);
    if (response.status === 429) throw new MalError("rate_limited", 429);
    if (response.status === 403) throw new MalError("mal_access_denied", 403);
    if (response.status === 404) throw new MalError("mal_not_found", 404);
    if (response.status === 400) throw new MalError("mal_rejected_request", 400);
    throw new MalError("mal_unavailable", 503);
  }
  try { return await response.json(); } catch { throw new MalError("invalid_mal_response"); }
}

export async function exchangeTokens(fields: Record<string, string>): Promise<Tokens> {
  const config = malConfig();
  const payload = object(await request("https://myanimelist.net/v1/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...fields, client_id: config.clientId, client_secret: config.clientSecret }) }));
  if (typeof payload.access_token !== "string" || !payload.access_token || typeof payload.refresh_token !== "string" || !payload.refresh_token || typeof payload.expires_in !== "number" || !Number.isFinite(payload.expires_in) || payload.expires_in <= 0 || String(payload.token_type).toLowerCase() !== "bearer") throw new MalError("invalid_mal_response");
  return { accessToken: payload.access_token, refreshToken: payload.refresh_token, expiresAt: Date.now() + payload.expires_in * 1000 };
}
export async function fetchProfile(accessToken: string) {
  return request(`${API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
}

// Call under repository.exclusive(userId) so refresh rotation and writes are serialized.
export class MalClient {
  constructor(private repository: MalRepository, private userId: number) {}
  async refresh() {
    const account = this.repository.account(this.userId);
    const config = malConfig();
    const old = decrypt<Tokens>(account.tokens, config.encryptionKey);
    let tokens: Tokens;
    try { tokens = await exchangeTokens({ grant_type: "refresh_token", refresh_token: old.refreshToken }); }
    catch (error) { if (error instanceof MalError && [400, 401].includes(error.status)) throw new MalError("reconnect_required", 401); throw error; }
    this.repository.updateTokens(this.userId, encrypt(tokens, config.encryptionKey), tokens.expiresAt);
    return tokens;
  }
  async call(path: string, options: RequestInit = {}): Promise<unknown> {
    const account = this.repository.account(this.userId);
    let tokens = account.expiresAt <= Date.now() + 30_000 ? await this.refresh() : decrypt<Tokens>(account.tokens, malConfig().encryptionKey);
    const send = () => request(`${API}${path}`, { ...options, headers: { ...options.headers, Authorization: `Bearer ${tokens.accessToken}` } });
    try { return await send(); }
    catch (error) {
      if (!(error instanceof MalError) || error.status !== 401) throw error;
      tokens = await this.refresh();
      return send();
    }
  }
  async list(): Promise<MalLibraryItem[]> {
    let offset = 0;
    const items = new Map<string, MalLibraryItem>();
    const deadline = Date.now() + 90_000;
    while (true) {
      if (Date.now() > deadline) throw new MalError("import_timeout", 504);
      const payload = object(await this.call(`/users/@me/animelist?${new URLSearchParams({ fields: FIELDS, limit: "100", offset: String(offset) })}`));
      if (!Array.isArray(payload.data)) throw new MalError("invalid_mal_response");
      for (const value of payload.data) {
        const row = object(value);
        const item = libraryItem(row.node, listStatus(row.list_status));
        items.set(item.anime.id, item);
      }
      const next = payload.paging && object(payload.paging).next;
      if (!next) return [...items.values()];
      if (typeof next !== "string") throw new MalError("invalid_mal_response");
      let url: URL;
      try { url = new URL(next); } catch { throw new MalError("invalid_mal_response"); }
      const nextOffset = Number(url.searchParams.get("offset"));
      const user = this.repository.account(this.userId).user;
      let path: string;
      try { path = decodeURIComponent(url.pathname); } catch { throw new MalError("invalid_mal_response"); }
      const ownList = path === "/v2/users/@me/animelist" || path === `/v2/users/${user.name}/animelist`;
      if (url.origin !== "https://api.myanimelist.net" || !ownList || !Number.isSafeInteger(nextOffset) || nextOffset <= offset || !payload.data.length) throw new MalError("invalid_mal_response");
      offset = nextOffset;
    }
  }
  async details(id: string): Promise<{ node: Record<string, unknown>; status: MalListStatus | null }> {
    const node = object(await this.call(`/anime/${id.slice(4)}?fields=${FIELDS},my_list_status`));
    if (`mal-${node.id}` !== id) throw new MalError("invalid_mal_response");
    return { node, status: node.my_list_status ? listStatus(node.my_list_status) : null };
  }
  async update(id: string, changes: MalChanges): Promise<MalListStatus> {
    const form = new URLSearchParams();
    if (changes.watchedEpisodes !== undefined) form.set("num_watched_episodes", String(changes.watchedEpisodes));
    if (changes.status !== undefined) form.set("status", changes.status === "planned" ? "plan_to_watch" : changes.status);
    return listStatus(await this.call(`/anime/${id.slice(4)}/my_list_status`, { method: "PATCH", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form }));
  }
}
