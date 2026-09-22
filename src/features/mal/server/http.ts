import "server-only";
import { cookies } from "next/headers";
import type { MalUser } from "../types";
import { malConfig, MalError } from "./config";
import { malRepository } from "./repository";

export const SESSION_COOKIE = "sabame_mal_session";
export const OAUTH_COOKIE = "sabame_mal_oauth";
export function privateJson(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" } });
}
export function errorResponse(error: unknown) {
  const failure = error instanceof MalError ? error : new MalError("internal_error", 500);
  console.warn("[mal]", { code: failure.code, status: failure.status });
  return privateJson({ error: { code: failure.code, message: messages[failure.code] ?? "MAL could not complete this request. Your changes have not been confirmed." } }, failure.status);
}
const messages: Record<string, string> = {
  not_configured: "MyAnimeList connection is not configured yet. You can try the local demo.",
  persistent_storage_required: "MAL accounts require a server with persistent storage.",
  unauthorized: "Sign in with MyAnimeList to continue.",
  reconnect_required: "Reconnect to MyAnimeList to sync your changes.",
  account_changed: "Your signed-in account changed. Reload before editing.",
  sync_busy: "Another sync is running. Retry in a moment.",
  mal_unavailable: "MyAnimeList is unavailable. Retry your saved changes later.",
  import_timeout: "The import timed out. Your existing list is unchanged; retry import.",
};
export async function currentUser(): Promise<MalUser> {
  const user = malRepository().session((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) throw new MalError("unauthorized", 401);
  return user;
}
export function verifyOrigin(request: Request) {
  if (request.headers.get("origin") !== malConfig().origin) throw new MalError("invalid_origin", 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new MalError("invalid_request", 400);
}
export async function readBody(request: Request): Promise<unknown> {
  verifyOrigin(request);
  const reader = request.body?.getReader();
  if (!reader) throw new MalError("invalid_request", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16_384) { await reader.cancel(); throw new MalError("invalid_request", 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new MalError("invalid_request", 400); }
}
