import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { malConfig, MalError } from "./config";
import { decrypt, encrypt, randomToken } from "./crypto";
import { exchangeTokens, fetchProfile } from "./client";
import { malUser } from "./normalization";
import { malRepository } from "./repository";
import { OAUTH_COOKIE, SESSION_COOKIE } from "./http";

function redirectTo(request: Request, path: string) {
  // Internal redirects never accept a client-provided destination.
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
export async function startOAuth(request: Request) {
  try {
    const config = malConfig();
    if (new URL(request.url).origin !== config.origin) throw new MalError("callback_origin_mismatch", 400);
    const state = randomToken();
    const verifier = randomToken();
    const transaction = malRepository().createOAuth(state, encrypt(verifier, config.encryptionKey));
    const url = new URL("https://myanimelist.net/v1/oauth2/authorize");
    url.search = new URLSearchParams({ response_type: "code", client_id: config.clientId, redirect_uri: config.redirectUri, code_challenge: verifier, code_challenge_method: "plain", state }).toString();
    const response = NextResponse.redirect(url, 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set(OAUTH_COOKIE, transaction, { httpOnly: true, secure: config.secure, sameSite: "lax", path: "/api/auth/mal", maxAge: 600 });
    return response;
  } catch (error) { return redirectTo(request, `/login?mal_error=${error instanceof MalError ? error.code : "connection_failed"}`); }
}
export async function finishOAuth(request: Request) {
  let response: NextResponse;
  try {
    const config = malConfig();
    const url = new URL(request.url);
    if (url.origin !== config.origin) throw new MalError("invalid_callback", 400);
    const token = (await cookies()).get(OAUTH_COOKIE)?.value;
    const state = url.searchParams.get("state");
    if (!token || !state || state.length > 128) throw new MalError("invalid_callback", 400);
    const repository = malRepository();
    const verifier = decrypt<string>(repository.consumeOAuth(token, state), config.encryptionKey);
    if (url.searchParams.has("error")) throw new MalError("access_denied", 400);
    const code = url.searchParams.get("code");
    if (!code || code.length > 4096) throw new MalError("invalid_callback", 400);
    const tokens = await exchangeTokens({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: config.redirectUri });
    const user = malUser(await fetchProfile(tokens.accessToken));
    await repository.exclusive(user.id, async () => { repository.saveAccount(user, encrypt(tokens, config.encryptionKey), tokens.expiresAt); });
    // Rotate the current browser session after successful authorization.
    repository.logout((await cookies()).get(SESSION_COOKIE)?.value);
    response = redirectTo(request, "/dashboard");
    response.cookies.set(SESSION_COOKIE, repository.createSession(user.id), { httpOnly: true, secure: config.secure, sameSite: "lax", path: "/", maxAge: 30 * 86400 });
  } catch (error) { response = redirectTo(request, `/login?mal_error=${error instanceof MalError ? error.code : "connection_failed"}`); }
  response.cookies.set(OAUTH_COOKIE, "", { path: "/api/auth/mal", maxAge: 0, httpOnly: true, sameSite: "lax" });
  return response;
}
