# Sabame media implementation

This implements the approved aggregator/player plan. Read [source investigation](anime-sdk-investigation.md) and [original adaptation](anime-sdk-sabame-adaptation.md) for the provider matrix and episode evidence collected before implementation.

## Architecture and source flow

```text
Local catalog + official MAL metadata (MalMeta/Jikan without MAL_CLIENT_ID)
  → canonical mal-<id> or existing seed ID
  → metadata and episode selection
  → user presses Play
  → POST /api/anime/<id>/media
  → deduplicated SDK provider searches for MAL titles/synonyms + exact title/season checks
  → AnimeParadiseProvider.fetchContentUnits()
  → unique, exact episode number
  → AnimeParadiseProvider.resolveStream(unitUrn, "sub", options)
  → video validation + subtitle resolver
  → rank complete provider bundles: usable Thai > English > video only
  → signed same-origin resource URLs
  → native video / lazily imported HLS.js + VTT tracks
```

AnimeParadise extraction stays in `anime-sdk@1.1.0`. `apps/web/src/features/media/server/sdk.ts` explicitly uses `FetchTransport`, disables SDK retries and external mapping services, and never uses curl/cookie fallback. The SDK is isolated behind `server-only` imports. `providers.ts` wraps the real SDK interface; it does not copy extraction logic.

With `MAL_CLIENT_ID` configured, both catalog search and playback details use official MAL v2. Details preserve English, original/native titles, synonyms, release year and episode count, and validate the returned MAL ID. This avoids the Jikan full-details/episode-pagination dependency for imported accounts. Without that configuration, the existing SDK metadata path remains. Metadata failures are retryable and are not cached or reported as an absent video source.

Unmapped titles search up to four distinct aliases concurrently through the SDK. Selection requires one exact title/alias match, a compatible year and the existing exact episode/count checks. A second fuzzy mapping pass is no longer required. Ambiguous seasons or duplicate episode numbers remain rejected; adding an anime from MAL does not guarantee that the enabled provider carries it.

### MAL playback investigation — 22 September 2026

- `mal-51179` (Mushoku Tensei Season 2), episode 1: the old metadata path returned HTTP 502. With official MAL details, metadata, media resolution and manifest delivery returned HTTP 200. `mal-16498` (Attack on Titan), episode 1 also passed those live checks. These checks verify manifest reachability, not full provider-video playback or subtitle timing.
- Reported example `mal-59131` (As a Reincarnated Aristocrat… Season 2), episode 1: official MAL metadata returns 12 episodes. AnimeParadise returns no results for the English, original or synonym title. Broader searches return only Season 1 (`animeparadise:BV5670WT5AIWOcj3`), whose 12 episodes begin with “Reincarnation and Appraisal”; it must not substitute for Season 2.
- Alternate SDK probes found exact Season 2 entries on Anikoto (`anikoto:6627`) and Allmanga (`allmanga:5Ybejzg26CyepMEA6`), each with episodes 1–12. Anikoto failed stream resolution with `No video sources found in megaplay response`; Allmanga returned no source URLs for episode 1/sub. Neither is enabled as a fallback without verified video delivery.
- Validation: lint, TypeScript, 174 unit/component tests, the webpack production build and all 7 MAL/media Playwright checks passed. The added imported-library browser regression uses the synthetic fixture to verify canonical ID, episode 6, metadata-error retry and actual browser playback. It is not evidence of live availability for `mal-59131`.

Automatic playback checks AnimeParadise, HiAnime, Anizone, Anifume, and AnimeRuka concurrently, with at most five provider checks active. It prefers usable Thai subtitles, including provider-native embedded Thai, then English, then video only. Equal preferences retain registry order. HiAnime and Anizone still require usable English subtitles independently of the preference score. Anikoto and MegaPlay remain disabled because the investigation did not establish a usable video payload. Deterministic fallback tests use injected providers. SDK audio-track abstraction is absent, so the API does not invent audio metadata.

### Anizone fallback

The player discovers providers for the selected MAL title and episode through `GET /api/anime/[animeId]/media/providers?episodeNumber=1`. **Video source** offers **Auto** and only providers whose current source passes native media validation. The response distinguishes unavailable sources from timed out checks. Selecting a named source requests that provider directly. AnimeParadise and HiAnime also support explicit selection. Changing the source during playback preserves the current position and replaces the video and subtitle tracks. The selection persists across episode changes within the watch page. Each episode still requires the user to press **Play episode**.

`anizone.ts` searches public catalog pages with canonical title aliases. Discovery requires an exact title or alias, release year, and episode count. Competing matches fail closed. Episode mappings use the provider's actual numeric slugs and validated links, never array positions. Lazy catalog pages use the complete episode navigation from a public episode page. Only series identity and episode metadata enter the bounded five-minute memory cache.

The adapter parses escaped JSON strings without evaluating page JavaScript. Anizone video uses only its own subtitle tracks. Bilibili and SubDL enrichment never runs for this provider. Thai is the default when a usable Thai track is returned. English is the fallback. ASS tracks become safe plain VTT in memory after bounded validation. Conversion preserves dialogue and timing while discarding styles, fonts, placement, and vector drawings.

Live browser checks on 22 October 2026 verified `mal-603`, Futari wa Precure, episodes 1 and 2. Both played through Sabame with Japanese audio resources, English subtitles selected, Portuguese and Spanish alternatives, and 360p and 480p quality options. Key, playlist, segment, and subtitle requests returned HTTP 200. A separate API check resolved episode 49, beyond the initial 24-item catalog page. This sample establishes playback for these checked episodes, not universal Anizone coverage or verified subtitle synchronization. No media or subtitle bytes were saved to disk.

The checked Anizone Precure source does not offer 720p. The player shows the source's actual HLS resolutions and does not upscale or advertise an unavailable resolution.

### Anifume Thai source

Anifume participates in discovery and Auto alongside the other providers. `anifume.ts` matches a canonical title alias, including supported Roman and Arabic season numbers, and checks Thai season markers. For Thai-only listing titles, it verifies the Roman title in the detail page against MAL aliases. It requires a known catalog episode count. Completed listings must match that count exactly. Each listing must contain a complete, unique episode inventory within its advertised range. Detail and episode headings must agree with the selected listing. Ambiguous matches and unknown catalog episode counts fail with `mapping_required`.

The adapter reads public pages and JSON source arrays without evaluating JavaScript. It exposes the source array's actual, unique resolution labels as `qualities`, with a bounded opaque `qualityId` in requests. The default is 720p when offered, otherwise the lowest offered resolution above 720p, then the highest lower resolution. Unlabelled and duplicate resolution labels are rejected. Every explicit quality request reloads the current source list and rejects stale IDs with `quality_unavailable`. The result carries the actual `video.quality` and `selectedQualityId`. It does not create resolution options that the provider does not offer.

Thai subtitles are embedded in the video. `embeddedSubtitles` reports language `th` and `removable: false`, while `subtitles` remains empty. The player explains that these subtitles cannot be turned off. Bilibili and SubDL enrichment never runs for embedded subtitles.

On 22 October 2026, native browser playback through Sabame verified Black Clover (`mal-34572`), episode 1, at 1280 × 720. Playback advanced with `readyState` 4. A separate MP4 header check confirmed the same encoded dimensions. The proxy returned HTTP 206 with bounded byte ranges and `private, no-store`. Provider playback also visually established Thai text embedded in the picture. These checks do not establish universal catalog coverage or audio language. All media inspection stayed in memory.

FairyAnime remains disabled because the investigation did not establish playable anime video. Advertisement playback alone does not qualify a provider for registration.

### AnimeRuka origin servers

AnimeRuka participates in Auto and explicit **Video source** selection. The **AnimeRuka server** selector uses the selected episode's current public server IDs and labels. It preserves the list after a server fails. An explicitly selected server never switches to another origin. When no server or quality is explicit, discovery and playback can try the provider's other current native candidates after the default fails, within the same provider deadline. Unsupported hosts remain rejected. The result reports the actual `selectedServerId` so the selector follows an automatic origin choice.

`animeruka.ts` searches canonical MAL aliases and requires an exact, unambiguous title match. Detail and episode headings must agree. Episodes use their explicit numbers and validated public links. Ongoing series require a contiguous inventory starting at episode 1, bounded by the canonical count when known. Completed series require an exact canonical episode count. Season names remain part of title matching. A provider's Roman title prefix can match a canonical alias before a Thai description, but explicit Thai `ภาค` markers must agree with the named Roman season. An observed parenthesized absolute episode number, such as `ตอนที่ 1 (25) ซับไทย`, never replaces the explicit relative episode number.

The adapter reads the public WordPress player response and AnimeMami's public JSON page data without running page JavaScript. The reviewed native path uses `cdn2.maimeorder.com`. Its HLS manifest is a bounded JSON object with one canonical base64 `p` field. Delivery decodes that plain wrapper, validates the HLS playlist, and signs its constrained MPEG-TS segment paths. The upstream `.webp` segment extension and MIME type do not determine delivery type. Sabame checks MPEG-TS sync bytes and returns `video/mp2t`. Other hosts and encryption remain unsupported.

On 23 October 2026, native Chromium playback through Sabame verified FX Senshi Kurumi-chan, `mal-63337`, episode 1, on **หลัก**. The video advanced at 1920 × 1080 with `readyState` 4 and a duration of 1425.049 seconds. A frame at 150 seconds confirmed Thai subtitles embedded in the picture. This media playlist offers no resolution variants, so the API does not invent a 720p or 1080p quality label. The result has no external subtitle tracks or subtitle enrichment.

The checked episode also lists **สำรอง1** and **สำรอง2**. Their current iframe hosts have no reviewed native adapter. Selecting either reports `unsupported_server` and leaves the other origin choices available. This does not establish whether those servers play on the provider's own site. The checks cover the sampled episode and origin only. Browser media inspection used memory, disabled browser caching, and saved no media or subtitle files.

Validation passed with lint, all workspace TypeScript checks, 591 web tests, 26 catalog tests, and 14 architecture tests. The live player check also covered seeking to 30 seconds, an unsupported backup selection, returning to the main origin at the saved position, and natural episode completion in the local demo account.

SDK `availableLanguages` means `sub/dub/raw`, not subtitle language. The adapter consumes the real `IVideoPayload.subtitles` fields: `language`, `label`, `url`, `format`. SDK `/tracks` and `/meta/tracks` are optional SDK-server routes, not Sabame dependencies; Sabame calls the provider interface directly and resolves only on Play.

## Public API

| Method | Route | Result |
| --- | --- | --- |
| GET | `/api/anime/search?q=…` | Unified catalog results; bounded five-minute cache |
| GET | `/api/anime/[animeId]` | Unified catalog metadata |
| GET | `/api/anime/[animeId]/episodes` | Metadata episode numbers/titles; not a promise of playable sources |
| POST | `/api/anime/[animeId]/media` | `{ "episodeNumber": 1, "provider": "anizone" }`; `provider` accepts `animeparadise`, `hianime`, `anizone`, `anifume`, and `animeruka`. AnimeRuka accepts an optional current `serverId`; Anifume accepts an optional current `qualityId`. Omit `provider` for Auto. Returns `MediaResult` or a safe error code and request ID. |
| GET | `/api/anime/[animeId]/media/providers?episodeNumber=1` | Returns `MediaProviderDiscovery`, with per-provider `available`, `unavailable`, or `timeout` status, subtitle language, actual offered source quality options, and an optional recommended `defaultProviderId`. It contains no media URLs. |
| GET | `/api/anime/[animeId]/media/servers?episodeNumber=1&provider=animeruka` | Returns `MediaServerList` with provider, default server ID, and current public server IDs and labels. It does not resolve media or return iframe URLs. |
| GET | `/api/media/resource?ticket=…` | Validated media, rewritten HLS or converted VTT |

`MediaResult` and subtitle types are defined in `packages/domain/src/media.ts` and re-exported by `apps/web/src/features/media/types.ts`. Responses never contain SDK URNs, raw provider objects, cookies or private request headers. Signed resource tickets are integrity-protected, not encrypted; treat them as temporary bearer URLs. Responses use `Cache-Control: no-store`.

Video types are `hls` and `mp4`; torrent playback is outside this implementation. Sources expire after 30 minutes. Child HLS tickets inherit that deadline. The player offers an explicit fresh-source action after errors; changing episodes does not resolve or autoplay the next source.

## Thai subtitles and matching

`normalizeLanguage()` recognizes complete aliases including `Thai`, `thai`, `TH`, `th`, `tha`, `th-TH`, `th_TH` and `ภาษาไทย`. It never guesses a language from the first two characters. AnimeParadise's SDK helper synthesizes languages from labels; the adapter therefore validates recognized labels rather than trusting a synthetic `th` for `Theatre`.

The subtitle resolver checks bounded response bodies and detects VTT/SRT/ASS from content, including extensionless URLs. VTT is delivered natively; SRT is converted to VTT at delivery. ASS remains unsupported metadata outside the validated Anizone conversion path. HTML/error bodies, dead URLs and unknown formats are not selected.

Thai status distinguishes `present`, `absent_in_returned_tracks`, `unavailable`, and `unknown`. An upstream failure is an error, not a claim that Thai is absent. `present` describes a returned reachable track or provider-native embedded Thai subtitles. Separate track timing remains unverified. A browser subtitle-load failure is reported and turns off that track.

Every returned subtitle track has `syncStatus: "unverified"`. When a provider other than Anizone has no playable Thai track or embedded subtitles, the server can add a Bilibili or SubDL fallback. Bilibili requires matching English dialogue across the episode before applying a consistent timing offset. Bilibili takes precedence when both fallbacks succeed.

To enable SubDL, set `SUBDL_API_KEY` only in `apps/api/.env` and restart development. Nest owns authenticated discovery. It matches canonical title aliases, release year when known, season, and the unpacked filename's explicit episode marker. Movies, ambiguous sequels, split cours, duplicate episode files, and uncertain numbering are unsupported. Coverage depends on uploaded subtitles and provider availability.

SubDL accepts unpacked UTF-8 SRT files only. ZIP and ASS files are rejected. The server converts bounded subtitle bodies to VTT in memory and rejects non-Thai content and obvious runtime differences from the current English subtitles. These checks cannot establish synchronization. Select **Thai (SubDL, timing unverified)** to try the track. A usable Thai track becomes the default selection, ahead of English, while retaining its unverified timing label. Failure leaves the original playable media intact.

Subtitle and media bodies are never written to disk or cached. Resource responses use `private, no-store`. SubDL credentials are stripped from public download URLs before they cross the Nest boundary. Signed tickets bind the selected file's content hash. This integration uses no translation, AI, or paid translation endpoint.

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
2. Copy `apps/web/.env.example` to `apps/web/.env.local` and set `MEDIA_PROXY_SECRET` to a random secret of at least 32 characters (`openssl rand -hex 32`). The local environment file is ignored by Git.
3. Start with `npm run dev`.

The default exact host policy allows `stream.animeparadise.moe` and `api.animeparadise.moe`. Anizone has a separate policy for `seiryuu.vid-cdn.xyz` with resource-specific path checks. Anifume permits only `a12.rukoluo.com`, `a13.rukoluo.com`, `a15.rukoluo.com`, `a16.rukoluo.com`, and `a17.rukoluo.com`, with bounded MP4 paths under `/f/` or `/f/1/` and the observed `m` and `e` query keys. AnimeRuka media permits only the reviewed `.txt` manifest and `.webp` MPEG-TS paths under `cdn2.maimeorder.com/hls/`. Its control requests also use DNS validation and connection pinning, confined to reviewed public routes on `animeruka.com` and `animemami.xyz`. Control pages cannot become signed resource tickets. Optional `MEDIA_ALLOWED_HOSTS` accepts comma-separated exact, operator-reviewed hosts. Unknown CDN hosts fail closed; do not add wildcards or user-submitted hosts. No secrets belong in `NEXT_PUBLIC_*` variables.

Application logs contain request ID, provider, stage, latency and safe error code only. Next.js development request logging excludes the signed resource route and browser-console forwarding is disabled. Hosting/access-log configuration should likewise redact resource tickets.

Delivery accepts only signed URLs. It requires HTTPS, rejects credentials/alternate ports, checks every redirect and all DNS answers, excludes private/special addresses, and pins the actual HTTPS connection to a validated IP. It does not forward user cookies or headers. Referer is generated server-side. Limits: three redirects, 12-second resource timeout, 1 MiB manifest/subtitle body, 32 MiB segment body, and bounded 8 MiB MP4 byte ranges. Videos are never buffered in full. The media and provider discovery routes have a 30-second request budget. After canonical metadata, Auto and discovery give concurrent providers at most 12 seconds each within the remaining shared budget. Native validation follows a bounded first HLS variant and checks an actual MPEG-TS or fragmented MP4 segment, plus the current AES key when required. Anifume validates a bounded MP4 header. A reachable catalog page or manifest alone does not qualify as available. These checks establish current native source reachability, not complete browser playback or subtitle synchronization. Other source qualities remain offered options until selected and validated. Explicit provider selection receives the remaining request budget. Default-source failures can try current same-provider alternatives within that same deadline. Explicit server and quality IDs never fall back.

HLS child playlists, relative segment URLs and inline `URI` attributes are signed and rewritten. Only Anizone permits standard identity AES-128 HLS. Its exact CDN policy restricts keys to the same asset folder and returns only an exact 16-byte response through a signed, no-store route. SAMPLE-AES, DRM key formats, session keys, unknown encryption methods, and encrypted HLS from other providers are rejected. Browser sessions, authentication and anti-bot protections are not bypassed. If a provider requires them, it is unavailable until an authorized integration exists.

These API endpoints are not production account authentication or a distributed rate-limiting system. Before exposing an unrestricted public deployment, configure hosting-level traffic limits and resource budgets. No deployment is part of this change.

## Verification

The [50-title provider availability check](verification/provider-availability-2026-10-23.json) records a seeded sample from eight successful broad local catalog searches with real MAL IDs on 23 October 2026. Direct Jikan access timed out during pool discovery, so this is not a random sample of the full MAL catalog. All 50 discovery requests returned HTTP 200 and passed the response contract checks. Forty titles had at least one validated native source with English subtitles, and ten had no confirmed source. No native Thai source was found in that sample. Five sampled Auto requests selected an available English source as expected. This is API and source-validation evidence, not 50 browser playback checks. The separate live browser checks for AnimeRuka `mal-63337`, Anifume `mal-34572`, and English fallback `mal-603` cover those specific titles and episodes only. A separate Chrome check for `mal-35818` returned no available providers, left **Play episode** disabled, exposed availability retry, and created neither a video element nor a media POST.

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

Separate Thai track timing remains unverified. The live Anifume and AnimeRuka checks above establish provider-native Thai text embedded in the sampled videos. They do not establish Thai subtitle availability from `anime-sdk`.
