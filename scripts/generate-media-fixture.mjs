// Original synthetic canvas animation. No third-party images, audio or subtitles.
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320; canvas.height = 180;
    const context = canvas.getContext("2d");
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: "video/mp4;codecs=avc1.42001E", videoBitsPerSecond: 100_000 });
    const chunks = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const finished = new Promise((resolve) => { recorder.onstop = resolve; });
    let frame = 0;
    const draw = () => {
      context.fillStyle = "#201a32"; context.fillRect(0, 0, 320, 180);
      context.fillStyle = "#c6b4ff"; context.fillRect((frame++ * 4) % 280, 70, 40, 40);
    };
    draw(); recorder.start();
    const timer = setInterval(draw, 100);
    await new Promise((resolve) => setTimeout(resolve, 4000));
    recorder.stop(); clearInterval(timer); await finished;
    stream.getTracks().forEach((track) => track.stop());
    return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
  });
  await mkdir("e2e/fixtures", { recursive: true });
  await writeFile("e2e/fixtures/player.mp4", Buffer.from(bytes));
  console.log(`Created synthetic player fixture (${bytes.length} bytes).`);
} finally { await browser.close(); }
