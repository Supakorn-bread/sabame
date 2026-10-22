import "server-only";
import { MediaError } from "../types";

function timestamp(value: string): number {
  const match = /^(\d{1,2}):([0-5]\d):([0-5]\d)\.(\d{2})$/.exec(value.trim());
  if (!match) throw new MediaError("invalid_subtitle");
  return ((Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000) + Number(match[4]) * 10;
}
function clock(milliseconds: number): string {
  return `${String(Math.floor(milliseconds / 3600000)).padStart(2, "0")}:${String(Math.floor(milliseconds / 60000) % 60).padStart(2, "0")}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, "0")}.${String(milliseconds % 1000).padStart(3, "0")}`;
}
function plainText(value: string): string {
  let drawing = false;
  let text = "";
  for (const part of value.split(/(\{[^}]*\})/)) {
    if (part.startsWith("{")) {
      for (const command of part.matchAll(/\\p(\d+)(?!\d)/g)) drawing = Number(command[1]) > 0;
    } else if (!drawing) text += part;
  }
  return text.replace(/\\[Nn]/g, "\n").replace(/\\h/g, " ").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").split("\n").map((line) => line.trim()).filter(Boolean).join("\n");
}

export function anizoneAssToWebVtt(text: string): string {
  if (Buffer.byteLength(text, "utf8") > 1_048_576 || !/^\[Script Info\]/im.test(text)) throw new MediaError("invalid_subtitle");
  let events = false;
  let fields: string[] = [];
  const cues: { start: number; text: string }[] = [];
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (/^\[/.test(line)) { events = /^\[Events\]\s*$/i.test(line); continue; }
    if (!events) continue;
    if (/^Format:/i.test(line)) {
      fields = line.slice(line.indexOf(":") + 1).split(",").map((field) => field.trim().toLowerCase());
      if (fields.at(-1) !== "text" || !fields.includes("start") || !fields.includes("end") || new Set(fields).size !== fields.length) throw new MediaError("invalid_subtitle");
    }
    if (!/^Dialogue:/i.test(line)) continue;
    if (!fields.length || cues.length >= 20_000) throw new MediaError("invalid_subtitle");
    const values = line.slice(line.indexOf(":") + 1).split(",");
    if (values.length < fields.length) throw new MediaError("invalid_subtitle");
    const start = timestamp(values[fields.indexOf("start")]);
    const end = timestamp(values[fields.indexOf("end")]);
    if (end <= start) throw new MediaError("invalid_subtitle");
    const content = plainText(values.slice(fields.length - 1).join(","));
    if (content) cues.push({ start, text: `${clock(start)} --> ${clock(end)}\n${content}` });
  }
  if (!cues.length) throw new MediaError("invalid_subtitle");
  return `WEBVTT\n\n${cues.sort((a, b) => a.start - b.start).map((cue) => cue.text).join("\n\n")}\n`;
}
