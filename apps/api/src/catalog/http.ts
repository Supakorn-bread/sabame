import { randomUUID } from "node:crypto";
import { MediaError } from "@sabame/domain/media";
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export async function api(
  request: Request,
  run: (signal: AbortSignal, requestId: string) => Promise<Response>,
) {
  const requestId = randomUUID();
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
  try {
    return await run(signal, requestId);
  } catch (error) {
    const code =
      error instanceof MediaError
        ? error.code
        : signal.aborted
          ? "timeout"
          : "upstream_unavailable";
    const status = [
      "anime_not_found",
      "no_source",
      "episode_unavailable",
    ].includes(code)
      ? 404
      : code === "invalid_request"
        ? 400
        : code === "mapping_required"
          ? 409
          : code === "timeout"
            ? 504
            : 502;
    console.info(JSON.stringify({ requestId, stage: "api", code }));
    return json({ error: { code, requestId } }, status);
  }
}
