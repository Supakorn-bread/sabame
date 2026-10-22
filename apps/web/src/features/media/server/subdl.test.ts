// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./resource-fetch", () => ({ fetchResource: vi.fn() }));
import type { MediaResult } from "../types";
import { fetchResource } from "./resource-fetch";
import { prepareDelivery, deliverResource } from "./delivery";
import { appendSubdlThaiSubtitle } from "./subdl";
import { plausibleSubtitleTiming, subdlSrtToWebVtt } from "./subdl-subtitles";
import {
  signResource,
  verifyResource,
  validatePolicyResource,
} from "./resource-security";
import type { fetchMetadata } from "./catalog";

const publicUrl = "https://dl.subdl.com/subtitle/packToken/fileToken";
const englishUrl = "https://hls.dramahot.top/en.vtt";
const rawSrt = Array.from({ length: 30 }, (_, index) => {
  const minute = String(index).padStart(2, "0");
  return `${index + 1}\n00:${minute}:01,000 --> 00:${minute}:03,000\nสวัสดี ${index}`;
}).join("\n\n");
const englishVtt = `WEBVTT\n\n${rawSrt.replaceAll(",", ".").replaceAll("สวัสดี", "Hello")}`;
const raw = () => Buffer.from(rawSrt);
const metadata = { title: { english: "Example Story" } } as Awaited<
  ReturnType<typeof fetchMetadata>
>;
function result(): MediaResult {
  return prepareDelivery({
    provider: "hianime",
    video: { type: "hls", url: "https://hls.dramahot.top/master.m3u8" },
    metadata: { animeId: "mal-1", episodeNumber: 1 },
    thaiStatus: "absent_in_returned_tracks",
    selectionReason: "english_subtitle",
    subtitles: [
      {
        language: "en",
        label: "English",
        url: englishUrl,
        format: "vtt",
        default: true,
        availability: "available",
        displaySupported: true,
        syncStatus: "unverified",
      },
    ],
  });
}
function resource(body: Buffer, url = publicUrl) {
  return { body, url, status: 200, headers: {} };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("MEDIA_PROXY_SECRET", "test-secret-".repeat(5));
  vi.stubEnv("BACKEND_URL", "http://127.0.0.1:4000");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("memory-only SubDL delivery", () => {
  it("converts Thai SRT to safe VTT and refuses malformed, non-Thai, binary, and oversized input", () => {
    expect(
      subdlSrtToWebVtt(
        Buffer.from(
          "1\n00:00:01,000 --> 00:00:02,000\n<b>สวัสดี</b> & <script>x</script>",
        ),
      ).vtt,
    ).toBe("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nสวัสดี &amp; x\n");
    for (const body of [
      Buffer.from("PK\x03\x04"),
      Buffer.from([255]),
      Buffer.alloc(1_048_577),
      Buffer.from("1\n00:00:02,000 --> 00:00:01,000\nสวัสดี"),
      Buffer.from("1\n00:00:01,000 --> 00:00:02,000\nHello"),
    ])
      expect(() => subdlSrtToWebVtt(body)).toThrow("invalid_subtitle");
  });
  it("rejects implausible runtime differences without claiming timing synchronization", () => {
    const subtitle = subdlSrtToWebVtt(raw());
    expect(plausibleSubtitleTiming(subtitle, englishVtt)).toBe(true);
    expect(
      plausibleSubtitleTiming({ ...subtitle, lastMs: 6_000_000 }, englishVtt),
    ).toBe(false);
    expect(
      plausibleSubtitleTiming({ ...subtitle, firstMs: 500_000 }, englishVtt),
    ).toBe(false);
    expect(
      plausibleSubtitleTiming({ ...subtitle, cueCount: 2 }, englishVtt),
    ).toBe(false);
  });
  it("appends a selectable, unverified Thai track and keeps English selected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ candidates: [{ url: publicUrl }] })),
    );
    vi.mocked(fetchResource)
      .mockResolvedValueOnce(resource(Buffer.from(englishVtt), englishUrl))
      .mockResolvedValueOnce(resource(raw()));
    const updated = await appendSubdlThaiSubtitle(
      result(),
      metadata,
      new AbortController().signal,
    );
    expect(
      updated.subtitles.map(
        ({ language, default: selected, syncStatus, label }) => ({
          language,
          selected,
          syncStatus,
          label,
        }),
      ),
    ).toEqual([
      {
        language: "en",
        selected: true,
        syncStatus: "unverified",
        label: "English",
      },
      {
        language: "th",
        selected: false,
        syncStatus: "unverified",
        label: "Thai (SubDL, timing unverified)",
      },
    ]);
    expect(updated.thaiStatus).toBe("present");
    const track = updated.subtitles[1];
    const ticket = verifyResource(
      new URL(track.url, "https://sabame.test").searchParams.get("ticket")!,
    );
    expect(ticket).toMatchObject({
      url: publicUrl,
      policy: "subdl",
      kind: "subtitle",
    });
    vi.mocked(fetchResource).mockResolvedValueOnce(resource(raw()));
    const delivered = await deliverResource(
      new Request(new URL(track.url, "https://sabame.test")),
    );
    expect(delivered.headers.get("cache-control")).toBe("private, no-store");
    expect(delivered.headers.get("content-type")).toBe(
      "text/vtt; charset=utf-8",
    );
    expect(await delivered.text()).toBe(subdlSrtToWebVtt(raw()).vtt);
  });
  it("returns playable media unchanged on failure or mismatched timings", async () => {
    const original = result();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ candidates: [{ url: publicUrl }] })),
    );
    vi.mocked(fetchResource)
      .mockResolvedValueOnce(
        resource(Buffer.from(englishVtt.replaceAll("00:", "02:")), englishUrl),
      )
      .mockResolvedValueOnce(resource(raw()));
    expect(
      await appendSubdlThaiSubtitle(
        original,
        metadata,
        new AbortController().signal,
      ),
    ).toBe(original);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("unavailable");
      }),
    );
    vi.mocked(fetchResource).mockResolvedValueOnce(
      resource(Buffer.from(englishVtt), englishUrl),
    );
    expect(
      await appendSubdlThaiSubtitle(
        original,
        metadata,
        new AbortController().signal,
      ),
    ).toBe(original);
  });
  it("keeps media unchanged when no Thai candidate exists or another Thai track is already playable", async () => {
    const original = result();
    const fetcher = vi.fn(async () => Response.json({ candidates: [] }));
    vi.stubGlobal("fetch", fetcher);
    vi.mocked(fetchResource).mockResolvedValueOnce(
      resource(Buffer.from(englishVtt), englishUrl),
    );
    expect(
      await appendSubdlThaiSubtitle(
        original,
        metadata,
        new AbortController().signal,
      ),
    ).toBe(original);
    const withThai = {
      ...original,
      subtitles: [
        ...original.subtitles,
        { ...original.subtitles[0], language: "th" },
      ],
    };
    expect(
      await appendSubdlThaiSubtitle(
        withThai,
        metadata,
        new AbortController().signal,
      ),
    ).toBe(withThai);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects secret-bearing URLs, media kinds, and content changed since validation", async () => {
    expect(() =>
      validatePolicyResource(
        `${publicUrl}?api_key=secret`,
        "subdl",
        "subtitle",
      ),
    ).toThrow("invalid_resource");
    expect(() => validatePolicyResource(publicUrl, "subdl", "mp4")).toThrow(
      "invalid_resource",
    );
    const signed = signResource({
      url: publicUrl,
      kind: "subtitle",
      policy: "subdl",
      subtitleHash: subdlSrtToWebVtt(raw()).hash,
      exp: Date.now() + 60_000,
    });
    vi.mocked(fetchResource).mockResolvedValueOnce(
      resource(Buffer.from(rawSrt.replace("สวัสดี 0", "สวัสดี 99"))),
    );
    await expect(
      deliverResource(new Request(new URL(signed, "https://sabame.test"))),
    ).rejects.toThrow("source_expired");
  });
});
