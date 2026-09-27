export class MalError extends Error {
  constructor(
    public code: string,
    public status = 502,
  ) {
    super(code);
  }
}

export function malConfig() {
  const clientId = process.env.MAL_CLIENT_ID;
  const clientSecret = process.env.MAL_CLIENT_SECRET;
  const redirectUri = process.env.MAL_REDIRECT_URI;
  const encryptionKey = process.env.MAL_TOKEN_ENCRYPTION_KEY;
  if (
    !clientId ||
    !clientSecret ||
    !redirectUri ||
    !encryptionKey ||
    !/^[a-f\d]{64}$/i.test(encryptionKey)
  )
    throw new MalError("not_configured", 503);
  let callback: URL;
  try {
    callback = new URL(redirectUri);
  } catch {
    throw new MalError("not_configured", 503);
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(callback.hostname);
  if (
    (callback.protocol !== "https:" &&
      !(callback.protocol === "http:" && local)) ||
    callback.username ||
    callback.password ||
    callback.search ||
    callback.hash ||
    callback.pathname !== "/api/auth/mal/callback"
  )
    throw new MalError("not_configured", 503);
  const origin = appOrigin();
  if (callback.origin !== origin) throw new MalError("not_configured", 503);
  if (!process.env.DATABASE_URL) throw new MalError("not_configured", 503);
  return {
    clientId,
    clientSecret,
    redirectUri,
    origin,
    secure: callback.protocol === "https:",
    encryptionKey: Buffer.from(encryptionKey, "hex"),
  };
}

export function appOrigin() {
  const value =
    process.env.APP_ORIGIN ||
    (process.env.VERCEL ? "" : "http://localhost:3000");
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      (url.protocol !== "https:" && !(local && url.protocol === "http:"))
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new MalError("not_configured", 503);
  }
}

export function malConfigured() {
  try {
    malConfig();
    return true;
  } catch {
    return false;
  }
}
