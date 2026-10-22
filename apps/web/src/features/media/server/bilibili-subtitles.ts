import { MediaError } from "../types";

export interface SubtitleCue {
  startMs: number;
  endMs: number;
  text: string;
}

export function readBilibiliCues(text: string): SubtitleCue[] {
  if (Buffer.byteLength(text, "utf8") > 1_048_576)
    throw new MediaError("invalid_subtitle");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new MediaError("invalid_subtitle");
  }
  if (
    !value ||
    typeof value !== "object" ||
    !("body" in value) ||
    !Array.isArray(value.body) ||
    !value.body.length ||
    value.body.length > 5000
  )
    throw new MediaError("invalid_subtitle");
  let previousStart = -1;
  return value.body.map((cue: unknown) => {
    if (
      !cue ||
      typeof cue !== "object" ||
      !("from" in cue) ||
      !("to" in cue) ||
      !("content" in cue) ||
      typeof cue.from !== "number" ||
      typeof cue.to !== "number" ||
      !Number.isFinite(cue.from) ||
      !Number.isFinite(cue.to) ||
      cue.from < previousStart ||
      cue.from < 0 ||
      cue.to <= cue.from ||
      cue.to > 86_400 ||
      typeof cue.content !== "string" ||
      !cue.content.trim() ||
      cue.content.length > 10_000
    )
      throw new MediaError("invalid_subtitle");
    previousStart = cue.from;
    const startMs = Math.round(cue.from * 1000);
    const endMs = Math.round(cue.to * 1000);
    if (endMs <= startMs) throw new MediaError("invalid_subtitle");
    return { startMs, endMs, text: cue.content };
  });
}

function normalizeDialogue(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&(?:nbsp|quot|apos);/g, " ")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function readWebVttCues(text: string): SubtitleCue[] {
  if (
    Buffer.byteLength(text, "utf8") > 1_048_576 ||
    !/^WEBVTT(?:\s|$)/.test(text.trimStart())
  )
    throw new MediaError("invalid_subtitle");
  const milliseconds = (value: string) =>
    Math.round(
      value.split(":").reduce((total, part) => total * 60 + Number(part), 0) *
        1000,
    );
  let previousStart = -1;
  const cues = text.split(/\r?\n\s*\r?\n/).flatMap((block) => {
    const lines = block.split(/\r?\n/);
    const index = lines.findIndex((line) => line.includes(" --> "));
    const timing =
      /^(\d{2}:\d{2}(?::\d{2})?\.\d{3}) --> (\d{2}:\d{2}(?::\d{2})?\.\d{3})(?:\s|$)/.exec(
        lines[index] ?? "",
      );
    if (index < 0) return [];
    if (
      !timing ||
      timing.slice(1).some((value) =>
        value
          .split(":")
          .slice(-2)
          .some((part) => Number(part) >= 60),
      )
    )
      throw new MediaError("invalid_subtitle");
    const startMs = milliseconds(timing[1]);
    const endMs = milliseconds(timing[2]);
    if (startMs < previousStart || endMs <= startMs || endMs > 86_400_000)
      throw new MediaError("invalid_subtitle");
    previousStart = startMs;
    return [{ startMs, endMs, text: lines.slice(index + 1).join("\n") }];
  });
  if (!cues.length || cues.length > 5000)
    throw new MediaError("invalid_subtitle");
  return cues;
}

export function alignedSubtitleOffset(
  currentWebVtt: string,
  reference: SubtitleCue[],
): number | undefined {
  const unique = (cues: SubtitleCue[]) => {
    const values = new Map<string, SubtitleCue | null>();
    for (const cue of cues) {
      const text = normalizeDialogue(cue.text);
      if (text.length < 16 || text.split(" ").length < 3) continue;
      values.set(text, values.has(text) ? null : cue);
    }
    return values;
  };
  const currentCues = readWebVttCues(currentWebVtt);
  const current = unique(currentCues);
  const pairs = [...unique(reference)].flatMap(([text, source]) => {
    const target = current.get(text);
    return source && target
      ? [
          {
            source,
            target,
            start: target.startMs - source.startMs,
            end: target.endMs - source.endMs,
          },
        ]
      : [];
  });
  if (
    pairs.length < 20 ||
    pairs.some(
      (pair, index) =>
        index > 0 && pair.target.startMs <= pairs[index - 1].target.startMs,
    )
  )
    return;
  const median = (values: number[]) => {
    const sorted = values.toSorted((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  const offset = Math.round(median(pairs.map((pair) => pair.start)));
  if (Math.abs(offset) > 60_000) return;
  const isConsistent = (pair: (typeof pairs)[number]) =>
    Math.abs(pair.start - offset) <= 150 && Math.abs(pair.end - offset) <= 150;
  let displacedRun = 0;
  for (const pair of pairs) {
    const startResidual = pair.start - offset;
    const endResidual = pair.end - offset;
    const displaced =
      (startResidual > 150 && endResidual > 150) ||
      (startResidual < -150 && endResidual < -150);
    displacedRun = displaced ? displacedRun + 1 : 0;
    if (displacedRun >= 3) return;
  }
  const consistent = pairs.filter(isConsistent);
  if (consistent.length < 20 || consistent.length / pairs.length < 0.9) return;
  const first = reference[0]?.startMs;
  const last = reference.at(-1)?.endMs;
  if (first === undefined || last === undefined || last <= first) return;
  const currentFirst = Math.min(...currentCues.map((cue) => cue.startMs));
  const currentLast = Math.max(...currentCues.map((cue) => cue.endMs));
  const targetPositions = consistent.map((pair) => pair.target.startMs);
  if (
    Math.max(...targetPositions) - Math.min(...targetPositions) <
    (currentLast - currentFirst) * 0.7
  )
    return;
  const span = last - first;
  const positions = consistent.map((pair) => pair.source.startMs);
  if (Math.max(...positions) - Math.min(...positions) < span * 0.7) return;
  const thirds = [0, 1, 2].map((third) =>
    consistent.filter(
      (pair) =>
        Math.min(2, Math.floor(((pair.source.startMs - first) / span) * 3)) ===
        third,
    ),
  );
  if (thirds.some((matches) => matches.length < 3)) return;
  const offsets = thirds.map((matches) =>
    median(matches.map((pair) => pair.start)),
  );
  if (Math.max(...offsets) - Math.min(...offsets) > 100) return;
  return offset;
}

export function bilibiliJsonToWebVtt(text: string, offsetMs: number): string {
  if (!Number.isSafeInteger(offsetMs) || Math.abs(offsetMs) > 60_000)
    throw new MediaError("invalid_subtitle");
  const source = readBilibiliCues(text);
  if (!source.some((cue) => /\p{Script=Thai}/u.test(cue.text)))
    throw new MediaError("invalid_subtitle");
  const timestamp = (milliseconds: number) =>
    `${Math.floor(milliseconds / 3_600_000)
      .toString()
      .padStart(2, "0")}:${Math.floor((milliseconds / 60_000) % 60)
      .toString()
      .padStart(2, "0")}:${Math.floor((milliseconds / 1000) % 60)
      .toString()
      .padStart(2, "0")}.${(milliseconds % 1000).toString().padStart(3, "0")}`;
  const cues = source.flatMap((cue) => {
    const start = Math.max(0, cue.startMs + offsetMs);
    const end = cue.endMs + offsetMs;
    if (end <= start) return [];
    const content = cue.text
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .replace(/\n[\t ]*\n+/g, "\n")
      .trim()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    if (!content) throw new MediaError("invalid_subtitle");
    return [`${timestamp(start)} --> ${timestamp(end)}\n${content}`];
  });
  if (!cues.length) throw new MediaError("invalid_subtitle");
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}
