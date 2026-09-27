import "server-only";
import { randomUUID } from "node:crypto";
import { MediaError } from "../types";
import { withDeadline } from "../resolver";

export function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "Cache-Control": "no-store" } }); }
export async function readEpisodeNumber(request: Request) {
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
    const episodeNumber = JSON.parse(body)?.episodeNumber;
    if (!Number.isSafeInteger(episodeNumber) || episodeNumber < 1 || episodeNumber > 10_000) throw new MediaError("invalid_request");
    return episodeNumber as number;
  } catch { throw new MediaError("invalid_request"); }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
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
              : code === "timeout" ? 504
                : 502;
    return json({ error: { code, requestId } }, status);
  }
}
