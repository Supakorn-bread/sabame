import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadCases, parseArgs } from "./probe-thai-media.mjs";

const script = fileURLToPath(new URL("./probe-thai-media.mjs", import.meta.url));
const fixtureFile = fileURLToPath(new URL("./fixtures/thai-media-cases.json", import.meta.url));

function mp4Range(start, end) {
  const body = Buffer.alloc(end - start + 1, 0x31);
  if (start === 0) {
    body.writeUInt32BE(24, 0);
    body.write("ftyp", 4, "ascii");
  }
  return body;
}

function tsSegment() {
  const body = Buffer.alloc(1024, 0x21);
  for (const offset of [0, 188, 376, 564, 752]) body[offset] = 0x47;
  return body;
}

function listen(server) {
  server.listen(0, "127.0.0.1");
  return once(server, "listening").then(() => `http://127.0.0.1:${server.address().port}`);
}

async function launchCli(args) {
  const child = spawn(process.execPath, [script, ...args], { cwd: path.dirname(script) });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  const [exitCode] = await once(child, "close");
  return { exitCode, stdout, stderr };
}

async function startFixture() {
  const rangeRequests = [];
  let redirectHits = 0;
  let evilHits = 0;
  let evilOrigin;
  const evil = createServer((_request, response) => {
    evilHits += 1;
    response.end("secret redirect target");
  });
  evilOrigin = await listen(evil);
  const app = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://fixture.local").pathname;
    if (pathname === "/redirect-target") {
      redirectHits += 1;
      response.end("redirect should not be followed");
      return;
    }
    const match = /^\/api\/anime\/(mal-\d+)\/media$/.exec(pathname);
    if (request.method === "POST" && match) {
      const animeId = match[1];
      let payload = "";
      for await (const part of request) payload += part;
      const input = JSON.parse(payload);
      const provider = input.provider;
      if (animeId === "mal-1002") {
        response.writeHead(502, { "Content-Type": "application/json" }).end(JSON.stringify({ error: { code: "provider_unavailable", message: "SECRET upstream text" } }));
        return;
      }
      if (animeId === "mal-1003") {
        response.writeHead(200, { "Content-Type": "text/html" }).end("<!doctype html><html>SECRET html body</html>");
        return;
      }
      if (animeId === "mal-1004") {
        response.writeHead(200, { "Content-Type": "application/json" }).end("{malformed SECRET body");
        return;
      }
      if (animeId === "mal-1005") {
        response.writeHead(302, { Location: "/redirect-target" }).end();
        return;
      }
      const ticket = {
        "mal-1001": "secret-mp4-ticket",
        "mal-1006": "secret-off-origin-ticket",
        "mal-1008": "bad-initial-range",
        "mal-1009": "secret-hls-root-ticket",
        "mal-1010": "bad-later-range",
        "mal-1011": "html-hls-manifest",
        "mal-1012": "large-hls-manifest",
        "mal-1013": "redirect-hls-manifest",
      }[animeId] ?? "oversize-json-ticket";
      const type = provider === "anifume" ? "mp4" : "hls";
      const videoUrl = animeId === "mal-1006"
        ? `${evilOrigin}/api/media/resource?ticket=${ticket}`
        : `/api/media/resource?ticket=${ticket}`;
      const result = {
        provider: animeId === "mal-1014" ? "animeruka" : provider,
        metadata: { animeId, episodeNumber: input.episodeNumber },
        video: { type, url: videoUrl },
        ...(animeId === "mal-1015" ? {} : { embeddedSubtitles: { language: "th", label: "Thai (embedded)", removable: false } }),
        subtitles: [],
      };
      const body = Buffer.from(JSON.stringify(result));
      if (animeId === "mal-1007") {
        response.writeHead(200, { "Content-Type": "application/json" }).end(Buffer.concat([body, Buffer.alloc(1_048_577, 0x20)]));
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" }).end(body);
      return;
    }
    if (pathname === "/api/media/resource") {
      const url = new URL(request.url, "http://fixture.local");
      const ticket = url.searchParams.get("ticket");
      if (ticket === "redirect-hls-manifest") {
        response.writeHead(302, { Location: `${evilOrigin}/secret-target` }).end();
        return;
      }
      if (ticket === "html-hls-manifest") {
        response.writeHead(200, { "Content-Type": "text/html" }).end("<html>SECRET media challenge</html>");
        return;
      }
      if (ticket === "large-hls-manifest") {
        response.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl" }).end(Buffer.alloc(1_048_577, 0x41));
        return;
      }
      if (ticket === "secret-hls-root-ticket") {
        response.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl" }).end("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100000\n/api/media/resource?ticket=secret-hls-variant-ticket\n");
        return;
      }
      if (ticket === "secret-hls-variant-ticket") {
        response.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl" }).end("#EXTM3U\n#EXTINF:10,\n/api/media/resource?ticket=secret-hls-segment-ticket\n");
        return;
      }
      if (ticket === "secret-hls-segment-ticket") {
        response.writeHead(200, { "Content-Type": "application/octet-stream" }).end(tsSegment());
        return;
      }
      if (ticket === "html-hls-manifest" || ticket === "large-hls-manifest") return;
      if (ticket === "bad-initial-range" || ticket === "bad-later-range" || ticket === "secret-mp4-ticket" || ticket === "oversize-json-ticket") {
        const range = request.headers.range ?? "";
        rangeRequests.push({ ticket, range });
        const match = /^bytes=(\d+)-(\d+)$/.exec(range);
        if (!match) {
          response.writeHead(400).end();
          return;
        }
        const start = Number(match[1]);
        const end = Number(match[2]);
        const total = 262_144;
        const body = mp4Range(start, end);
        const wrongInitial = ticket === "bad-initial-range" && start === 0;
        const wrongLater = ticket === "bad-later-range" && start > 0;
        const contentRange = wrongInitial ? `bytes 1-${end + 1}/${total}`
          : wrongLater ? `bytes 0-${end - start}/65536`
            : `bytes ${start}-${end}/${total}`;
        response.writeHead(206, {
          "Content-Type": "video/mp4",
          "Content-Length": String(body.length),
          "Content-Range": contentRange,
          "Accept-Ranges": "bytes",
        }).end(body);
        return;
      }
    }
    response.writeHead(404).end("not found");
  });
  const origin = await listen(app);
  return {
    origin,
    rangeRequests,
    get redirectHits() { return redirectHits; },
    get evilHits() { return evilHits; },
    async close() {
      await Promise.all([new Promise((resolve) => app.close(resolve)), new Promise((resolve) => evil.close(resolve))]);
    },
  };
}

test("loads the four known Thai-provider cases and validates explicit targets", async () => {
  const cases = await loadCases(fixtureFile);
  assert.equal(cases.length, 4);
  assert.deepEqual(new Set(cases.map((item) => item.provider)), new Set(["anifume", "animeruka"]));
  assert.deepEqual(new Set(cases.map((item) => item.episodeNumber)), new Set([1, 4]));
  assert.equal(parseArgs(["--origin", "http://localhost:3100", "--environment", "render"]).environmentLabel, "render");
  assert.equal(parseArgs(["--origin", "https://sabame.example", "--browser"]).browser, true);
  assert.throws(() => parseArgs(["--origin", "http://example.com"]), { code: "invalid_origin" });
  assert.throws(() => parseArgs(["--origin", "http://localhost:3100/path"]), { code: "invalid_origin" });
  assert.throws(() => parseArgs(["--origin", "https://user:pass@example.com"]), { code: "invalid_origin" });
});

test("probes real local HTTP responses with bounded ranges and redacted failures", async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());
  const temp = await mkdtemp(path.join(tmpdir(), "sabame-thai-probe-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const cases = [
    { id: "pass-mp4", animeId: "mal-1001", episodeNumber: 1, provider: "anifume" },
    { id: "api-error", animeId: "mal-1002", episodeNumber: 1, provider: "anifume" },
    { id: "html-api", animeId: "mal-1003", episodeNumber: 1, provider: "anifume" },
    { id: "malformed-api", animeId: "mal-1004", episodeNumber: 1, provider: "anifume" },
    { id: "api-redirect", animeId: "mal-1005", episodeNumber: 1, provider: "anifume" },
    { id: "off-origin", animeId: "mal-1006", episodeNumber: 1, provider: "anifume" },
    { id: "large-api", animeId: "mal-1007", episodeNumber: 1, provider: "anifume" },
    { id: "bad-initial-range", animeId: "mal-1008", episodeNumber: 1, provider: "anifume" },
    { id: "pass-hls", animeId: "mal-1009", episodeNumber: 1, provider: "animeruka" },
    { id: "bad-later-range", animeId: "mal-1010", episodeNumber: 1, provider: "anifume" },
    { id: "html-resource", animeId: "mal-1011", episodeNumber: 1, provider: "animeruka" },
    { id: "large-manifest", animeId: "mal-1012", episodeNumber: 1, provider: "animeruka" },
    { id: "resource-redirect", animeId: "mal-1013", episodeNumber: 1, provider: "animeruka" },
    { id: "provider-fallback", animeId: "mal-1014", episodeNumber: 1, provider: "anifume" },
    { id: "no-thai-evidence", animeId: "mal-1015", episodeNumber: 1, provider: "anifume" },
  ];
  const casesFile = path.join(temp, "cases.json");
  await writeFile(casesFile, JSON.stringify(cases));
  const good = await launchCli(["--origin", fixture.origin, "--cases", casesFile, "--case", "pass-mp4", "--environment", "local"]);
  assert.equal(good.exitCode, 0, good.stderr);
  const goodReport = JSON.parse(good.stdout);
  assert.equal(goodReport.summary.deliveryCompatibility, true);
  assert.equal(goodReport.summary.fullReadiness, false);
  assert.equal(goodReport.summary.unverified, 2);
  assert.equal(goodReport.readinessMode, "delivery_only");
  assert.ok(Number.isFinite(Date.parse(goodReport.checkedAt)));
  assert.ok(Number.isFinite(Date.parse(goodReport.cases[0].checkedAt)));
  assert.equal(goodReport.cases[0].stages.resolve.status, "pass");
  assert.equal(goodReport.cases[0].stages.delivery.status, "pass");
  assert.equal(goodReport.cases[0].stages.playback.status, "not_run");
  assert.equal(goodReport.cases[0].stages.seek.status, "not_run");

  const failed = await launchCli(["--origin", fixture.origin, "--cases", casesFile, "--environment", "render"]);
  assert.equal(failed.exitCode, 1);
  const report = JSON.parse(failed.stdout);
  assert.equal(report.environmentLabel, "render");
  assert.equal(report.environmentLabelSource, "operator");
  assert.equal(report.targetHost, "127.0.0.1");
  assert.equal(report.browserRequested, false);
  assert.equal(report.summary.stages.resolve.fail, 7);
  assert.equal(report.summary.stages.delivery.fail, 6);
  assert.equal(report.summary.stages.playback.not_run, cases.length);
  assert.equal(report.summary.stages.seek.not_run, cases.length);
  assert.equal(report.cases.find((item) => item.id === "api-error").stages.resolve.errorCode, "provider_unavailable");
  assert.equal(report.cases.find((item) => item.id === "html-api").stages.resolve.errorCode, "invalid_json");
  assert.equal(report.cases.find((item) => item.id === "malformed-api").stages.resolve.errorCode, "invalid_json");
  assert.equal(report.cases.find((item) => item.id === "api-redirect").stages.resolve.errorCode, "request_failed");
  assert.equal(report.cases.find((item) => item.id === "off-origin").stages.delivery.errorCode, "invalid_resource_url");
  assert.equal(report.cases.find((item) => item.id === "large-api").stages.resolve.errorCode, "resource_too_large");
  assert.equal(report.cases.find((item) => item.id === "bad-initial-range").stages.delivery.errorCode, "range_mismatch");
  assert.equal(report.cases.find((item) => item.id === "bad-later-range").stages.delivery.errorCode, "range_mismatch");
  assert.equal(report.cases.find((item) => item.id === "pass-hls").stages.delivery.status, "pass");
  assert.equal(report.cases.find((item) => item.id === "html-resource").stages.delivery.errorCode, "unexpected_content");
  assert.equal(report.cases.find((item) => item.id === "large-manifest").stages.delivery.errorCode, "resource_too_large");
  assert.equal(report.cases.find((item) => item.id === "resource-redirect").stages.delivery.errorCode, "request_failed");
  assert.equal(report.cases.find((item) => item.id === "provider-fallback").stages.resolve.errorCode, "provider_mismatch");
  assert.equal(report.cases.find((item) => item.id === "no-thai-evidence").stages.resolve.errorCode, "thai_evidence_missing");
  assert.equal(report.summary.deliveryCompatibility, false);
  assert.equal(fixture.redirectHits, 0);
  assert.equal(fixture.evilHits, 0);
  assert.deepEqual(fixture.rangeRequests.filter((item) => item.ticket === "secret-mp4-ticket").map((item) => item.range), ["bytes=0-65535", "bytes=131072-196607", "bytes=0-65535", "bytes=131072-196607"]);
  assert.ok(!failed.stdout.includes("SECRET"));
  assert.ok(!failed.stdout.includes("secret-"));
  assert.ok(!failed.stdout.includes("<html"));
  assert.ok(!failed.stdout.includes("http://"));
  assert.equal(failed.stderr, "");
});
