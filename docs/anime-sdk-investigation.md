# Sabame: anime-sdk และแหล่ง subtitle ภาษาไทย

Research dates: 10–11 September 2026. เอกสารนี้เป็นผลวิจัยก่อน implementation ไม่มีการเปลี่ยน application code หรือติดตั้ง dependency เพิ่มใน Sabame

## ข้อสรุปสำหรับตัดสินใจ

ใช้แนวคิดของ anime-sdk เป็น media-provider boundary ได้ และ SDK มี subtitle abstraction จริง แต่ **ยังไม่มีหลักฐานจากการทดลองนี้ว่า episode ที่ทดสอบผ่าน SDK มี Thai subtitle** การตรวจหลายภาษาใน types หรือ provider source ไม่เพียงพอสำหรับประกาศว่าใช้งานซับไทยได้

ทดลองจริงรวม 17 provider/title attempts ครอบคลุม 4 เรื่อง: Frieren, Cyberpunk: Edgerunners, Jujutsu Kaisen และ Attack on Titan รวมตรวจ Frieren season 2 เพิ่ม ไม่ใช่ 17 episode ที่สำเร็จ: มีการค้นหาไม่พบ, HTTP 403 และ stream resolution errors ด้วย

- AnimeParadise resolve HLS + external subtitles ได้สำหรับ Frieren S1E1, Jujutsu Kaisen S1E1, Attack on Titan S1E1 และ Frieren S2E1; ไม่พบ Thai ในรายการที่คืนมา
- ตรวจ manifest และ subtitle ของ Jujutsu Kaisen S1E1 กับ Attack on Titan S1E1: HTTP 200 และมี `#EXTM3U` / `WEBVTT` signature จริง แต่ยังไม่ได้ทดสอบ browser playback หรือ timing
- Anikoto ได้ raw `tracks[]` จาก MegaPlay จริง แต่ `resolveStream()` ล้มเหลว ในตัวอย่าง Frieren S2E1 พบ response keys เป็น `tracks`, `t`, `intro`, `outro`, `server`, `enc` และไม่มี `sources` ตามที่ SDK คาดไว้ ไม่มีการพยายามถอด `enc`
- MegaPlay provider ค้นหาผ่าน AniList ไม่สำเร็จ: HTTP 403 ใน environment นี้ จึงยังไม่ได้ resolve ผ่าน AniList-mapped path ของ MegaPlay โดยตรง
- OpenSubtitles เป็น candidate สำหรับ external subtitle provider ที่มี API และ language code `th` แต่ยังไม่ได้ทดสอบ anime episode ผ่าน API เพราะไม่มี API key ที่จัดเตรียมให้สำหรับงานนี้
- AnimeTosho มี metadata ของ release ที่ระบุ Thai แต่ประกาศหยุดรับข้อมูลใหม่ตั้งแต่ 9 May 2026 จึงไม่ควรเป็นแหล่งหลักสำหรับ anime ตอนใหม่

หลักฐานจากการ execute อยู่ใน [redacted SDK evidence](research/anime-sdk-evidence.json) แยกจากข้อค้นพบใน documentation และ search index

## 1. Revision และวิธีตรวจ

| Project | Revision ที่อ่าน source | หมายเหตุ |
|---|---|---|
| anime-sdk | [`72d734f1f9bc6d59183ead2fcb0f172ad6018cdf`](https://github.com/hexxt-git/anime-sdk/tree/72d734f1f9bc6d59183ead2fcb0f172ad6018cdf) | `package.json` ระบุ version `1.1.0`, license `MIT`; ไม่ได้ยืนยันว่า npm release ตรงกับ Git commit นี้ทุกไฟล์ |
| Zenshin | [`cfd65cda70d242b0dc36b388c4b6a2b17fa6b23f`](https://github.com/hitarth-gg/zenshin/tree/cfd65cda70d242b0dc36b388c4b6a2b17fa6b23f) | Electron package ระบุ `2.7.1`; root LICENSE เป็น GPL-3.0 |

Clone ทั้งสอง repository ลง temporary directory แยกจาก Sabame อ่าน implementation ของ types, provider contract, subtitle normalizer, provider source, metadata mapping, HTTP routes และ live tests ใช้ `npm ci --ignore-scripts` และ build SDK สำเร็จทั้ง ESM, CJS และ TypeScript declarations

Live probes เรียก public SDK methods ด้วย `FetchTransport`, timeout และไม่มี automatic retry ใช้เฉพาะ headers ที่ provider implementation กำหนด ไม่มี cookies, authentication, proxy, Cloudflare solver หรือ anti-bot bypass การติดตั้งและ probes ใช้ network access ที่ได้รับอนุญาตหลัง sandbox DNS requests ล้มเหลว; sandbox errors ไม่ถูกนับเป็น provider failures ใน evidence สุดท้าย

เก็บเฉพาะ response metadata และ language fields โดยลด URLs เหลือ host/extension ไม่เก็บ subtitle text, signed URLs, secrets หรือ video files การตรวจ body signature อ่านเพียง initial response chunk แล้ว cancel จึงไม่ใช่การตรวจไฟล์ครบหรือการยืนยัน sync

## 2. Architecture จริงของ anime-sdk

```text
Metadata catalogue (AniList / MAL via Jikan / Kitsu)
  ↓ optional MappingClient
Content provider media URN
  ↓ BaseProvider.fetchContentUnits(mediaUrn)
IContentUnit[] — episode number + provider unit URN
  ↓ BaseProvider.resolveStream(unitUrn, 'sub' | 'dub' | 'raw', options)
ResolvedMediaStream
  ├─ type: 'video' → streams[] → sourceUrl + subtitles[]
  └─ type: 'manga' → pages.imageUrls[]
```

`BaseProvider` เป็น abstract class ไม่ใช่เพียง interface ที่มี method signature อย่างเดียว Public methods wrap/unwrap URNs แล้วเรียก `searchRaw`, `fetchContentUnitsRaw`, `resolveStreamRaw` ของ subclass มี optional `fetchUnitTracksRaw` และ getter `supportsUnitTracks` สำหรับ cheap track lookup [Source: BaseProvider][sdk-base]

`MappingClient` มี cache, provider-native mapping, external mappings และ fuzzy title matching แต่การ resolve แต่ละครั้งยังเลือก content provider ที่ caller ส่งเข้าไป **ไม่มี Thai-first cross-provider ranking ให้ Sabame สำเร็จรูป** [Source: MappingClient][sdk-mapping]

### Types และความหมายที่ต้องใช้ให้ถูก

| SDK field/type | ความหมายจริง | ผลต่อ Sabame |
|---|---|---|
| `ContentLanguage` | `'sub' \| 'dub' \| 'raw'` | ไม่ใช่ `th`, `en`, `ja` |
| `IContentUnit.availableLanguages` | translation modes ของ episode | ห้ามใช้เป็นรายการภาษาซับ |
| `IContentUnit.availableSubtitles` | language/label/optional format ไม่มี URL | optional hint ไม่ใช่ track ที่พร้อมเล่น |
| `ISubtitleTrack` | `language`, `label`, `url`, optional `format` | ไม่มี `lang`, `srclang`, `default` ใน type นี้ |
| `ISubtitleTrack.format` | `'vtt' \| 'srt' \| 'ass'` | type รองรับ format ไม่ได้แปลว่าทุก provider ส่ง format นั้น |
| `IVideoPayload` | `sourceUrl`, `isHLS`, `quality`, optional mode/headers/subtitles | ไม่ใช่ `{ video, tracks }` ตามตัวอย่างใน brief |
| `IUnitTracks` | `{ subtitles, qualities, headers? }` | `/tracks` ไม่ได้คืน root `tracks[]` |
| `ResolvedMediaStream` | video streams หรือ manga pages | ไม่มี torrent variant หรือ structured audio-track list ใน contract นี้ |

Source: [`src/types/index.ts`][sdk-types]. `availableSubtitles` เป็น optional contract; providers ที่ตรวจไม่ได้ populate field นี้ใน episode-list implementations

## 3. Provider matrix

ตารางนี้แยก capability จาก source และผล live test โดยชัดเจน “ไม่คืนซับ” หมายถึง SDK adapter ไม่ expose external subtitle list ไม่ได้ยืนยันว่าเนื้อวิดีโอไม่มี hardcoded/embedded subtitles

| Provider | Video จาก source | Subtitle tracks | Multi-language | Thai confirmed | Format / cheap tracks |
|---|---|---|---|---|---|
| AnimeParadise | HLS; live resolution สำเร็จ | `episode.subData` → normalized external URLs | YES: live Frieren/AOT | NO ในตอนที่ตรวจ | live VTT; normalizer รองรับ ASS/SRT ด้วย; cheap tracks YES |
| Anikoto | ตั้งใจคืน HLS/direct file; live resolution error | MegaPlay `tracks[kind=captions]` | YES ใน raw responses | NO ใน raw lists ที่ตรวจ; SDK stream ไม่สำเร็จ | raw URLs ลงท้าย VTT; cheap tracks NO |
| MegaPlay | ตั้งใจคืน HLS/direct file | MegaPlay `tracks[kind=captions]` | source รองรับ list; direct path UNTESTED | UNTESTED: AniList search 403 | adapter ระบุ VTT/otherwise SRT; cheap tracks NO |
| Allmanga | HLS/direct MP4/extractor candidates | ไม่คืน external subtitle list ใน adapter/extractors ที่ตรวจ | ไม่ยืนยัน subtitle languages | UNTESTED | N/A; cheap tracks NO |
| Gogoanime | HLS/direct candidate ผ่าน embed extraction | ไม่คืน external subtitle list | ไม่ยืนยัน | UNTESTED | N/A; cheap tracks NO |
| Goyabu | Blogger/googlevideo และ fallback video | ไม่คืน external subtitle list | ไม่ยืนยัน | UNTESTED | N/A; cheap tracks NO |
| Mangadex | ไม่มี video; manga pages | ไม่ใช่ anime subtitles | N/A | N/A | N/A |
| Mangapill | ไม่มี video; manga pages | ไม่ใช่ anime subtitles | N/A | N/A | N/A |
| Weebcentral | ไม่มี video; manga pages | ไม่ใช่ anime subtitles | N/A | N/A | N/A |

มีทั้งหมด **9 content providers: 6 anime + 3 manga** และ metadata providers อีก 3 ตัว จึงห้ามนำคำว่า “9 providers” ไปตีความเป็น 9 video fallbacks [Source: provider exports][sdk-index], [provider implementations][sdk-providers]

Anikoto และ MegaPlay ใช้ `megaplay.buzz` ร่วมกัน จึงไม่ใช่ upstream ที่เป็นอิสระจากกัน การสลับสองชื่ออาจไม่ช่วยเมื่อ upstream เดียวกันมีปัญหา [Anikoto source][sdk-anikoto], [MegaPlay source][sdk-megaplay]

## 4. ผล episode จริง

ทุกแถวข้างล่างเลือก episode number 1 ของ season ที่ระบุ ยืนยัน title จาก search results ก่อนเลือก unit ไม่ใช้ Sabame local slug เป็น provider ID

| Title / episode | Provider | Subtitle list ที่เห็นจริง | Video / URL validation | Thai |
|---|---|---|---|---|
| Frieren S1E1 | AnimeParadise | SDK: English, Italian, Spanish — VTT | HLS URL resolved; URL body ไม่ได้ตรวจใน run นี้ | ไม่พบ |
| Jujutsu Kaisen S1E1 | AnimeParadise | SDK: English — VTT | manifest 200 + `#EXTM3U`; English subtitle 200 + `WEBVTT` | ไม่พบ |
| Attack on Titan S1E1 | AnimeParadise | SDK: English, Portuguese, Spanish — VTT | manifest 200 + `#EXTM3U`; English subtitle 200 + `WEBVTT` | ไม่พบ |
| Frieren S2E1 | AnimeParadise | SDK: English — VTT | HLS URL resolved; ไม่ได้ตรวจ body | ไม่พบ |
| Frieren S1E1 | Anikoto → MegaPlay | Raw: Arabic, English, French, German, Italian, Portuguese (Brazil), Russian, Spanish, Spanish (Latin America) | SDK throws `No video sources found in megaplay response` | ไม่พบใน raw list |
| Cyberpunk: Edgerunners S1E1 | Anikoto → MegaPlay | Raw: English, English 2 | SDK throws เหมือนข้างบน | ไม่พบใน raw list |
| Jujutsu Kaisen S1E1 | Anikoto → MegaPlay | Raw: Arabic, English, French, German, Italian, Portuguese, Russian, Spanish variants รวม 9 tracks | SDK throws เหมือนข้างบน | ไม่พบใน raw list |
| Attack on Titan S1E1 | Anikoto → MegaPlay | Raw: English, English 2, English (Crunchyroll), Portuguese, Spanish | SDK throws เหมือนข้างบน | ไม่พบใน raw list |
| Frieren S2E1 | Anikoto → MegaPlay | Raw: English | HTTP 200 แต่ response ไม่มี `sources`; มี `enc` | ไม่พบใน raw list |

Anikoto raw track URLs อยู่บน `cdn.imgnex.top` และลงท้าย `.vtt` แต่ไม่ได้ fetch ไฟล์เหล่านั้นเพื่อยืนยัน body format หรือ availability จึงเป็น **format จาก URL เท่านั้น** ไม่ใช่ validated VTT

AnimeParadise ค้นหา `Cyberpunk: Edgerunners` และ `Cyberpunk` แล้วได้ empty results ส่วน MegaPlay search ของ Frieren, Cyberpunk และ Jujutsu Kaisen ถูก AniList ตอบ 403 เหตุการณ์เหล่านี้ไม่ใช่หลักฐานว่า episode ไม่มี Thai

AnimeParadise คืน 35 content units สำหรับ Jujutsu Kaisen title ที่เลือก ขณะที่ Anikoto คืน 24 units ต้องตรวจ numbering/specials ก่อนเชื่อมทั้ง season ไม่ควรนำจำนวน units ไปแทน canonical `totalEpisodes` โดยตรง

### Raw fields ที่พบ

```text
AnimeParadise episode.subData[]:
  { src, label, type }

MegaPlay upstream tracks[] (ผ่าน Anikoto):
  { file, label, kind, default? }

SDK streams[].subtitles[]:
  { url, language, label, format? }
```

Frieren S1E1 และ AOT S1E1 ของ AnimeParadise มี raw ASS entries ที่ `src` ไม่ใช่ absolute URL ซึ่ง SDK normalizer ตัดออก เหลือ VTT URL entries ห้ามนับ raw identifier เหล่านี้เป็น external subtitle URL ที่ใช้งานได้

### Thai evidence verdict

```text
SDK supports subtitle abstraction: YES
At least one tested provider returns subtitle tracks: YES
Thai found in the tested SDK outputs/upstream track lists: NO
Thai absent from every episode on every provider: NOT ESTABLISHED
Thai subtitle externally hosted through tested SDK flow: UNCONFIRMED
Thai subtitle format through tested SDK flow: UNKNOWN
Thai subtitle verified to match video: NO — not tested, no Thai track found
Full browser playback and subtitle timing verified: NO
```

## 5. API / source flow จริง

### AnimeParadise

```text
BaseProvider.search('Frieren')
  → AnimeParadiseProvider.searchRaw()
  → GET api.animeparadise.moe/search?q=Frieren&limit=20
  → media URN

fetchContentUnits(mediaUrn)
  → GET /anime/{mediaId}/episode
  → unit URN containing uid + animeId

resolveStream(unitUrn, 'sub')
  → GET /ep/{uid}?origin={animeId}
  ├─ episode.streamLink → stream.animeparadise.moe/m3u8?url=...
  └─ episode.subData → normalizeSubtitleEntries() → streams[0].subtitles
```

`fetchUnitTracks()` ใช้ episode endpoint เดียวกันเพื่อคืน `{ subtitles, qualities: ['auto'], headers }` ไม่ต้อง fetch manifest ก่อน แต่ถ้าเรียก cheap tracks แล้ว resolve ต่อทันทีโดยไม่มี reuse/cache จะเสีย episode request ซ้ำ [Source: AnimeParadiseProvider][sdk-paradise]

### Anikoto / MegaPlay

```text
Anikoto.search()
  → anikototv.to/filter?keyword=...
fetchContentUnits()
  → anikotoapi.site/series/{mediaId}
resolveStream(unitUrn, 'sub')
  → megaplay.buzz/stream/s-2/{episode_embed_id}/sub
  → file ID from embed title
  → megaplay.buzz/stream/getSources?id={fileId}
  → SDK expects sources.file + tracks[]
```

MegaPlay direct provider ใช้ AniList GraphQL สำหรับ search และสร้าง episode list จาก `episodes` แล้ว resolve ผ่าน `/stream/ani/{aniListId}/{episode}/sub` ก่อนเข้า `getSources` เหมือนกัน [Sources: Anikoto][sdk-anikoto], [MegaPlay][sdk-megaplay]

### SDK HTTP wrapper

```text
/tracks?provider=...&unitId=...&language=sub
  → provider.fetchUnitTracks()
  → { subtitles, qualities, headers? }

/meta/tracks?provider=anilist&id=anilist:...&episode=1&contentProvider=...
  → meta.fetchUnitTracks()
  → findContentUnit() → mapping + episode selection
  → contentProvider.fetchUnitTracks()
```

สอง endpoint เป็น routes ของ optional SDK server ไม่ใช่ endpoint กลางที่ทุก upstream provider มี Sabame สามารถใช้ methods ภายใน Next.js API boundary โดยไม่ต้องเปิด SDK server อีกตัว [Source: server/index.ts][sdk-server]

## 6. ข้อจำกัด/ปัญหาที่พบและผลต่อ implementation

1. **Thai false positive จาก SDK normalizer:** `labelToBcp47()` fallback เป็นสองตัวแรกของ label ทดสอบ offline จริงด้วย label `Theatre` แล้วได้ `language: 'th'` เหมือน `Thai` ดังนั้นไม่ควรเชื่อ language ที่ SDK เดาจาก unknown label โดยไม่มี provenance ต้อง normalize ด้วย alias/BCP-47 rules ที่ชัดเจน และรักษาว่า language มาจาก upstream field หรือการเดา [Source][sdk-subtitles]
2. **Anikoto/MegaPlay subtitle format inference เปราะ:** ใช้ `file.endsWith('.vtt') ? 'vtt' : 'srt'`; `.vtt?token=...` หรือ ASS อาจถูกจัดเป็น SRT ต้องแยก URL pathname, explicit format และ content signature ไม่ถือว่า SDK format เป็นข้อยืนยันเสมอ [Sources][sdk-anikoto]
3. **Raw `default` ไม่ถูกส่งต่อ:** พบใน upstream แต่ `ISubtitleTrack` และ adapter ไม่ preserve field นี้ การเลือก default ใน Sabame จึงต้องเป็น policy ของเรา ไม่อ้างว่าเป็น default ของ provider
4. **Cheap-track route inconsistency:** `/tracks` ตรวจว่ามี `fetchUnitTracks` method ซึ่ง BaseProvider มีเสมอ แม้ `supportsUnitTracks === false`; offline ตรวจ Anikoto ได้ `false` และ method type `function` โค้ด route จึงจะไป throw และ outer catch คืน 500 แทน 501 ที่ตั้งใจไว้ ส่วน `/meta/tracks` ตรวจ getter ถูกต้อง นี่เป็นข้อสรุปจาก source และ offline object check ไม่ใช่ live HTTP route test [BaseProvider][sdk-base], [server][sdk-server]
5. **Episode fallback:** metadata layer มี fallback ไปตอนใกล้เคียงเมื่อไม่พบ exact episode ใช้ `strictEpisodeMatching: true` สำหรับ playback และตรวจ season mapping ก่อน เพราะ strict episode matching ไม่แก้ wrong-title mapping [Source][sdk-meta]
6. **MegaPlay availability เป็นการประมาณ:** episode list สร้างจาก AniList count และติด `['sub','dub']` ทุก unit ไม่ใช่การตรวจ availability ของ upstream รายตอน [Source][sdk-megaplay]
7. **เลือก FetchTransport อย่างชัดเจน:** default HttpClient ใช้ CurlFallbackTransport ซึ่งมี cookie jar และสร้าง shell command ด้วย string interpolation Sabame ไม่จำเป็นต้องรับ behavior นี้เข้ามา งานวิจัยนี้ใช้ FetchTransport ตลอด ไม่มีการประเมิน exploitability ของ shell construction [Source][sdk-transport]
8. **SDK tests ไม่ใช่ Thai evidence:** live tests ที่อ่านไม่ได้ assert ว่ามี Thai; MegaPlay tests บางจุดยังคาด raw IDs ทั้งที่ public methods wrap URNs ต้องทดสอบ integration ที่ใช้จริง ไม่ถือ README ว่าเป็นผลตรวจปัจจุบัน [Source: SDK tests][sdk-tests]

## 7. Essential resources สำหรับ Thai subtitles

| Resource | สิ่งที่ยืนยันได้ | ใช้กับ Sabame อย่างไร | ข้อจำกัดของหลักฐาน |
|---|---|---|---|
| anime-sdk / AnimeParadise | External subtitle abstraction + HLS resolution ทำงานในตัวอย่าง | เริ่ม media integration experiment และ subtitle normalization | ไม่พบ Thai ใน tested episodes |
| OpenSubtitles REST API | มี subtitle search/download API; official language list มี `th` | Candidate ของ external SubtitleProvider แยกจาก MediaProvider | ไม่มี API key สำหรับ live episode search; Thai coverage/URL/format/sync ยังไม่ยืนยัน |
| Netflix title page | Cyberpunk: Edgerunners แสดง Thai ในรายการคำบรรยาย | ใช้เป็น official watch link และ title-level availability evidence | ไม่ใช่ external VTT URL, ไม่ใช่ SDK response, ไม่ใช่ episode/session verification |
| YouTube official uploads เช่น Muse Thailand | มี official videos; YouTube มี IFrame Player API | Embed เมื่ออนุญาต หรือเปิด official watch link | ตัวอย่าง Frieren ที่ค้นพบระบุพากย์ไทย จึงไม่ใช้เป็นหลักฐานซับไทย; caption download ต้องมี edit permission |
| AnimeTosho archive | มี indexed release metadata ระบุ `tha` และ ASS/SRT | ศึกษา release matching และ historical subtitle metadata | อยู่ระหว่าง shutdown; ไม่ควรเป็น live dependency สำหรับตอนใหม่; attachment URLs ไม่ได้ตรวจ |
| Jimaku | Subtitle archive เน้นภาษาญี่ปุ่น มี AniList-linked entries และ API docs | ศึกษาการจัดการ season/release/filename และ language-specific sources | ไม่ใช่แหล่ง Thai ที่ยืนยันแล้ว |
| User-supplied / permissioned VTT, SRT, ASS | ตรวจได้จากไฟล์ที่ผู้ใช้มีสิทธิ์ใช้จริง | ทางเลือกสำหรับทดลอง player และ manual subtitle selection | ต้องมีไฟล์จริง; เริ่มต้น sync เป็น unverified |

### OpenSubtitles

Official onboarding ระบุให้สร้าง API key และส่ง `User-Agent` ที่ระบุ app/version; download มี quotas ต้องตรวจเงื่อนไขปัจจุบันก่อนใช้งาน ไม่ใส่ key ใน frontend [Getting Started](https://opensubtitles.tawk.help/article/getting-started)

Official language list ระบุ `th = Thai` และ official MCP repository แสดงแนวคิด search, download และ movie-hash matching นี่เป็น **API capability** ไม่ใช่การยืนยัน Thai subtitles สำหรับ anime ที่ Sabame ต้องการ ต้องทดสอบกับ episode/release จริงและใช้ video hash หรือ release metadata เมื่อมี [Language list](https://github.com/opensubtitles/vlsub-opensubtitles-com/blob/main/docs/languages.md), [OpenSubtitles MCP source](https://github.com/opensubtitles/mcp.opensubtitles.com)

ไม่เสนอให้แปลซับด้วย AI แบบเงียบ ๆ เพื่อให้ผ่านเงื่อนไข Thai subtitle หากเพิ่มในอนาคต ต้องแยก machine-generated translation ออกจาก provider-supplied subtitle และทดสอบคุณภาพ

### Official platforms และ YouTube

หน้า Netflix ภาษาไทยของ Cyberpunk: Edgerunners ระบุ Thai subtitles ระดับ title แต่ไม่ได้เปิด authenticated player และไม่ได้รับ subtitle-track response ดังนั้นควรเก็บเป็น `catalog_declared` พร้อม source/date ไม่ใช่ `episode_verified` [Netflix title page](https://qr.netflix.com/th/title/81054853)

YouTube รองรับ caption preference `cc_lang_pref=th` และ `cc_load_policy=1` แต่การตั้ง preference ไม่สร้าง Thai captions ที่ไม่มีอยู่ การ download captions ผ่าน Data API ต้องมีสิทธิ์ edit video ไม่สามารถถือว่า official public uploads เป็น external subtitle API สำหรับ Sabame โดยอัตโนมัติ [Player parameters](https://developers.google.com/youtube/player_parameters#cc_lang_pref), [Captions download](https://developers.google.com/youtube/v3/docs/captions/download)

ต้องแยก selectable soft subtitles, subtitles ที่อยู่ในภาพวิดีโอ และ Thai dub ในข้อมูล availability เพราะเฉพาะแบบแรกเท่านั้นที่อาจมี subtitle track ให้เลือก

### AnimeTosho: เกี่ยวข้องกับ Zenshin แต่ไม่เหมาะเป็น dependency ใหม่

Search index ของ release Frieren S2E5 `[Judas]` ระบุ Thai `[tha, ASS]` และ Jujutsu Kaisen S2E13 `[NeoLX]` ระบุ Thai `[tha, SRT] แต่ direct page open บางครั้งล้มเหลว และไม่ได้ download attachments จึงเป็น **indexed release metadata** เท่านั้น ไม่ใช่ actual SDK track evidence หรือ verified subtitle file [Frieren release](https://animetosho.org/view/judas-sousou-no-frieren-beyond-journeys-end-s02e05.n2075885), [Jujutsu Kaisen release](https://animetosho.org/view/neolx-jujutsu-kaisen-s02e13-1080p-x264-10bits-aac.1812046)

Database export docs อธิบาย attachment metadata เช่น `lang`, `codec`, `tracknum` และ source file relationship ซึ่งมีประโยชน์ต่อการออกแบบ matching มากกว่าจับคู่ด้วยชื่อเรื่องเพียงอย่างเดียว [Export schema](https://storage.animetosho.org/dbexport/)

ผู้ดูแลประกาศหยุด ingestion วันที่ 9 May 2026 และคงเว็บเป็น archive; update ระบุ feed/storage lease ถึง October และวางแผนปิดเว็บ May 2027 โดยอาจเปลี่ยนแผนได้ จึงไม่แนะนำเป็น dependency หลักใหม่ [Shutdown update](https://animetosho.org/about/shutdown2)

### Jimaku และ player tools

Jimaku เน้น Japanese subtitles และแนะนำ filename/source/release annotations สำหรับ timing matching รวมถึงแยก season ตาม AniList entry เหมาะเป็น reference ของ subtitle identity แต่ยังไม่มี Thai evidence ในงานนี้ [Project](https://github.com/Rapptz/jimaku), [Help](https://jimaku.cc/help), [API docs](https://jimaku.cc/api/docs)

สำหรับ Sabame player: HLS.js รองรับ HLS, WebVTT และ alternate audio renditions; native HTML track ใช้ WebVTT ส่วน ASS ควรพิจารณา renderer เช่น JASSUB เมื่อมีไฟล์จริงให้ทดสอบ แปลง ASS เป็น VTT อาจเสีย styling/positioning จึงไม่ควรติดตั้ง renderer เพิ่มก่อนพิสูจน์แหล่ง subtitle [HLS.js](https://github.com/video-dev/hls.js), [HTML track standard](https://html.spec.whatwg.org/multipage/media.html#the-track-element), [JASSUB](https://github.com/ThaUnknown/jassub)

## 8. สิ่งที่นำมาจาก Zenshin ได้

Zenshin revision ที่อ่านไม่ได้ใช้ anime-sdk ใน Electron dependencies แนวทางหลักใน source คือ metadata จาก Jikan/AniList, mapping, torrent/release discovery และ local Electron/Express/WebTorrent streaming ไม่ใช่ Next.js HLS aggregation architecture สำเร็จรูป [Package][zenshin-package], [API helpers][zenshin-api], [Main process][zenshin-main]

มี local server bind `127.0.0.1`, HTTP range streaming ของ Matroska files และ external-player integration ส่วน renderer มี player source setup และมีตัวแปร subtitle source แต่สิ่งนี้ไม่ยืนยันว่า end-to-end subtitle delivery ทำงานใน revision นี้ ต้องไม่ถือ commented/unused code เป็น capability ที่ผ่านการทดสอบ

สิ่งที่ควรรับมาเป็นแนวคิด: แยก catalog identity, episode mapping, release/source discovery และ player state ส่วน Electron local filesystem/torrent service ไม่เหมาะจะย้ายลง Next.js Route Handler โดยตรง นอกจากนี้ source มี `webSecurity: false` ซึ่งห้ามนำมาใช้แก้ CORS ใน Sabame และ repository LICENSE เป็น GPL-3.0 หากจะ reuse code ต้องพิจารณา license แยกจากการนำ architecture idea มาใช้ [Main process][zenshin-main], [License][zenshin-license]

## 9. แผนที่แนะนำสำหรับ Sabame จากหลักฐานปัจจุบัน

1. **Catalog identity ก่อน:** รักษา seed IDs เช่น `skyward-bloom` และเพิ่ม canonical metadata mapping โดยแยก season/cour; ไม่เปลี่ยน IDs ใน persisted library แบบตรง ๆ ใช้ metadata provider ที่ตรวจว่าเข้าถึงได้ใน deployment จริง เพราะ AniList request ถูก 403 ในการทดลองนี้
2. **Provider adapter แบบ server-only:** ใช้ anime-sdk ผ่าน boundary เดียว เลือก FetchTransport, strict episode matching, typed validation และ timeouts; เปิดใช้ provider ตาม health/capability จริง ยังไม่ถือ Anikoto/MegaPlay เป็น working video fallback
3. **Subtitle resolver แยก:** เริ่มจาก stream-owned subtitle list; normalize aliases `Thai/thai/TH/th/tha/th-TH` แต่ห้ามใช้ first-two-character fallback ตรวจ URL/format และเก็บ provenance
4. **Thai availability มีสถานะหลายระดับ:** `present`, `absent_in_returned_tracks`, `unknown` พร้อม evidence/source/date ไม่ส่ง `hasThai: false` เมื่อ provider request ล้มเหลว และไม่อ้างว่า empty SDK list พิสูจน์ว่าไม่มี burned-in/HLS-embedded Thai
5. **Fallback เลือกทั้ง video+subtitle bundle:** ต้องมี video ที่ใช้ได้ก่อน แล้วจึงจัด Thai → English → video-only; raw Thai track จาก provider ที่ไม่มี video ไม่ควรถูกรวมข้ามแหล่งอัตโนมัติ
6. **External Thai research ต่อด้วย OpenSubtitles:** เมื่อมี key ให้ทดสอบอย่างน้อย 3 actual anime episodes รวม matching/URL validation ถ้าไม่มีหลักฐาน timing ให้ `syncStatus: 'unverified'`; resolution/codec อย่างเดียวไม่ยืนยัน sync
7. **Player proof ก่อน rollout:** ทดลองด้วย media และ subtitles ที่มีสิทธิ์ใช้ ตรวจ HLS/VTT/CORS, episode changes, resume และ progress events จริงก่อนแทน SimulatedPlayer ทั้งหมด รักษา demo mode ให้ระบุชัดเจน

Unified DTO ควรมี `playbackStatus`, per-track `availability`, `formatConfidence`, `languageProvenance`, `syncStatus` และ `selectionReason` เท่าที่ frontend ต้องใช้ แยก detailed provider diagnostics ไว้ server logs ไม่ expose secrets/required private headers

### สิ่งที่ยังไม่ยืนยัน

- Thai track จาก actual SDK provider response
- Thai file URL availability, format และ timing กับ selected video
- Full browser playback ของ sources ที่ resolve ได้
- Audio rendition languages และ subtitle renditions ภายใน HLS manifests
- OpenSubtitles anime coverage ผ่าน authenticated/API-key requests
- Session/region behavior ของ deployment จริง
- Provider ทั้ง 6 ตัวใช้งาน live ได้ครบ; Allmanga/Gogoanime/Goyabu ตรวจ source เท่านั้น

ข้อจำกัดเหล่านี้ควรเป็น acceptance gates ของ implementation ไม่ใช่เติมค่าประมาณให้ response ดูสมบูรณ์

## 10. วิธีทดสอบซ้ำแบบเล็กที่สุด

ใช้ SDK source revision ข้างต้นใน temporary checkout แล้ว `npm ci --ignore-scripts` และ `npm run build` จากนั้นรัน ESM script ต่อไปนี้จาก checkout ไม่ติดตั้ง SDK ลง Sabame เพื่อทำ research:

```javascript
import {
  AnimeParadiseProvider,
  HttpClient,
  FetchTransport,
} from './dist/index.js';

const provider = new AnimeParadiseProvider(new HttpClient({
  transport: new FetchTransport(),
  timeoutMs: 12000,
  retry: false,
}));
const options = { signal: AbortSignal.timeout(45000) };
const hits = await provider.search('Frieren', options);
const title = hits.find(hit => hit.id === 'animeparadise:NIUsb960SxtXls4h');
if (!title) throw new Error('Expected title missing; recheck mapping');
const units = await provider.fetchContentUnits(title.id, options);
const unit = units.find(item => item.number === 1);
if (!unit) throw new Error('Episode 1 missing');
const result = await provider.resolveStream(unit.id, 'sub', options);
if (result.type !== 'video') throw new Error('Not video');
console.log(result.streams.map(stream => ({
  isHLS: stream.isHLS,
  subtitles: (stream.subtitles ?? []).map(track => ({
    language: track.language,
    label: track.label,
    format: track.format,
    host: new URL(track.url).hostname,
  })),
})));
```

สำหรับ title/unit IDs ที่ทดลองอื่น ให้ดู `selected`, `episode`/`unit` ใน [evidence JSON](research/anime-sdk-evidence.json) ตรวจ title mapping ทุกครั้งก่อนใช้ ID เก่า และแยก HTTP errors ออกจาก no-track results คำสั่งนี้ไม่ตรวจ URL availability หรือ sync; อย่าใช้ output เป็นหลักฐานเกินขอบเขตนั้น

## 11. Verification และไฟล์ที่ส่งมอบ

- Build anime-sdk revision ที่ตรวจ: PASS (ESM/CJS/declarations)
- Live provider probes: ผลผสมตามตารางและ evidence ไม่ใช่ all-green test suite
- Offline normalizer check: reproduce `Theatre → th` false positive
- Offline capability check: Anikoto `supportsUnitTracks === false` แต่ `fetchUnitTracks` เป็น function
- ไม่รัน Sabame lint/build/e2e เพราะไม่มี application implementation ในรอบนี้
- [Implementation brief เดิม](anime-sdk-sabame-adaptation.md) เป็นแผนก่อน research; หากมีข้อสมมติขัดกับเอกสารนี้ ให้ใช้ผล source/live evidence นี้ประกอบการปรับแผน

[sdk-types]: https://github.com/hexxt-git/anime-sdk/blob/72d734f1f9bc6d59183ead2fcb0f172ad6018cdf/src/types/index.ts
[sdk-base]: https://github.com/hexxt-git/anime-sdk/blob/72d734f1f9bc6d59183ead2fcb0f172ad6018cdf/src/providers/BaseProvider.ts
[sdk-index]: https://github.com/hexxt-git/anime-sdk/blob/72d734f1f9bc6d59183ead2fcb0f172ad6018cdf/src/index.ts
[sdk-providers]: https://github.com/hexxt-git/anime-sdk/tree/72d734f1f9bc6d59183ead2fcb0f172ad6018cdf/src/providers
[sdk-paradise]: https://github.com/hexxt-git/anime-sdk/blob/72d734f1f9bc6d59183ead2fcb0f172ad6018cdf/src/providers/AnimeParadiseProvider.ts
[sdk-anikoto]: https://github.com/hexxt-git/anime-sdk/blob/72d734f1f9bc6d59183ead2fcb0f172ad6018cdf/src/providers/AnikotoProvider.ts
[sdk-megaplay]: https://github.com/hexxt-git/anime-sdk/blob/72d734f1f9bc6d59183ead2fcb0f172ad6018cdf/src/providers/MegaPlayProvider.ts
[sdk-subtitles]: https://github.com/hexxt-git/anime-sdk/blob/72d734f1f9bc6d59183ead2fcb0f172ad6018cdf/src/utils/subtitles.ts
[sdk-meta]: https://github.com/hexxt-git/anime-sdk/blob/72d734f1f9bc6d59183ead2fcb0f172ad6018cdf/src/meta/BaseMetadataProvider.ts
[sdk-mapping]: https://github.com/hexxt-git/anime-sdk/blob/72d734f1f9bc6d59183ead2fcb0f172ad6018cdf/src/meta/MappingClient.ts
[sdk-server]: https://github.com/hexxt-git/anime-sdk/blob/72d734f1f9bc6d59183ead2fcb0f172ad6018cdf/src/server/index.ts
[sdk-transport]: https://github.com/hexxt-git/anime-sdk/blob/72d734f1f9bc6d59183ead2fcb0f172ad6018cdf/src/transport/transport.ts
[sdk-tests]: https://github.com/hexxt-git/anime-sdk/tree/72d734f1f9bc6d59183ead2fcb0f172ad6018cdf/tests/e2e
[zenshin-package]: https://github.com/hitarth-gg/zenshin/blob/cfd65cda70d242b0dc36b388c4b6a2b17fa6b23f/Electron/zenshin-electron/package.json
[zenshin-api]: https://github.com/hitarth-gg/zenshin/blob/cfd65cda70d242b0dc36b388c4b6a2b17fa6b23f/Electron/zenshin-electron/src/renderer/src/utils/api.js
[zenshin-main]: https://github.com/hitarth-gg/zenshin/blob/cfd65cda70d242b0dc36b388c4b6a2b17fa6b23f/Electron/zenshin-electron/src/main/index.js
[zenshin-license]: https://github.com/hitarth-gg/zenshin/blob/cfd65cda70d242b0dc36b388c4b6a2b17fa6b23f/LICENSE
