import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

const PROVIDERS = new Set(["anifume", "animeruka"]);
const STAGES = ["resolve", "delivery", "playback", "seek"];
const CASE_TIMEOUT_MS = 150_000;
const API_TIMEOUT_MS = 40_000;
const RESOURCE_TIMEOUT_MS = 20_000;
const MAX_JSON_BYTES = 1_048_576;
const MAX_MANIFEST_BYTES = 1_048_576;
const MAX_SEGMENT_BYTES = 33_554_432;
const RANGE_BYTES = 65_536;
const DEFAULT_CASES = fileURLToPath(new URL("./fixtures/thai-media-cases.json", import.meta.url));

class ProbeFailure extends Error {
  constructor(code, statusCode, bytes) {
    super(code);
    this.code = code;
    this.statusCode = statusCode;
    this.bytes = bytes;
  }
}

class CliFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function safeCode(value, fallback = "request_failed") {
  return typeof value === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(value) ? value : fallback;
}

function validateOrigin(value) {
  if (typeof value !== "string" || value.trim() !== value || !/^https?:\/\/[^/?#]+\/?$/.test(value)) {
    throw new CliFailure("invalid_origin");
  }
  let origin;
  try {
    origin = new URL(value);
  } catch {
    throw new CliFailure("invalid_origin");
  }
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") {
    throw new CliFailure("invalid_origin");
  }
  if (origin.protocol === "http:") {
    const address = origin.hostname.replace(/^\[|\]$/g, "");
    const loopback = address === "localhost" || address === "::1"
      || isIP(address) === 4 && Number(address.split(".")[0]) === 127;
    if (!loopback) throw new CliFailure("invalid_origin");
  } else if (origin.protocol !== "https:") {
    throw new CliFailure("invalid_origin");
  }
  return origin;
}

function validateCase(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CliFailure("invalid_case");
  const allowed = new Set(["id", "animeId", "episodeNumber", "provider", "serverId", "qualityId"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new CliFailure("invalid_case");
  if (typeof value.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value.id)) throw new CliFailure("invalid_case");
  if (typeof value.animeId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value.animeId)) throw new CliFailure("invalid_case");
  if (!Number.isSafeInteger(value.episodeNumber) || value.episodeNumber < 1 || value.episodeNumber > 10_000) throw new CliFailure("invalid_case");
  if (!PROVIDERS.has(value.provider)) throw new CliFailure("invalid_case");
  if (value.serverId !== undefined && (value.provider !== "animeruka" || typeof value.serverId !== "string" || !/^[1-9]\d{0,2}$/.test(value.serverId))) throw new CliFailure("invalid_case");
  if (value.qualityId !== undefined && (value.provider !== "anifume" || typeof value.qualityId !== "string" || !/^[1-9]\d{2,3}p$/.test(value.qualityId))) throw new CliFailure("invalid_case");
  return {
    id: value.id,
    animeId: value.animeId,
    episodeNumber: value.episodeNumber,
    provider: value.provider,
    ...(value.serverId === undefined ? {} : { serverId: value.serverId }),
    ...(value.qualityId === undefined ? {} : { qualityId: value.qualityId }),
  };
}

export async function loadCases(file, selectedId) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new CliFailure("invalid_case_file");
  }
  const source = Array.isArray(parsed) ? parsed : parsed?.cases;
  if (!Array.isArray(source) || !source.length) throw new CliFailure("invalid_case_file");
  const cases = source.map(validateCase);
  if (new Set(cases.map((item) => item.id)).size !== cases.length) throw new CliFailure("duplicate_case_id");
  const selected = selectedId ? cases.filter((item) => item.id === selectedId) : cases;
  if (!selected.length) throw new CliFailure("case_not_found");
  return selected;
}

function validateEnvironment(value) {
  if (!new Set(["local", "render", "other"]).has(value)) throw new CliFailure("invalid_environment");
  return value;
}

export function parseArgs(args) {
  const options = { casesFile: DEFAULT_CASES, environmentLabel: "other", browser: false };
  const seen = new Set();
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    if (flag === "--browser") {
      if (seen.has(flag)) throw new CliFailure("invalid_arguments");
      seen.add(flag);
      options.browser = true;
      continue;
    }
    if (!["--origin", "--cases", "--environment", "--case"].includes(flag) || seen.has(flag) || !args[i + 1] || args[i + 1].startsWith("--")) {
      throw new CliFailure("invalid_arguments");
    }
    seen.add(flag);
    const value = args[++i];
    if (flag === "--origin") options.origin = value;
    if (flag === "--cases") options.casesFile = path.resolve(value);
    if (flag === "--environment") options.environmentLabel = value;
    if (flag === "--case") options.caseId = value;
  }
  if (!options.origin) throw new CliFailure("invalid_arguments");
  options.originUrl = validateOrigin(options.origin);
  options.environmentLabel = validateEnvironment(options.environmentLabel);
  return options;
}

function notRun() {
  return { status: "not_run" };
}

function stageError(error, caseSignal) {
  const result = {
    status: "fail",
    errorCode: caseSignal.aborted ? "case_timeout" : safeCode(error?.code),
  };
  if (Number.isInteger(error?.statusCode) && error.statusCode >= 100 && error.statusCode <= 599) result.statusCode = error.statusCode;
  if (Number.isSafeInteger(error?.bytes) && error.bytes >= 0) result.bytes = error.bytes;
  return result;
}

async function measure(fn, caseSignal) {
  const started = performance.now();
  try {
    const result = await fn();
    return {
      stage: { status: "pass", ...result.metrics, durationMs: Math.max(0, Math.round(performance.now() - started)) },
      value: result.value,
    };
  } catch (error) {
    return {
      stage: { ...stageError(error, caseSignal), durationMs: Math.max(0, Math.round(performance.now() - started)) },
      value: undefined,
    };
  }
}

async function readCappedBody(response, limit) {
  if (!response.body) return { body: Buffer.alloc(0), bytes: 0 };
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isSafeInteger(contentLength) && contentLength > limit) {
    await response.body.cancel().catch(() => {});
    throw new ProbeFailure("resource_too_large", response.status, contentLength);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new ProbeFailure("resource_too_large", response.status, bytes);
      chunks.push(Buffer.from(value));
    }
    return { body: Buffer.concat(chunks, bytes), bytes };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function cancelBody(response) {
  await response.body?.cancel().catch(() => {});
}

async function fetchResponse(url, init, caseSignal, timeoutMs) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = AbortSignal.any([caseSignal, timeoutSignal]);
  try {
    return { response: await fetch(url, { ...init, signal, redirect: "error", cache: "no-store" }), timeoutSignal };
  } catch {
    throw new ProbeFailure(caseSignal.aborted ? "case_timeout" : timeoutSignal.aborted ? "request_timeout" : "request_failed");
  }
}

async function fetchBounded(url, init, caseSignal, limit, timeoutMs) {
  const { response, timeoutSignal } = await fetchResponse(url, init, caseSignal, timeoutMs);
  try {
    const result = await readCappedBody(response, limit);
    return { ...result, response };
  } catch (error) {
    if (error instanceof ProbeFailure) throw new ProbeFailure(error.code, response.status, error.bytes);
    throw new ProbeFailure(caseSignal.aborted ? "case_timeout" : timeoutSignal.aborted ? "request_timeout" : "request_failed", response.status);
  }
}

function apiErrorCode(body) {
  try {
    return safeCode(JSON.parse(body.toString("utf8"))?.error?.code);
  } catch {
    return "invalid_json";
  }
}

function thaiEvidence(media) {
  const embedded = media?.embeddedSubtitles?.language === "th";
  const track = Array.isArray(media?.subtitles) && media.subtitles.some((item) =>
    typeof item?.language === "string" && /^th(?:-|$)/i.test(item.language)
      && item.availability === "available" && item.displaySupported === true);
  return embedded && track ? "embedded_and_track" : embedded ? "embedded" : undefined;
}

async function resolveCase(origin, testCase, caseSignal) {
  const endpoint = new URL(`/api/anime/${encodeURIComponent(testCase.animeId)}/media`, origin);
  const payload = {
    episodeNumber: testCase.episodeNumber,
    provider: testCase.provider,
    ...(testCase.serverId ? { serverId: testCase.serverId } : {}),
    ...(testCase.qualityId ? { qualityId: testCase.qualityId } : {}),
  };
  const { response, body, bytes } = await fetchBounded(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  }, caseSignal, MAX_JSON_BYTES, API_TIMEOUT_MS);
  if (!response.ok) throw new ProbeFailure(apiErrorCode(body), response.status, bytes);
  let media;
  try {
    media = JSON.parse(body.toString("utf8"));
  } catch {
    throw new ProbeFailure("invalid_json", response.status, bytes);
  }
  if (!media || typeof media !== "object" || media.provider !== testCase.provider) throw new ProbeFailure("provider_mismatch", response.status, bytes);
  if (media.metadata?.animeId !== testCase.animeId || media.metadata?.episodeNumber !== testCase.episodeNumber) throw new ProbeFailure("identity_mismatch", response.status, bytes);
  const expectedType = testCase.provider === "anifume" ? "mp4" : "hls";
  if (media.video?.type !== expectedType || typeof media.video?.url !== "string") throw new ProbeFailure("invalid_video_response", response.status, bytes);
  const evidence = thaiEvidence(media);
  if (!evidence) throw new ProbeFailure("thai_evidence_missing", response.status, bytes);
  if (testCase.serverId && media.selectedServerId !== testCase.serverId) throw new ProbeFailure("selection_mismatch", response.status, bytes);
  if (testCase.qualityId && media.selectedQualityId !== testCase.qualityId) throw new ProbeFailure("selection_mismatch", response.status, bytes);
  return {
    metrics: { statusCode: response.status, bytes, thaiEvidence: evidence },
    value: { url: media.video.url, type: media.video.type },
  };
}

function resourceUrl(value, origin) {
  const base = origin instanceof URL ? origin : new URL(origin);
  let url;
  try {
    url = new URL(value, base);
  } catch {
    throw new ProbeFailure("invalid_resource_url");
  }
  const keys = [...url.searchParams.keys()];
  const ticket = url.searchParams.get("ticket");
  if (url.origin !== base.origin || url.username || url.password || url.hash || url.pathname !== "/api/media/resource"
    || keys.length !== 1 || keys[0] !== "ticket" || !ticket || ticket.length > 16_384) {
    throw new ProbeFailure("invalid_resource_url");
  }
  return url;
}

async function assertStatus(response, expected) {
  if (response.status !== expected) {
    await cancelBody(response);
    throw new ProbeFailure("unexpected_status", response.status);
  }
}

function assertNotHtml(body, statusCode) {
  if (/^\s*(?:<!doctype\s+html|<html\b)/i.test(body.subarray(0, 512).toString("utf8"))) {
    throw new ProbeFailure("unexpected_content", statusCode, body.length);
  }
}

async function fetchResource(url, origin, caseSignal, limit, headers = {}) {
  const safeUrl = resourceUrl(url, origin);
  const { response, body, bytes } = await fetchBounded(safeUrl, { headers }, caseSignal, limit, RESOURCE_TIMEOUT_MS);
  return { response, body, bytes };
}

function parseContentRange(response) {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") ?? "");
  if (!match) return undefined;
  const [start, end, total] = match.slice(1).map(Number);
  return [start, end, total].every(Number.isSafeInteger) ? { start, end, total } : undefined;
}

async function probeMp4(mediaUrl, origin, caseSignal) {
  const url = resourceUrl(mediaUrl, origin);
  const first = await fetchBounded(url, { headers: { Range: `bytes=0-${RANGE_BYTES - 1}` } }, caseSignal, RANGE_BYTES, RESOURCE_TIMEOUT_MS);
  await assertStatus(first.response, 206);
  const firstRange = parseContentRange(first.response);
  if (!firstRange || firstRange.start !== 0 || firstRange.end !== RANGE_BYTES - 1
    || firstRange.total <= firstRange.end || first.bytes !== RANGE_BYTES) {
    throw new ProbeFailure("range_mismatch", first.response.status, first.bytes);
  }
  assertNotHtml(first.body, first.response.status);
  if (first.body.length < 8 || first.body.subarray(4, 8).toString("ascii") !== "ftyp") {
    throw new ProbeFailure("invalid_video", first.response.status, first.bytes);
  }
  const total = firstRange.total;
  if (total < 131_072) throw new ProbeFailure("media_too_short", first.response.status, first.bytes);
  const offset = Math.floor(total / 2);
  const end = Math.min(total - 1, offset + RANGE_BYTES - 1);
  const later = await fetchBounded(url, { headers: { Range: `bytes=${offset}-${end}` } }, caseSignal, RANGE_BYTES, RESOURCE_TIMEOUT_MS);
  const laterRange = parseContentRange(later.response);
  if (later.response.status !== 206 || !laterRange || laterRange.start !== offset
    || laterRange.end !== end || laterRange.total !== total || later.bytes !== end - offset + 1) {
    throw new ProbeFailure("range_mismatch", later.response.status, later.bytes);
  }
  assertNotHtml(later.body, later.response.status);
  return { metrics: { statusCode: later.response.status, bytes: first.bytes + later.bytes, rangeRequests: 2, offsetBytes: offset } };
}

function hlsReferences(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startsWith("#EXT-X-STREAM-INF:")) {
      const variant = lines.slice(i + 1).find((line) => line && !line.startsWith("#"));
      if (!variant) throw new ProbeFailure("invalid_manifest");
      return { variant };
    }
  }
  const extinfIndex = lines.findIndex((line) => line.startsWith("#EXTINF:"));
  const segmentIndex = extinfIndex >= 0 ? lines.findIndex((line, index) => index > extinfIndex && line && !line.startsWith("#")) : -1;
  if (segmentIndex < 0) throw new ProbeFailure("invalid_manifest");
  const preceding = lines.slice(0, segmentIndex);
  if (preceding.some((line) => line.startsWith("#EXT-X-BYTERANGE:"))) throw new ProbeFailure("unsupported_byterange");
  const keyLine = preceding.filter((line) => line.startsWith("#EXT-X-KEY:")).at(-1);
  if (keyLine && !/METHOD=NONE(?:,|$)/.test(keyLine)) throw new ProbeFailure("unsupported_encryption");
  const mapLine = preceding.filter((line) => line.startsWith("#EXT-X-MAP:")).at(-1);
  if (mapLine && /\bBYTERANGE=/.test(mapLine)) throw new ProbeFailure("unsupported_byterange");
  const init = mapLine ? /URI="([^"]+)"/.exec(mapLine)?.[1] : undefined;
  if (mapLine && !init) throw new ProbeFailure("invalid_manifest");
  return { init, segment: lines[segmentIndex] };
}

async function probeHls(mediaUrl, origin, caseSignal) {
  let url = resourceUrl(mediaUrl, origin);
  let bytes = 0;
  let resources = 0;
  for (let depth = 0; depth <= 3; depth += 1) {
    const result = await fetchResource(url, origin, caseSignal, MAX_MANIFEST_BYTES);
    await assertStatus(result.response, 200);
    bytes += result.bytes;
    resources += 1;
    assertNotHtml(result.body, result.response.status);
    const text = result.body.toString("utf8").replace(/^\uFEFF/, "");
    if (!/^#EXTM3U(?:\r?\n|$)/.test(text)) throw new ProbeFailure("invalid_manifest", result.response.status, result.bytes);
    const refs = hlsReferences(text);
    if (refs.variant) {
      if (depth === 3) throw new ProbeFailure("hls_depth_exceeded", result.response.status, result.bytes);
      url = resourceUrl(refs.variant, result.response.url);
      continue;
    }
    if (refs.init) {
      const init = await fetchResource(refs.init, origin, caseSignal, MAX_SEGMENT_BYTES);
      await assertStatus(init.response, 200);
      bytes += init.bytes;
      resources += 1;
      assertNotHtml(init.body, init.response.status);
      if (init.bytes < 8 || !["ftyp", "styp"].includes(init.body.subarray(4, 8).toString("ascii"))) {
        throw new ProbeFailure("invalid_video", init.response.status, init.bytes);
      }
    }
    const segment = await fetchResource(refs.segment, origin, caseSignal, MAX_SEGMENT_BYTES);
    await assertStatus(segment.response, 200);
    bytes += segment.bytes;
    resources += 1;
    assertNotHtml(segment.body, segment.response.status);
    const transportStream = segment.bytes >= 940 && [0, 188, 376, 564, 752].every((offset) => segment.body[offset] === 0x47);
    const fragmentedMp4 = segment.bytes >= 8 && ["ftyp", "styp", "moof"].includes(segment.body.subarray(4, 8).toString("ascii"));
    if (!transportStream && !fragmentedMp4) throw new ProbeFailure("invalid_video", segment.response.status, segment.bytes);
    return { metrics: { statusCode: segment.response.status, bytes, resources, hlsDepth: depth } };
  }
  throw new ProbeFailure("hls_depth_exceeded");
}

async function probeDelivery(media, origin, caseSignal) {
  return media.type === "mp4"
    ? probeMp4(media.url, origin, caseSignal)
    : probeHls(media.url, origin, caseSignal);
}

function matrixHash(cases) {
  const canonical = cases.map(({ id, animeId, episodeNumber, provider, serverId, qualityId }) => ({
    id, animeId, episodeNumber, provider,
    ...(serverId === undefined ? {} : { serverId }),
    ...(qualityId === undefined ? {} : { qualityId }),
  }));
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical)).digest("hex")}`;
}

function summarize(rows) {
  const stages = Object.fromEntries(STAGES.map((name) => [name, { pass: 0, fail: 0, not_run: 0 }]));
  for (const row of rows) for (const name of STAGES) stages[name][row.stages[name].status] += 1;
  const failed = Object.values(stages).reduce((count, value) => count + value.fail, 0);
  const unverified = Object.values(stages).reduce((count, value) => count + value.not_run, 0);
  const deliveryCompatibility = stages.resolve.pass === rows.length && stages.delivery.pass === rows.length;
  const fullReadiness = STAGES.every((name) => stages[name].pass === rows.length);
  return { stages, failed, unverified, deliveryCompatibility, fullReadiness };
}

function browserStage(value, fields) {
  const status = ["pass", "fail", "not_run"].includes(value?.status) ? value.status : "fail";
  const result = { status };
  if (status !== "pass" && typeof value?.code === "string") result.errorCode = safeCode(value.code, "browser_probe_failed");
  if (status === "fail" && !result.errorCode) result.errorCode = "browser_probe_failed";
  for (const field of fields) {
    if (Number.isFinite(value?.[field]) && value[field] >= 0) result[field] = Math.round(value[field] * 1000) / 1000;
  }
  return result;
}

export async function runProbe({ origin: originValue, cases: caseValues, environmentLabel = "other", browser = false }) {
  const origin = validateOrigin(originValue);
  const cases = caseValues.map(validateCase);
  if (!cases.length || new Set(cases.map((item) => item.id)).size !== cases.length) throw new CliFailure("invalid_case");
  const label = validateEnvironment(environmentLabel);
  const rows = [];
  for (const testCase of cases) {
    const stages = Object.fromEntries(STAGES.map((name) => [name, notRun()]));
    const controller = new AbortController();
    const deadline = Date.now() + CASE_TIMEOUT_MS;
    const caseTimer = setTimeout(() => controller.abort(), CASE_TIMEOUT_MS);
    caseTimer.unref?.();
    const resolved = await measure(() => resolveCase(origin, testCase, controller.signal), controller.signal);
    stages.resolve = resolved.stage;
    if (resolved.value) {
      const delivered = await measure(() => probeDelivery(resolved.value, origin, controller.signal), controller.signal);
      stages.delivery = delivered.stage;
      if (browser && delivered.stage.status === "pass" && !controller.signal.aborted) {
        try {
          const { probeBrowser } = await import("./probe-thai-browser.mjs");
          const browserResult = await probeBrowser({
            origin: origin.origin,
            videoUrl: resolved.value.url,
            videoType: resolved.value.type,
            timeoutMs: Math.max(1, deadline - Date.now()),
            signal: controller.signal,
          });
          stages.playback = browserStage(browserResult?.playback, ["durationMs", "videoWidth", "videoHeight", "progressSeconds"]);
          stages.seek = browserStage(browserResult?.seek, ["durationMs", "targetSeconds", "reachedSeconds", "resumeProgressSeconds", "bufferedEndSeconds"]);
        } catch {
          stages.playback = { status: "fail", errorCode: controller.signal.aborted ? "case_timeout" : "browser_probe_failed" };
          stages.seek = { status: "fail", errorCode: controller.signal.aborted ? "case_timeout" : "browser_probe_failed" };
        }
      }
    }
    clearTimeout(caseTimer);
    rows.push({ ...testCase, checkedAt: new Date().toISOString(), stages });
  }
  const summary = summarize(rows);
  const report = {
    probe: "sabame-thai-media",
    version: 1,
    checkedAt: new Date().toISOString(),
    targetHost: origin.hostname,
    environmentLabel: label,
    environmentLabelSource: "operator",
    matrixHash: matrixHash(cases),
    browserRequested: browser,
    readinessMode: browser ? "browser" : "delivery_only",
    summary,
    cases: rows,
  };
  const requiredPass = summary.deliveryCompatibility && (!browser || summary.fullReadiness);
  return { report, exitCode: requiredPass ? 0 : 1 };
}

async function main(args) {
  try {
    const options = parseArgs(args);
    const cases = await loadCases(options.casesFile, options.caseId);
    const result = await runProbe({ origin: options.originUrl.href, cases, environmentLabel: options.environmentLabel, browser: options.browser });
    process.stdout.write(`${JSON.stringify(result.report)}\n`);
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ errorCode: safeCode(error?.code, "probe_failed") })}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main(process.argv.slice(2));
}
