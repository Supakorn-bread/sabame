import { createHash } from "node:crypto";
import { MediaError } from "../types";

export interface SubdlSubtitle {
  vtt: string;
  firstMs: number;
  lastMs: number;
  cueCount: number;
  hash: string;
}

export function subdlSrtToWebVtt(body: Buffer): SubdlSubtitle {
  if (body.length > 1_048_576) throw new MediaError("invalid_subtitle");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new MediaError("invalid_subtitle");
  }
  const blocks = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n[ \t]*\n/);
  if (!blocks.length || blocks.length > 5000)
    throw new MediaError("invalid_subtitle");
  let firstMs = Infinity;
  let lastMs = 0;
  let previous = -1;
  let thaiCues = 0;
  const stamp = (values: string[]) => {
    const [hour, minute, second, millisecond] = values.map(Number);
    if (hour > 23 || minute > 59 || second > 59)
      throw new MediaError("invalid_subtitle");
    return hour * 3_600_000 + minute * 60_000 + second * 1000 + millisecond;
  };
  const cues = blocks.map((block) => {
    const lines = block.split("\n");
    if (/^\d+$/.test(lines[0])) lines.shift();
    const timing =
      /^(\d{2}):(\d{2}):(\d{2}),(\d{3})[ \t]+-->[ \t]+(\d{2}):(\d{2}):(\d{2}),(\d{3})[ \t]*$/.exec(
        lines.shift() ?? "",
      );
    if (!timing) throw new MediaError("invalid_subtitle");
    const start = stamp(timing.slice(1, 5));
    const end = stamp(timing.slice(5, 9));
    if (start < previous || end <= start)
      throw new MediaError("invalid_subtitle");
    previous = start;
    firstMs = Math.min(firstMs, start);
    lastMs = Math.max(lastMs, end);
    const content = lines
      .join("\n")
      .replace(/<[^>]*>/g, "")
      .replace(/\{\\[^}]*\}/g, "")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .trim();
    if (!content || content.length > 10_000)
      throw new MediaError("invalid_subtitle");
    if (/\p{Script=Thai}/u.test(content)) thaiCues++;
    return `${timing[0].trim().replaceAll(",", ".")}\n${content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}`;
  });
  if (!thaiCues || thaiCues / cues.length < 0.5)
    throw new MediaError("invalid_subtitle");
  return {
    vtt: `WEBVTT\n\n${cues.join("\n\n")}\n`,
    firstMs,
    lastMs,
    cueCount: cues.length,
    hash: createHash("sha256").update(body).digest("hex"),
  };
}

export function plausibleSubtitleTiming(
  subtitle: SubdlSubtitle,
  englishVtt: string,
): boolean {
  const times = [
    ...englishVtt.matchAll(
      /(?:^|\n)(\d{2}):(\d{2})(?::(\d{2}))?\.(\d{3})[ \t]+-->[ \t]+(\d{2}):(\d{2})(?::(\d{2}))?\.(\d{3})/g,
    ),
  ];
  const milliseconds = (parts: string[]) =>
    parts[2] === undefined
      ? Number(parts[0]) * 60_000 + Number(parts[1]) * 1000 + Number(parts[3])
      : Number(parts[0]) * 3_600_000 +
        Number(parts[1]) * 60_000 +
        Number(parts[2]) * 1000 +
        Number(parts[3]);
  if (times.length < 20 || subtitle.cueCount < 20) return false;
  const starts = times.map((time) => milliseconds(time.slice(1, 5)));
  const ends = times.map((time) => milliseconds(time.slice(5, 9)));
  const first = Math.min(...starts);
  const last = Math.max(...ends);
  // Runtime bounds reject obvious wrong cuts. They cannot establish synchronization.
  return (
    subtitle.firstMs <= first + 180_000 &&
    Math.abs(subtitle.lastMs - last) <= Math.max(120_000, last * 0.1) &&
    subtitle.lastMs - subtitle.firstMs >= (last - first) * 0.75
  );
}
