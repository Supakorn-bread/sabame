# Sabame media implementation

This implements the approved aggregator/player plan. Read [source investigation](anime-sdk-investigation.md) and [original adaptation](anime-sdk-sabame-adaptation.md) for the provider matrix and episode evidence collected before implementation.

## Architecture and source flow

```text
Local catalog + MalMeta/Jikan search
  → canonical mal-<id> or existing seed ID
  → metadata and episode selection
  → user presses Play
  → POST /api/anime/<id>/media
  → SDK MappingClient + exact title/season checks
  → AnimeParadiseProvider.fetchContentUnits()
  → unique, exact episode number
  → AnimeParadiseProvider.resolveStream(unitUrn, "sub", options)
  → video validation + subtitle resolver
  → rank complete provider bundles: usable Thai > English > video only
  → signed same-origin resource URLs
  → native video / lazily imported HLS.js + VTT tracks
```

Provider extraction stays in `anime-sdk@1.1.0`. `src/features/media/server/sdk.ts` explicitly uses `FetchTransport`, disables SDK retries and external mapping services, and never uses curl/cookie fallback. The SDK is isolated behind `server-only` imports. `providers.ts` wraps the real SDK interface; it does not copy extraction logic.

Only AnimeParadise is enabled. Anikoto and MegaPlay remain disabled because the investigation did not establish a usable video payload. The registry accepts additional `MediaProvider` adapters; deterministic fallback tests use injected providers. Provider names never determine the winner. SDK audio-track abstraction is absent, so the API does not invent audio metadata.

SDK `availableLanguages` means `sub/dub/raw`, not subtitle language. The adapter consumes the real `IVideoPayload.subtitles` fields: `language`, `label`, `url`, `format`. SDK `/tracks` and `/meta/tracks` are optional SDK-server routes, not Sabame dependencies; Sabame calls the provider interface directly and resolves only on Play.

## Public API

| Method | Route | Result |
| --- | --- | --- |
| GET | `/api/anime/search?q=…` | Unified catalog results; bounded five-minute cache |
| GET | `/api/anime/[animeId]` | Unified catalog metadata |
| GET | `/api/anime/[animeId]/episodes` | Metadata episode numbers/titles; not a promise of playable sources |
| POST | `/api/anime/[animeId]/media` | `{ "episodeNumber": 1 }` → `MediaResult` or safe error code/request ID |
| GET | `/api/media/resource?ticket=…` | Validated media, rewritten HLS or converted VTT |

`MediaResult` and subtitle types are defined in `src/features/media/types.ts`. Responses never contain SDK URNs, raw provider objects, cookies or private request headers. Signed resource tickets are integrity-protected, not encrypted; treat them as temporary bearer URLs. Responses use `Cache-Control: no-store`.

Video types are `hls` and `mp4`; torrent playback is outside this implementation. Sources expire after 30 minutes. Child HLS tickets inherit that deadline. The player offers an explicit fresh-source action after errors; changing episodes does not resolve or autoplay the next source.

## Thai subtitles and matching

`normalizeLanguage()` recognizes complete aliases including `Thai`, `thai`, `TH`, `th`, `tha`, `th-TH`, `th_TH` and `ภาษาไทย`. It never guesses a language from the first two characters. AnimeParadise's SDK helper synthesizes languages from labels; the adapter therefore validates recognized labels rather than trusting a synthetic `th` for `Theatre`.

The subtitle resolver checks bounded response bodies and detects VTT/SRT/ASS from content, including extensionless URLs. VTT is delivered natively; SRT is converted to VTT at delivery. ASS remains visible as unsupported metadata and never becomes the player's default track. HTML/error bodies, dead URLs and unknown formats are not selected.

Thai status distinguishes `present`, `absent_in_returned_tracks`, `unavailable`, and `unknown`. An upstream failure is an error, not a claim that Thai is absent. `present` describes a returned reachable track, not verified timing. A browser subtitle-load failure is reported and turns off that track.

Every returned subtitle has `syncStatus: "unverified"`. The implementation selects an intact video/subtitle bundle and never combines subtitles from another provider. Future `ExternalSubtitleProvider` / `ExternalSubtitleCandidate` interfaces retain episode, release, filename, duration, source, resolution and codec evidence. No external subtitle service is enabled yet.

## Catalog and persistence

Existing seed IDs and offline local search remain available. Exact canonical title matches reuse seed IDs; ambiguous titles, different seasons/years or duplicate episode matches fail safely. The old combined Mushoku Tensei seed is not silently mapped onto a different cour. New titles use `mal-<numericId>`.

The top navigation and `/search` page use the same debounced remote `GET /api/anime/search` flow. When `MAL_CLIENT_ID` is configured, the server calls the documented official `GET https://api.myanimelist.net/v2/anime` endpoint with `X-MAL-CLIENT-ID`; without it, `MalMeta` (anime-sdk's MAL metadata adapter) searches through its configured metadata service. An authenticated user's imported list is only a local fallback and is never the search boundary. When both sources match, remote catalog results are shown first and account entries are deduplicated. A remote outage keeps local matches visible and exposes Retry. The undocumented website `search/prefix.json` endpoint is intentionally not used.

Anime previews use actual MyAnimeList CDN URLs returned by Jikan, including the six seed titles. `seed-artwork.json` stores the fetched poster snapshot for immediate/offline-metadata rendering; refresh it with `node scripts/refresh-seed-artwork.mjs`. The watch page also accepts a fresh metadata cover when available. No mock hero overrides or generated episode-image fallbacks are used. The poster is reused when no real episode still is available. The Mushoku Tensei artwork references season 2 part 1 for display only; this does not establish a media mapping for the legacy combined-cour tracker entry.

The same reviewed snapshot supplies canonical MAL IDs for seed metadata lookup. Playback no longer depends on a title-search request to Jikan. If Jikan's detail endpoint is temporarily unavailable, seed entries use their validated local title, episode count and MAL mapping so provider resolution can continue; remotely discovered `mal-<id>` entries still fail closed when their metadata cannot be verified.

Reviewed AnimeParadise seed mappings also record the expected provider episode count. The combined 24-episode Mushoku tracker entry maps episodes 1–12 to season 2 and 13–24 to season 2 part 2 with an explicit offset. If an upstream unit count changes, playback stops with `mapping_required` instead of selecting a potentially wrong season. Cyberpunk currently has no AnimeParadise catalog result and reports `no_source` rather than a misleading season-mapping error.

Tracker schema v2 retains the `sabame:v1` local-storage key and migrates v1 sessions/progress. It stores validated, minimal catalog fields and progress only, with limits on persisted entries. It never stores resolved media, subtitle URLs or raw responses. Unknown episode counts are `null` and cannot automatically mark a series complete.

Real media duration controls playback bounds. Time updates are saved at most once every five seconds and flushed on pause, seek, page hide and unmount. Episode guards reject stale writes after selection changes. Completion is explicit. The original simulator is available only through the labelled demo toggle.

## Resource delivery and setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and set `MEDIA_PROXY_SECRET` to a random secret of at least 32 characters (`openssl rand -hex 32`). The implementation session generated a local secret only; it is ignored by Git.
3. Start with `npm run dev`.

The default exact host policy allows `stream.animeparadise.moe` and `api.animeparadise.moe`. Optional `MEDIA_ALLOWED_HOSTS` accepts comma-separated exact, operator-reviewed hosts. Unknown CDN hosts fail closed; do not add wildcards or user-submitted hosts. No secrets belong in `NEXT_PUBLIC_*` variables.

Application logs contain request ID, provider, stage, latency and safe error code only. Next.js development request logging excludes the signed resource route and browser-console forwarding is disabled. Hosting/access-log configuration should likewise redact resource tickets.

Delivery accepts only signed URLs. It requires HTTPS, rejects credentials/alternate ports, checks every redirect and all DNS answers, excludes private/special addresses, and pins the actual HTTPS connection to a validated IP. It does not forward user cookies or headers. Referer is generated server-side. Limits: three redirects, 12-second resource timeout, 1 MiB manifest/subtitle body, 32 MiB segment body, and bounded 8 MiB MP4 byte ranges. Videos are never buffered in full. Provider attempts have a 12-second deadline within a 30-second request budget.

HLS child playlists, relative segment URLs and inline `URI` attributes are signed and rewritten. Encrypted HLS is explicitly rejected; this implementation does not attempt DRM/key extraction. Browser sessions, authentication and anti-bot protections are not bypassed. If a provider requires them, it is unavailable until an authorized integration exists.

These API endpoints are not production account authentication or a distributed rate-limiting system. Before exposing an unrestricted public deployment, configure hosting-level traffic limits and resource budgets. No deployment is part of this change.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build -- --webpack
npm run test:e2e
```

Playwright uses port 3100 by default (override `PLAYWRIGHT_PORT`), builds and starts an isolated production server, and can reuse an existing server on that port. This avoids the existing development server's `.next/dev` lock. Turbopack hit a worker/process permission error in this environment; the repository's documented webpack fallback succeeded.

Unit tests cover Thai variants/false positives, multilingual/empty/missing/dead tracks, provider failures, deadlines, cancellation, intact bundles, strict season/episode matching, unknown counts, v1 migration, stale progress, token tampering/expiry, DNS pinning/rebinding, redirect/size limits, HLS rewriting, SRT conversion, and player failure paths.

Final verification after the seed mapping fix: 112 unit/component tests and all 10 Playwright tests passed, including Axe checks and real-poster URL assertions. The full browser run rebuilt the production application successfully with webpack. Lint and TypeScript checks passed. The client chunks contain neither the SDK provider implementation nor its curl transport.

Browser tests use an original CC0 synthetic MP4 and original Thai/English test cues. They exercise remote search, explicit resolve, playback, subtitle selection/Off, seeking, persistence/reload, episode changes, failure/retry, mobile layout and Axe accessibility. Fixture Thai tracks are **not provider evidence**. See `e2e/fixtures/README.md` for reproducibility.

Optional live smoke, outside deterministic CI:

```sh
node scripts/smoke-media.mjs
# or a specific title:
node scripts/smoke-media.mjs skyward-bloom
```

The script prints only redacted metadata/track status; it never prints tickets, URLs, headers or subtitle content. It reports manifest delivery separately from playback and synchronization verification. Provider availability can change between calls.

The [initial integration smoke](research/sabame-media-smoke.json) returned Attack on Titan episode 1 with reachable English/Portuguese/Spanish VTT and an HLS manifest through Sabame. Frieren encountered an upstream error; Jujutsu Kaisen failed exact episode selection. Neither failure establishes subtitle absence. The earlier source investigation tested additional episodes; its evidence remains in `docs/research/anime-sdk-evidence.json`.

**No actual tested provider episode has confirmed a Thai subtitle. Thai timing has not been verified.** The implementation prepares detection, delivery, fallback and player controls for a future valid source without claiming that `anime-sdk` presently supplies Thai for these episodes.
