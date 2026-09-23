// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { fetchSchedule } from "./client";

beforeEach(() => vi.stubEnv("ANIMESCHEDULE_API_TOKEN", "secret-app-token"));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("AnimeSchedule timetable client", () => {
  it("uses the documented bearer header, timezone, week, and air type, then normalizes fields", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json([{
      title: "Blue Comet",
      route: "blue-comet",
      imageVersionRoute: "blue-comet-v3",
      airType: "Sub",
      episodeNumber: 6,
      episodeDate: "2026-05-01T10:00:00Z",
      synopsis: "field is not passed to the client",
    }]));
    vi.stubGlobal("fetch", fetcher);

    const result = await fetchSchedule({ year: 2026, week: 18 }, "Asia/Tokyo", "sub");

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://animeschedule.net/api/v3/timetables/sub?year=2026&week=18&tz=Asia%2FTokyo");
    expect(options.headers).toEqual({ Accept: "application/json", Authorization: "Bearer secret-app-token" });
    expect(result[0]).toMatchObject({ title: "Blue Comet", imageVersionRoute: "blue-comet-v3", episodeNumber: 6 });
    expect(result[0]).not.toHaveProperty("synopsis");
  });

  it("reports missing credentials before issuing a network request", async () => {
    vi.stubEnv("ANIMESCHEDULE_API_TOKEN", "");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    await expect(fetchSchedule({ year: 2026, week: 18 }, "UTC", "all")).rejects.toMatchObject({ code: "not_configured" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects a malformed API collection and oversized responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ items: [] })));
    await expect(fetchSchedule({ year: 2026, week: 19 }, "UTC", "all")).rejects.toMatchObject({ code: "invalid_payload" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("[]", { headers: { "content-length": "2000001" } })));
    await expect(fetchSchedule({ year: 2026, week: 20 }, "UTC", "all")).rejects.toMatchObject({ code: "invalid_payload" });
  });

  it("maps upstream failures and request deadlines to stable error codes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })));
    await expect(fetchSchedule({ year: 2026, week: 21 }, "UTC", "all")).rejects.toMatchObject({ code: "upstream_unavailable" });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new DOMException("timeout", "TimeoutError")));
    await expect(fetchSchedule({ year: 2026, week: 22 }, "UTC", "all")).rejects.toMatchObject({ code: "timeout" });
  });

  it("coalesces concurrent same-key requests", async () => {
    let resolveResponse!: (response: Response) => void;
    const fetcher = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { resolveResponse = resolve; }));
    vi.stubGlobal("fetch", fetcher);
    const first = fetchSchedule({ year: 2026, week: 23 }, "UTC", "all");
    const second = fetchSchedule({ year: 2026, week: 23 }, "UTC", "all");
    resolveResponse(Response.json([]));

    await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
