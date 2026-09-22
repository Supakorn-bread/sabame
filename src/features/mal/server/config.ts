import "server-only";
import { resolve } from "node:path";

export class MalError extends Error {
  constructor(public code: string, public status = 502) { super(code); }
}

export function malConfig() {
  const clientId = process.env.MAL_CLIENT_ID;
  const clientSecret = process.env.MAL_CLIENT_SECRET;
  const redirectUri = process.env.MAL_REDIRECT_URI;
  const encryptionKey = process.env.MAL_TOKEN_ENCRYPTION_KEY;
  if (!clientId || !clientSecret || !redirectUri || !encryptionKey || !/^[a-f\d]{64}$/i.test(encryptionKey)) throw new MalError("not_configured", 503);
  let callback: URL;
  try { callback = new URL(redirectUri); } catch { throw new MalError("not_configured", 503); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(callback.hostname);
  if ((callback.protocol !== "https:" && !(callback.protocol === "http:" && local)) || callback.username || callback.password || callback.search || callback.hash || callback.pathname !== "/api/auth/mal/callback") throw new MalError("not_configured", 503);
  // SQLite requires persistent local disk. Ephemeral function filesystems are not supported.
  if (process.env.VERCEL) throw new MalError("persistent_storage_required", 503);
  return { clientId, clientSecret, redirectUri, origin: callback.origin, secure: callback.protocol === "https:", encryptionKey: Buffer.from(encryptionKey, "hex"), databasePath: resolve(process.env.MAL_DATABASE_PATH || ".data/sabame.sqlite") };
}

export function malConfigured() {
  try { malConfig(); return true; } catch { return false; }
}
