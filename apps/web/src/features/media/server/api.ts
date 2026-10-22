import "server-only";
import { randomUUID } from "node:crypto";
import { MediaError, type MediaProviderId } from "../types";
import { withDeadline } from "../resolver";

export function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "Cache-Control": "no-store" } }); }
export async function readMediaRequest(request: Request): Promise<{ episodeNumber: number; provider?: MediaProviderId; serverId?: string; qualityId?: string }> {
  if (!request.body) throw new MediaError("invalid_request");
  const reader = request.body.getReader();
  let body = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 256) throw new MediaError("invalid_request");
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    const payload = JSON.parse(body);
    const episodeNumber = payload?.episodeNumber;
    if (!Number.isSafeInteger(episodeNumber) || episodeNumber < 1 || episodeNumber > 10_000) throw new MediaError("invalid_request");
    if (payload.provider !== undefined && !["animeparadise", "hianime", "anizone", "anifume", "animeruka"].includes(payload.provider)) throw new MediaError("invalid_request");
    if (payload.serverId !== undefined && (payload.provider !== "animeruka" || typeof payload.serverId !== "string" || !/^[1-9]\d{0,2}$/.test(payload.serverId))) throw new MediaError("invalid_request");
    if (payload.qualityId !== undefined && (payload.provider !== "anifume" || typeof payload.qualityId !== "string" || !/^[1-9]\d{2,3}p$/.test(payload.qualityId))) throw new MediaError("invalid_request");
    return { episodeNumber, ...(payload.provider ? { provider: payload.provider } : {}), ...(payload.serverId ? { serverId: payload.serverId } : {}), ...(payload.qualityId ? { qualityId: payload.qualityId } : {}) };
  } catch { throw new MediaError("invalid_request"); }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function readEpisodeNumber(request: Request) { return (await readMediaRequest(request)).episodeNumber; }
export async function api(request: Request, run: (signal: AbortSignal, requestId: string) => Promise<Response>) {
  const requestId = randomUUID();
  try { return await withDeadline(request.signal, 30_000, (signal) => run(signal, requestId)); }
  catch (error) {
    const code = error instanceof MediaError ? error.code : request.signal.aborted ? "cancelled" : "upstream_unavailable";
    console.info(JSON.stringify({ requestId, stage: "api", code }));
    const status = code === "anime_not_found" || code === "no_source" || code === "episode_unavailable" ? 404
      : code === "invalid_request" ? 400
        : code === "invalid_ticket" ? 403
          : code === "source_expired" ? 410
            : code === "mapping_required" ? 409
              : code === "timeout" || code === "resource_timeout" ? 504
                : 502;
    return json({ error: { code, requestId } }, status);
  }
}
