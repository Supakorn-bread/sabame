// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./resource-fetch", () => ({ fetchResource: vi.fn() }));
import { type MediaResult } from "../types";
import { appendBilibiliThaiSubtitle } from "./bilibili";
import {
  alignedSubtitleOffset,
  bilibiliJsonToWebVtt,
  type SubtitleCue,
} from "./bilibili-subtitles";
import { deliverResource, prepareDelivery } from "./delivery";
import { fetchResource } from "./resource-fetch";
import { verifyResource } from "./resource-security";

const thaiUrl =
  "https://s.bstarstatic.com/ogv/subtitle/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json?auth_key=fresh";
const englishUrl =
  "https://s.bstarstatic.com/ogv/subtitle/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.json?auth_key=fresh";
const thai = JSON.stringify({
  body: [{ from: 10.87, to: 13.276, content: "สตรีคือทรัพย์สินของวงศ์ตระกูล" }],
});
const reference: SubtitleCue[] = Array.from({ length: 40 }, (_, index) => ({
  startMs: 10_000 + index * 30_000,
  endMs: 14_000 + index * 30_000,
  text: `A substantial unique dialogue sentence number ${index}`,
}));
const jsonCues = (cues = reference) =>
  JSON.stringify({
    body: cues.map((cue) => ({
      from: cue.startMs / 1000,
      to: cue.endMs / 1000,
      content: cue.text,
    })),
  });
const timestamp = (ms: number) =>
  `${Math.floor(ms / 3_600_000)
    .toString()
    .padStart(2, "0")}:${Math.floor((ms / 60_000) % 60)
    .toString()
    .padStart(2, "0")}:${Math.floor((ms / 1000) % 60)
    .toString()
    .padStart(2, "0")}.${(ms % 1000).toString().padStart(3, "0")}`;
const vtt = (offset = 2500, cues = reference) =>
  `WEBVTT\n\n${cues.map((cue) => `${timestamp(cue.startMs + offset)} --> ${timestamp(cue.endMs + offset)}\n<i>${cue.text}</i>`).join("\n\n")}\n`;
const metadata = {
  title: { english: "Another Anime", romaji: "Another Anime" },
  year: 2024,
};
const signal = new AbortController().signal;
function base(): MediaResult {
  return prepareDelivery({
    provider: "animeparadise",
    video: { url: "https://stream.animeparadise.moe/master.m3u8", type: "hls" },
    metadata: { animeId: "mal-100", episodeNumber: 2 },
    thaiStatus: "absent_in_returned_tracks",
    selectionReason: "english_subtitle",
    subtitles: [
      {
        language: "en",
        label: "English",
        url: "https://stream.animeparadise.moe/en.vtt",
        format: "vtt",
        default: true,
        availability: "available",
        displaySupported: true,
        syncStatus: "unverified",
      },
    ],
  });
}
const append = (result = base(), options = {}) =>
  appendBilibiliThaiSubtitle(
    result,
    { ...metadata, ...options } as Parameters<
      typeof appendBilibiliThaiSubtitle
    >[1],
    signal,
  );
function responseFor(value: string | URL | Request) {
  const url = new URL(String(value));
  if (url.pathname.endsWith("search_v2/anime"))
    return {
      items: [
        { title: "Another Anime", season_id: "12345", season_type_enum: 1 },
      ],
    };
  if (url.pathname.endsWith("season_info"))
    return {
      season: {
        title: "Another Anime",
        season_id: "12345",
        season_type_enum: 1,
        player_date: "Oct 9, 2024",
      },
    };
  if (url.pathname.endsWith("episodes"))
    return {
      sections: [
        {
          episodes: [
            { short_title_display: "PV", episode_id: "999", limit: 0 },
            { short_title_display: "E2", episode_id: "2002", limit: 0 },
            { short_title_display: "E1", episode_id: "2001", limit: 0 },
          ],
        },
      ],
    };
  return {
    video_subtitle: [
      { lang_key: "th", srt: { url: thaiUrl } },
      { lang_key: "en", srt: { url: englishUrl } },
    ],
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("MEDIA_PROXY_SECRET", "test-secret-".repeat(5));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => Response.json({ code: 0, data: responseFor(url) })),
  );
  vi.mocked(fetchResource).mockImplementation(async (url) => ({
    body: Buffer.from(
      url === thaiUrl ? thai : url === englishUrl ? jsonCues() : vtt(),
    ),
    url,
    status: 200,
    headers: {},
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("automatic public Bilibili Thai overlay", () => {
  it("discovers a new title and exact episode, dynamically aligns Thai, preserves quality and English default, and delivers VTT", async () => {
    const original = base();
    const result = await append(original);
    expect(result.video).toBe(original.video);
    expect(result.subtitles[0]).toBe(original.subtitles[0]);
    expect(result.selectionReason).toBe("english_subtitle");
    expect(result.thaiStatus).toBe("present");
    expect(result.subtitles[1]).toMatchObject({
      language: "th",
      default: false,
      label: "Thai (Bilibili)",
      format: "vtt",
    });
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toContain(
      "https://api.bilibili.tv/intl/gateway/web/v2/subtitle?s_locale=th_TH&platform=web&episode_id=2002",
    );
    expect(
      verifyResource(
        new URL(
          result.subtitles[1].url,
          "https://sabame.test",
        ).searchParams.get("ticket")!,
      ),
    ).toMatchObject({
      url: thaiUrl,
      kind: "subtitle",
      policy: "bilibili",
      subtitleOffsetMs: 2500,
    });
    const response = await deliverResource(
      new Request(new URL(result.subtitles[1].url, "https://sabame.test")),
    );
    expect(response.headers.get("content-type")).toBe(
      "text/vtt; charset=utf-8",
    );
    expect(await response.text()).toBe(
      "WEBVTT\n\n00:00:13.370 --> 00:00:15.776\nสตรีคือทรัพย์สินของวงศ์ตระกูล\n",
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ redirect: "error", cache: "no-store" }),
    );
  });
  it("accepts different episode offsets and existing fallback English policies", async () => {
    const original = prepareDelivery({
      ...base(),
      provider: "hianime",
      video: { url: "https://hls.dramahot.top/master.m3u8", type: "hls" },
      subtitles: [
        { ...base().subtitles[0], url: "https://hls.dramahot.top/en.vtt" },
      ],
    });
    vi.mocked(fetchResource).mockImplementation(async (url) => ({
      body: Buffer.from(
        url === thaiUrl ? thai : url === englishUrl ? jsonCues() : vtt(-1700),
      ),
      url,
      status: 200,
      headers: {},
    }));
    const result = await append(original);
    expect(result.subtitles).toHaveLength(2);
    expect(result.video).toBe(original.video);
    expect(fetchResource).toHaveBeenCalledWith(
      "https://hls.dramahot.top/en.vtt",
      expect.any(AbortSignal),
      expect.objectContaining({ policy: "hianime" }),
    );
    expect(
      verifyResource(
        new URL(
          result.subtitles[1].url,
          "https://sabame.test",
        ).searchParams.get("ticket")!,
      ).subtitleOffsetMs,
    ).toBe(-1700);
  });
  it("aligns existing supported SRT English through the delivery converter", async () => {
    const original = base();
    original.subtitles[0].format = "srt";
    vi.mocked(fetchResource).mockImplementation(async (url) => ({
      body: Buffer.from(
        url === thaiUrl
          ? thai
          : url === englishUrl
            ? jsonCues()
            : vtt()
                .replace("WEBVTT\n\n", "")
                .replace(/(\d{2}:\d{2}:\d{2})\.(\d{3})/g, "$1,$2"),
      ),
      url,
      status: 200,
      headers: {},
    }));
    expect((await append(original)).subtitles).toHaveLength(2);
  });
  it("rejects series details that disagree with the exact search identity", async () => {
    vi.mocked(fetch).mockImplementation(async (url) =>
      Response.json({
        code: 0,
        data: String(url).includes("season_info")
          ? {
              season: {
                title: "A different season",
                season_id: "12345",
                season_type_enum: 1,
              },
            }
          : responseFor(url),
      }),
    );
    const original = base();
    expect(await append(original)).toBe(original);
  });
  it.each([
    "fuzzy-title",
    "ambiguous-series",
    "wrong-year",
    "ambiguous-episode",
    "missing-episode",
    "limited-episode",
    "wrong-language",
    "wrong-host",
    "wrong-path",
    "duplicate-language",
    "upstream-error",
  ])("fails open for %s", async (failure) => {
    vi.mocked(fetch).mockImplementation(async (url) => {
      let data: Record<string, unknown> = responseFor(url);
      if (String(url).includes("search_v2") && failure === "fuzzy-title")
        data = {
          items: [
            {
              title: "Another Anime Season 2",
              season_id: "12345",
              season_type_enum: 1,
            },
          ],
        };
      if (String(url).includes("search_v2") && failure === "ambiguous-series")
        data = {
          items: [
            { title: "Another Anime", season_id: "12345", season_type_enum: 1 },
            { title: "Another Anime", season_id: "12346", season_type_enum: 1 },
          ],
        };
      if (String(url).includes("season_info") && failure === "wrong-year")
        data = {
          season: {
            title: "Another Anime",
            season_id: "12345",
            season_type_enum: 1,
            player_date: "Oct 9, 2025",
          },
        };
      if (
        String(url).includes("episodes") &&
        ["ambiguous-episode", "missing-episode", "limited-episode"].includes(
          failure,
        )
      )
        data = {
          sections: [
            {
              episodes:
                failure === "missing-episode"
                  ? [
                      {
                        short_title_display: "PV",
                        episode_id: "2002",
                        limit: 0,
                      },
                    ]
                  : Array(failure === "ambiguous-episode" ? 2 : 1).fill({
                      short_title_display: "E2",
                      episode_id: "2002",
                      limit: failure === "limited-episode" ? 1 : 0,
                    }),
            },
          ],
        };
      if (String(url).includes("/subtitle?")) {
        const tracks = data.video_subtitle as {
          lang_key: string;
          srt: { url: string };
        }[];
        if (failure === "wrong-language") tracks[0].lang_key = "id";
        if (failure === "wrong-host")
          tracks[0].srt.url = "https://evil.test/a.json";
        if (failure === "wrong-path")
          tracks[0].srt.url = "https://s.bstarstatic.com/a.json";
        if (failure === "duplicate-language") tracks.push(tracks[0]);
      }
      return Response.json({
        code: failure === "upstream-error" ? -1 : 0,
        data,
      });
    });
    const original = base();
    expect(await append(original)).toBe(original);
  });
  it("does no optional work when Thai already exists, English is missing, or budget is exhausted", async () => {
    const original = base();
    expect(await append({ ...original, subtitles: [] })).toMatchObject({
      subtitles: [],
    });
    expect(
      await append({
        ...original,
        subtitles: [{ ...original.subtitles[0], language: "th" }],
      }),
    ).toMatchObject({ subtitles: [{ language: "th" }] });
    expect(
      await appendBilibiliThaiSubtitle(
        original,
        metadata as Parameters<typeof appendBilibiliThaiSubtitle>[1],
        signal,
        50,
      ),
    ).toBe(original);
    expect(fetch).not.toHaveBeenCalled();
    expect(fetchResource).not.toHaveBeenCalled();
  });
  it("fails open for malformed Thai, oversized metadata, or an unaligned edition", async () => {
    const original = base();
    vi.mocked(fetchResource).mockResolvedValue({
      body: Buffer.from("not JSON"),
      url: thaiUrl,
      status: 200,
      headers: {},
    });
    expect(await append(original)).toBe(original);
    vi.mocked(fetch).mockResolvedValue(new Response(" ".repeat(262_145)));
    expect(await append(original)).toBe(original);
  });
  it("bounds optional work, aborts sibling work, and preserves caller cancellation", async () => {
    vi.useFakeTimers();
    let workSignal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementation((_url, options) => {
      workSignal = options?.signal as AbortSignal;
      return new Promise(() => {});
    });
    const original = base();
    const pending = appendBilibiliThaiSubtitle(
      original,
      metadata as Parameters<typeof appendBilibiliThaiSubtitle>[1],
      signal,
      100,
    );
    await vi.advanceTimersByTimeAsync(101);
    expect(await pending).toBe(original);
    expect(workSignal?.aborted).toBe(true);
    const controller = new AbortController();
    controller.abort();
    await expect(
      appendBilibiliThaiSubtitle(
        original,
        metadata as Parameters<typeof appendBilibiliThaiSubtitle>[1],
        controller.signal,
      ),
    ).rejects.toThrow();
  });
  it("aborts current English work immediately if discovery fails", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("unavailable"));
    let workSignal: AbortSignal | undefined;
    vi.mocked(fetchResource).mockImplementation((_url, value) => {
      workSignal = value;
      return new Promise(() => {});
    });
    const original = base();
    expect(await append(original)).toBe(original);
    expect(workSignal?.aborted).toBe(true);
  });
});

describe("English timing edition verification", () => {
  it.each([1084, -1700, 0, 60_000, -60_000])(
    "derives a stable offset %s",
    (offset) => {
      const shifted = reference.map((cue) => ({
        ...cue,
        startMs: cue.startMs + 60_000,
        endMs: cue.endMs + 60_000,
      }));
      expect(alignedSubtitleOffset(vtt(offset, shifted), shifted)).toBe(offset);
    },
  );
  it.each([
    {
      edits: [
        [506, 0],
        [0, -237],
        [-236, -462],
      ],
    },
    {
      edits: [
        [506, 0],
        [0, -237],
        [506, 0],
      ],
    },
    {
      edits: [
        [-506, 506],
        [-237, 237],
        [-462, 462],
      ],
    },
  ])("accepts independently edited cue boundaries $edits", ({ edits }) => {
    const current = reference.map((cue, index) => {
      const [start = 0, end = 0] = edits[index - 15] ?? [];
      return { ...cue, startMs: cue.startMs + start, endMs: cue.endMs + end };
    });
    expect(alignedSubtitleOffset(vtt(0, current), reference)).toBe(0);
  });
  it.each([2000, -2000])(
    "rejects a local timeline displacement of %s milliseconds",
    (offset) => {
      const current = reference.map((cue, index) =>
        index >= 15 && index < 18
          ? { ...cue, startMs: cue.startMs + offset, endMs: cue.endMs + offset }
          : cue,
      );
      expect(alignedSubtitleOffset(vtt(0, current), reference)).toBeUndefined();
    },
  );
  it("accepts isolated boundary retiming across the episode", () => {
    const current = reference.map((cue, index) =>
      [5, 15, 25].includes(index)
        ? { ...cue, startMs: cue.startMs - 236, endMs: cue.endMs - 462 }
        : cue,
    );
    expect(alignedSubtitleOffset(vtt(0, current), reference)).toBe(0);
  });
  it("rejects too many independent boundary edits", () => {
    const current = reference.map((cue, index) =>
      index >= 15 && index < 20 ? { ...cue, startMs: cue.startMs + 506 } : cue,
    );
    expect(alignedSubtitleOffset(vtt(0, current), reference)).toBeUndefined();
  });
  it.each([
    "wrong-dialogue",
    "too-few",
    "repeated",
    "drift",
    "local-cut",
    "end-mismatch",
    "reordered",
    "outside-bound",
    "poor-coverage",
  ])("rejects %s", (failure) => {
    let current = reference.map((cue) => ({
      ...cue,
      startMs: cue.startMs + 2500,
      endMs: cue.endMs + 2500,
    }));
    if (failure === "wrong-dialogue")
      current = current.map((cue) => ({
        ...cue,
        text: `A different translation of sentence ${cue.startMs}`,
      }));
    if (failure === "too-few") current = current.slice(0, 19);
    if (failure === "repeated") current = current.flatMap((cue) => [cue, cue]);
    if (failure === "drift")
      current = current.map((cue, index) => ({
        ...cue,
        startMs: cue.startMs + index * 10,
        endMs: cue.endMs + index * 10,
      }));
    if (failure === "local-cut")
      current = current.map((cue, index) =>
        index >= 15 && index < 18
          ? { ...cue, startMs: cue.startMs + 2000, endMs: cue.endMs + 2000 }
          : cue,
      );
    if (failure === "end-mismatch")
      current = current.map((cue) => ({ ...cue, endMs: cue.endMs + 1000 }));
    if (failure === "reordered")
      current = current.map((cue, index) => ({
        ...cue,
        text: reference[(index + 20) % 40].text,
      }));
    if (failure === "outside-bound")
      current = current.map((cue) => ({
        ...cue,
        startMs: cue.startMs + 60_000,
        endMs: cue.endMs + 60_000,
      }));
    if (failure === "poor-coverage")
      current.push({
        startMs: 4000000,
        endMs: 4005000,
        text: "An extra unmatched late scene far away",
      });
    expect(alignedSubtitleOffset(vtt(0, current), reference)).toBeUndefined();
  });
  it.each([
    "WEBVTT\n\n00:01.000 --> 00:01.000\nInvalid timing",
    "WEBVTT\n\n00:60.000 --> 01:02.000\nInvalid seconds",
    "WEBVTT\n\n00:02.000 --> 00:03.000\nFirst\n\n00:01.000 --> 00:02.000\nEarlier",
    "WEBVTT\n\nnot-a-time --> 00:02.000\nMalformed timing",
  ])("rejects malformed current timing %s", (text) => {
    expect(() => alignedSubtitleOffset(text, reference)).toThrow(
      "invalid_subtitle",
    );
  });
  it("rejects repeated-only reference matches independently of current duplicates", () => {
    expect(
      alignedSubtitleOffset(
        vtt(),
        reference.flatMap((cue) => [cue, cue]),
      ),
    ).toBeUndefined();
  });
});
describe("Bilibili JSON to WebVTT", () => {
  it("rounds milliseconds, preserves Unicode and multiline text, and escapes cue markup", () => {
    expect(
      bilibiliJsonToWebVtt(
        JSON.stringify({
          body: [
            {
              from: 59.9996,
              to: 61.0014,
              content: "ภาษาไทย & <b>ปลอดภัย</b>\nบรรทัดใหม่",
            },
          ],
        }),
        0,
      ),
    ).toBe(
      "WEBVTT\n\n00:01:00.000 --> 00:01:01.001\nภาษาไทย &amp; &lt;b&gt;ปลอดภัย&lt;/b&gt;\nบรรทัดใหม่\n",
    );
  });
  it("drops fully negative cues and clamps a cue crossing zero for negative offsets", () => {
    expect(
      bilibiliJsonToWebVtt(
        JSON.stringify({
          body: [
            { from: 0, to: 0.5, content: "ภาษาไทย" },
            { from: 0.5, to: 2, content: "ข้ามจุดเริ่มต้น" },
            { from: 3, to: 4, content: "หลังจุดเริ่มต้น" },
          ],
        }),
        -1000,
      ),
    ).toBe(
      "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nข้ามจุดเริ่มต้น\n\n00:00:02.000 --> 00:00:03.000\nหลังจุดเริ่มต้น\n",
    );
  });
  it.each([
    "{}",
    "{bad",
    JSON.stringify({ body: [] }),
    JSON.stringify({ body: [{ from: -1, to: 2, content: "x" }] }),
    JSON.stringify({ body: [{ from: 1, to: 1, content: "x" }] }),
    JSON.stringify({ body: [{ from: 1, to: 1.00001, content: "x" }] }),
    JSON.stringify({ body: [{ from: "1", to: 2, content: "x" }] }),
    JSON.stringify({ body: [{ from: 1, to: 2, content: "" }] }),
    JSON.stringify({
      body: [
        { from: 2, to: 3, content: "x" },
        { from: 1, to: 3, content: "y" },
      ],
    }),
  ])("rejects malformed cues %s", (text) => {
    expect(() => bilibiliJsonToWebVtt(text, 0)).toThrow("invalid_subtitle");
  });
  it("rejects unbounded counts, payloads, timestamps, text and offsets", () => {
    for (const value of [
      { body: Array(5001).fill({ from: 1, to: 2, content: "x" }) },
      { body: [{ from: 1, to: 86_401, content: "x" }] },
      { body: [{ from: 1, to: 2, content: "x".repeat(10_001) }] },
    ])
      expect(() => bilibiliJsonToWebVtt(JSON.stringify(value), 0)).toThrow(
        "invalid_subtitle",
      );
    expect(() => bilibiliJsonToWebVtt(" ".repeat(1_048_577), 0)).toThrow(
      "invalid_subtitle",
    );
    expect(() => bilibiliJsonToWebVtt(thai, Infinity)).toThrow(
      "invalid_subtitle",
    );
    expect(() =>
      bilibiliJsonToWebVtt(
        JSON.stringify({ body: [{ from: 1, to: 2, content: "English only" }] }),
        0,
      ),
    ).toThrow("invalid_subtitle");
  });
});
