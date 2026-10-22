import "server-only";
import { MediaError } from "../types";

export function decodeAnimerukaManifest(body: Buffer): string {
  if (body.length > 1_048_576) throw new MediaError("resource_too_large");
  try {
    const value: unknown = JSON.parse(body.toString("utf8"));
    if (!value || typeof value !== "object" || Object.keys(value).join() !== "p" || !("p" in value) || typeof value.p !== "string" || !value.p || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.p)) throw new Error();
    const decoded = Buffer.from(value.p, "base64");
    if (decoded.toString("base64") !== value.p) throw new Error();
    const text = new TextDecoder("utf-8", { fatal: true }).decode(decoded);
    if (!text.startsWith("#EXTM3U\n") && !text.startsWith("#EXTM3U\r\n")) throw new Error();
    return text;
  } catch { throw new MediaError("invalid_manifest"); }
}
