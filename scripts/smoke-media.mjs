// Optional live smoke: upstream availability is deliberately outside deterministic CI.
// Never print signed URLs, tickets, headers or subtitle content.
const origin = process.env.SABAME_SMOKE_ORIGIN ?? "http://localhost:3100";
const ids = process.argv.slice(2);
for (const animeId of ids.length ? ids : ["skyward-bloom", "mal-40748", "mal-16498"]) {
  const evidence = { checkedAt: new Date().toISOString(), animeId, episodeNumber: 1, playbackVerified: false, timingVerified: false };
  try {
    const detailResponse = await fetch(`${origin}/api/anime/${animeId}`, { signal: AbortSignal.timeout(35_000) });
    const detail = await detailResponse.json();
    evidence.title = detail.title;
    evidence.metadataStatus = detailResponse.status;
    const response = await fetch(`${origin}/api/anime/${animeId}/media`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ episodeNumber: 1 }), signal: AbortSignal.timeout(35_000) });
    const media = await response.json();
    evidence.resolveStatus = response.status;
    if (!response.ok) evidence.errorCode = media.error?.code;
    else {
      evidence.provider = media.provider;
      evidence.thaiStatus = media.thaiStatus;
      evidence.tracks = media.subtitles.map(({ language, label, format, availability, syncStatus }) => ({ language, label, format, availability, syncStatus }));
      const videoResponse = await fetch(new URL(media.video.url, origin), { signal: AbortSignal.timeout(20_000) });
      evidence.deliveryStatus = videoResponse.status;
      evidence.manifestVerified = videoResponse.ok && (await videoResponse.text()).startsWith("#EXTM3U");
    }
  } catch { evidence.errorCode = "smoke_request_failed"; }
  console.log(JSON.stringify(evidence));
}
