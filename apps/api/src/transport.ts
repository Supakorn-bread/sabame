import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import { appOrigin } from "./mal/config.js";

export async function handle(
  req: ExpressRequest,
  res: ExpressResponse,
  run: (request: Request) => Promise<Response>,
) {
  const abort = new AbortController();
  const disconnected = () => {
    if (!res.writableEnded) abort.abort();
  };
  res.once("close", disconnected);
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (value !== undefined)
        headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
    // The browser's canonical origin is configured, never inferred from
    // attacker-controlled Host / X-Forwarded-Host headers.
    const request = new Request(new URL(req.originalUrl, appOrigin()), {
      method: req.method,
      headers,
      signal: abort.signal,
      ...(req.method !== "GET" &&
      req.method !== "HEAD" &&
      Buffer.isBuffer(req.body)
        ? { body: new Uint8Array(req.body) }
        : {}),
    });
    await writeWebResponse(res, await run(request));
  } finally {
    res.off("close", disconnected);
  }
}

export async function writeWebResponse(
  res: ExpressResponse,
  response: Response,
) {
  res.status(response.status);
  for (const [name, value] of response.headers)
    if (name !== "set-cookie") res.setHeader(name, value);
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader("Set-Cookie", cookies);
  res.send(Buffer.from(await response.arrayBuffer()));
}
