import { readFile } from "node:fs/promises";

export async function probeBrowser({ origin, videoUrl, videoType, timeoutMs = 30000, signal }) {
  const result = {
    playback: { status: "not_run", code: "browser_unavailable" },
    seek: { status: "not_run", code: "playback_required" },
  };
  let browser;
  let stage = "launch";
  let unavailableCode = "browser_dependency_unavailable";
  let timedOut = false;
  let blockedRequest = false;
  const controller = new AbortController();
  const abort = () => controller.abort();
  const close = () => browser?.close().catch(() => {});
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  signal?.addEventListener("abort", abort, { once: true });
  controller.signal.addEventListener("abort", close);
  const started = Date.now();
  const remaining = () => Math.max(1, timeoutMs - (Date.now() - started));
  try {
    const base = new URL(origin);
    const allowed = (value) => {
      const url = new URL(value, base);
      return url.origin === base.origin && !url.username && !url.password && !url.hash
        && url.pathname === "/api/media/resource" && [...url.searchParams.keys()].join() === "ticket"
        && Boolean(url.searchParams.get("ticket"));
    };
    if (!["http:", "https:"].includes(base.protocol) || !allowed(videoUrl)) {
      result.playback = { status: "fail", code: "invalid_browser_resource" };
      return result;
    }
    if (signal?.aborted) controller.abort();
    if (controller.signal.aborted) throw new Error("aborted");
    const { chromium } = await import("@playwright/test");
    unavailableCode = "hls_library_unavailable";
    const hlsScript = await readFile(new URL(import.meta.resolve("hls.js/dist/hls.min.js")), "utf8");
    unavailableCode = "browser_unavailable";
    browser = await chromium.launch({
      headless: true,
      timeout: remaining(),
      args: ["--autoplay-policy=no-user-gesture-required", "--disable-application-cache",
        "--disable-gpu-shader-disk-cache"],
    });
    if (controller.signal.aborted) throw new Error("aborted");
    stage = "playback";
    const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
    const page = await context.newPage();
    const harness = new URL("/__sabame_media_probe__", base).href;
    await context.route("**/*", async (route) => {
      const request = route.request();
      if (request.url() === harness && request.isNavigationRequest()) {
        await route.fulfill({ contentType: "text/html", body: "<!doctype html><video muted playsinline></video>" });
      } else if (request.method() === "GET" && allowed(request.url())) {
        await route.continue();
      } else {
        blockedRequest = true;
        await route.abort();
      }
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Response" }] });
    cdp.on("Fetch.requestPaused", (event) => {
      const redirect = event.responseStatusCode >= 300 && event.responseStatusCode < 400;
      if (redirect) blockedRequest = true;
      void cdp.send(redirect ? "Fetch.failRequest" : "Fetch.continueResponse", redirect
        ? { requestId: event.requestId, errorReason: "BlockedByClient" }
        : { requestId: event.requestId }).catch(() => {});
    });
    await page.goto(harness, { timeout: remaining(), waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: hlsScript });
    await page.evaluate(({ url, type }) => {
      const video = document.querySelector("video");
      video.muted = true;
      video.preload = "metadata";
      window.probe = { video, seeked: false, error: false };
      video.addEventListener("error", () => { window.probe.error = true; });
      video.addEventListener("seeked", () => { window.probe.seeked = true; });
      if (/hls|mpegurl/i.test(type) && window.Hls.isSupported()) {
        const hls = new window.Hls({ enableWorker: false, maxBufferLength: 8,
          maxMaxBufferLength: 12, backBufferLength: 0, maxBufferSize: 8 * 1024 * 1024,
          manifestLoadingMaxRetry: 0, levelLoadingMaxRetry: 0, fragLoadingMaxRetry: 0 });
        window.probe.hls = hls;
        hls.on(window.Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) window.probe.error = true;
        });
        hls.loadSource(url);
        hls.attachMedia(video);
      } else video.src = url;
      void video.play().catch(() => { window.probe.error = true; });
    }, { url: new URL(videoUrl, base).href, type: videoType });
    await page.waitForFunction(() => {
      const { video, error } = window.probe;
      if (error) throw new Error("media_error");
      return !video.paused && !video.seeking && video.readyState >= 2
        && video.videoWidth > 0 && video.videoHeight > 0;
    }, null, { timeout: remaining() });
    const initial = await page.evaluate(() => ({ time: window.probe.video.currentTime, clock: performance.now() }));
    await page.waitForFunction(({ time, clock }) => {
      const { video, error } = window.probe;
      if (error) throw new Error("media_error");
      return !video.seeking && !video.paused && performance.now() - clock >= 600 && video.currentTime - time >= 0.6;
    }, initial, { timeout: remaining() });
    if (blockedRequest) throw new Error("blocked");
    result.playback = await page.evaluate(({ time, started }) => ({ status: "pass",
      durationMs: Date.now() - started, videoWidth: window.probe.video.videoWidth,
      videoHeight: window.probe.video.videoHeight, progressSeconds: window.probe.video.currentTime - time,
    }), { time: initial.time, started });
    stage = "seek";
    const seek = await page.evaluate(() => {
      const { video } = window.probe;
      video.pause();
      const duration = video.duration;
      const ranges = Array.from({ length: video.buffered.length }, (_, i) => [video.buffered.start(i), video.buffered.end(i)]);
      const target = [0.65, 0.4, 0.85].map((fraction) => duration * fraction).find((candidate) =>
        Number.isFinite(candidate) && candidate >= video.currentTime + 10 && candidate < duration - 3
        && ranges.every(([start, end]) => candidate < start - 2 || candidate > end + 2));
      if (target === undefined) return null;
      window.probe.seeked = false;
      video.currentTime = target;
      return { targetSeconds: target, bufferedEndSeconds: Math.max(0, ...ranges.map((range) => range[1])) };
    });
    if (!seek) {
      result.seek = { status: "not_run", code: "no_distant_unbuffered_target" };
      return result;
    }
    await page.waitForFunction((target) => {
      const { video, seeked, error } = window.probe;
      if (error) throw new Error("media_error");
      return seeked && !video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - target) < 1.5;
    }, seek.targetSeconds, { timeout: remaining() });
    const resumed = await page.evaluate(async () => {
      const { video } = window.probe;
      await video.play();
      return { time: video.currentTime, clock: performance.now() };
    });
    await page.waitForFunction(({ time, clock }) => {
      const { video, error } = window.probe;
      if (error) throw new Error("media_error");
      return !video.seeking && !video.paused && performance.now() - clock >= 600 && video.currentTime - time >= 0.6;
    }, resumed, { timeout: remaining() });
    if (blockedRequest) throw new Error("blocked");
    result.seek = { status: "pass", ...seek, ...await page.evaluate((time) => ({
      reachedSeconds: window.probe.video.currentTime,
      resumeProgressSeconds: window.probe.video.currentTime - time,
    }), resumed.time), durationMs: Date.now() - started };
  } catch {
    const code = timedOut ? "browser_timeout" : controller.signal.aborted ? "browser_aborted"
      : blockedRequest ? "browser_request_blocked" : stage === "launch" ? unavailableCode : "browser_media_failed";
    if (stage !== "seek") result.playback = { status: stage === "launch" ? "not_run" : "fail", code };
    else result.seek = { status: "fail", code };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", close);
    await close();
  }
  return result;
}
