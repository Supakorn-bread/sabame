import { Inject, Injectable } from "@nestjs/common";
import { MalRepository } from "../../database/repository.js";
import {
  malConfig,
  malConfigured,
  appOrigin,
  MalError,
} from "../../mal/config.js";
import { decrypt, encrypt, randomToken } from "../../mal/crypto.js";
import { exchangeTokens, fetchProfile } from "../../mal/client.js";
import { malUser } from "../../mal/normalization.js";
import {
  cookie,
  errorResponse,
  privateJson,
  readBody,
  setCookie,
  OAUTH_COOKIE,
  SESSION_COOKIE,
} from "../../mal/http.js";

@Injectable()
export class AuthService {
  constructor(
    @Inject(MalRepository) private readonly repository: MalRepository,
  ) {}

  async session(request: Request): Promise<Response> {
    try {
      const configured = malConfigured();
      const token = cookie(request, SESSION_COOKIE);
      const user =
        configured && token ? await this.repository.session(token) : null;
      return privateJson({ configured, user });
    } catch (error) {
      return errorResponse(error);
    }
  }

  async logout(request: Request): Promise<Response> {
    try {
      await readBody(request);
      await this.repository.logout(cookie(request, SESSION_COOKIE));
      const response = privateJson({ success: true });
      setCookie(response, SESSION_COOKIE, "", { path: "/", maxAge: 0 });
      return response;
    } catch (error) {
      return errorResponse(error);
    }
  }

  async startOAuth(request: Request): Promise<Response> {
    try {
      const config = malConfig();
      if (new URL(request.url).origin !== config.origin) {
        throw new MalError("callback_origin_mismatch", 400);
      }

      const state = randomToken();
      const verifier = randomToken();
      const transaction = await this.repository.createOAuth(
        state,
        encrypt(verifier, config.encryptionKey),
      );
      const url = new URL("https://myanimelist.net/v1/oauth2/authorize");
      url.search = new URLSearchParams({
        response_type: "code",
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        code_challenge: verifier,
        code_challenge_method: "plain",
        state,
      }).toString();

      const response = new Response(null, {
        status: 303,
        headers: { Location: url.href },
      });
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("Referrer-Policy", "no-referrer");
      setCookie(response, OAUTH_COOKIE, transaction, {
        secure: config.secure,
        path: "/api/auth/mal",
        maxAge: 600,
      });
      return response;
    } catch (error) {
      return this.redirectTo(
        `/login?mal_error=${error instanceof MalError ? error.code : "connection_failed"}`,
      );
    }
  }

  async finishOAuth(request: Request): Promise<Response> {
    let response: Response;
    try {
      const config = malConfig();
      const url = new URL(request.url);
      if (url.origin !== config.origin)
        throw new MalError("invalid_callback", 400);

      const token = cookie(request, OAUTH_COOKIE);
      const state = url.searchParams.get("state");
      if (!token || !state || state.length > 128) {
        throw new MalError("invalid_callback", 400);
      }

      const verifier = decrypt<string>(
        await this.repository.consumeOAuth(token, state),
        config.encryptionKey,
      );
      if (url.searchParams.has("error"))
        throw new MalError("access_denied", 400);
      const code = url.searchParams.get("code");
      if (!code || code.length > 4096)
        throw new MalError("invalid_callback", 400);

      const tokens = await exchangeTokens({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: config.redirectUri,
      });
      const user = malUser(await fetchProfile(tokens.accessToken));
      await this.repository.exclusive(user.id, async () => {
        await this.repository.saveAccount(
          user,
          encrypt(tokens, config.encryptionKey),
          tokens.expiresAt,
        );
      });

      await this.repository.logout(cookie(request, SESSION_COOKIE));
      response = this.redirectTo("/dashboard");
      setCookie(
        response,
        SESSION_COOKIE,
        await this.repository.createSession(user.id),
        {
          secure: config.secure,
          path: "/",
          maxAge: 30 * 86400,
        },
      );
    } catch (error) {
      response = this.redirectTo(
        `/login?mal_error=${error instanceof MalError ? error.code : "connection_failed"}`,
      );
    }

    setCookie(response, OAUTH_COOKIE, "", {
      path: "/api/auth/mal",
      maxAge: 0,
      secure: appOrigin().startsWith("https:"),
    });
    return response;
  }

  private redirectTo(path: string): Response {
    const response = new Response(null, {
      status: 303,
      headers: { Location: new URL(path, appOrigin()).href },
    });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
}
