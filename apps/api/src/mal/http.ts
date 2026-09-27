import {
  DatabaseConfigurationError,
  DatabaseUnavailableError,
} from "../database/errors.js";
import type { MalUser } from "@sabame/domain/mal";
import type { MalRepository } from "../database/repository.js";
import { malConfig, MalError } from "./config.js";

export const SESSION_COOKIE = "sabame_mal_session";
export const OAUTH_COOKIE = "sabame_mal_oauth";
export function privateJson(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "Referrer-Policy": "no-referrer",
    },
  });
}
export function errorResponse(error: unknown) {
  const failure =
    error instanceof MalError ||
    error instanceof DatabaseConfigurationError ||
    error instanceof DatabaseUnavailableError
      ? error
      : new MalError("internal_error", 500);
  console.warn("[mal]", { code: failure.code, status: failure.status });
  return privateJson(
    {
      error: {
        code: failure.code,
        message:
          messages[failure.code] ??
          "MAL could not complete this request. Your changes have not been confirmed.",
      },
    },
    failure.status,
  );
}
const messages: Record<string, string> = {
  library_changed:
    "Your library changed while loading. Retry sync to load a consistent list.",
  database_not_configured: "The account database is not configured.",
  database_unavailable:
    "The account database is temporarily unavailable. Retry shortly.",
  not_configured:
    "MyAnimeList connection is not configured yet. You can try the local demo.",
  persistent_storage_required:
    "MAL accounts require a server with persistent storage.",
  unauthorized: "Sign in with MyAnimeList to continue.",
  reconnect_required: "Reconnect to MyAnimeList to sync your changes.",
  account_changed: "Your signed-in account changed. Reload before editing.",
  sync_busy: "Another sync is running. Retry in a moment.",
  mal_unavailable:
    "MyAnimeList is unavailable. Retry your saved changes later.",
  import_timeout:
    "The import timed out. Your existing list is unchanged; retry import.",
};
export async function currentUser(
  request: Request,
  repository: MalRepository,
): Promise<MalUser> {
  const token = cookie(request, SESSION_COOKIE);
  if (!token) throw new MalError("unauthorized", 401);
  const user = await repository.session(token);
  if (!user) throw new MalError("unauthorized", 401);
  return user;
}
export function verifyOrigin(request: Request) {
  if (request.headers.get("origin") !== malConfig().origin)
    throw new MalError("invalid_origin", 403);
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new MalError("invalid_request", 400);
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
    if (size > 16_384) {
      await reader.cancel();
      throw new MalError("invalid_request", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new MalError("invalid_request", 400);
  }
}

export function cookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
}
export function setCookie(
  response: Response,
  name: string,
  value: string,
  options: { path: string; maxAge: number; secure?: boolean },
) {
  response.headers.append(
    "Set-Cookie",
    `${name}=${encodeURIComponent(value)}; Path=${options.path}; Max-Age=${options.maxAge}; HttpOnly; SameSite=Lax${options.secure ? "; Secure" : ""}`,
  );
}
