// @vitest-environment node
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { anizoneAssToWebVtt } from "./anizone-subtitles";
const ass = (lines: string) => `[Script Info]\nTitle: Synthetic fixture\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${lines}`;
it("converts ASS timing, commas, styles and line breaks to safe plain WebVTT", () => {
  expect(anizoneAssToWebVtt(ass("Dialogue: 0,0:00:01.23,0:00:03.45,Default,,0,0,0,,{\\b1}Hello, world!{\\b0}\\N<ruby>& test\\htext"))).toBe("WEBVTT\n\n00:00:01.230 --> 00:00:03.450\nHello, world!\n&lt;ruby&gt;&amp; test text\n");
});
it("orders cues and removes drawings and internal blank lines", () => {
  expect(anizoneAssToWebVtt(ass("Dialogue: 0,0:00:09.00,0:00:10.00,Default,,0,0,0,,Later\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\p1}m 0 0 l 1 1{\\p0}First\\N\\N  \\Nline"))).toBe("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nFirst\nline\n\n00:00:09.000 --> 00:00:10.000\nLater\n");
});
it("uses declared event format order", () => {
  expect(anizoneAssToWebVtt("[Script Info]\n[Events]\nFormat: End, Start, Text\nDialogue: 0:00:02.00,0:00:01.00,Text, with comma")).toBe("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nText, with comma\n");
});
it.each(["not subtitles", ass(""), ass("Dialogue: 0,bad,0:00:02.00,Default,,0,0,0,,Text"), ass("Dialogue: 0,0:00:03.00,0:00:02.00,Default,,0,0,0,,Text"), ass("Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\p1}m 0 0")])("rejects unusable or invalid ASS", (text) => expect(() => anizoneAssToWebVtt(text)).toThrow("invalid_subtitle"));
