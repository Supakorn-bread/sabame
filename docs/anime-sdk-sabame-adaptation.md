# Sabame Anime Aggregator/Player Implementation Brief

เอกสารนี้ปรับเป้าหมาย Anime Aggregator/Player ให้เข้ากับโครงสร้างปัจจุบันของโปรเจกต์ Sabame โดยตรง

> ผลวิจัย source code และ live provider probes วันที่ 10–11 September 2026 อยู่ใน [anime-sdk-investigation.md](anime-sdk-investigation.md) พร้อม [evidence JSON](research/anime-sdk-evidence.json) ให้ใช้หลักฐานนี้ปรับสมมติฐานใน brief ก่อน implementation โดยยังไม่พบ Thai track ใน episode responses ที่ทดสอบ

## เป้าหมาย

พัฒนา Sabame จาก Anime Tracker/Demo Player ไปเป็น Anime Aggregator/Player ที่สามารถ:

1. ค้นหา Anime
2. เลือก Episode
3. หา media/video source จาก provider
4. ตรวจสอบ subtitle tracks ของ episode
5. หา Thai subtitle (`th`, `tha`, `Thai`) ถ้ามี
6. ส่งกลับเป็น unified response ให้ frontend/player
7. ลอง provider อื่นเมื่อ provider หลักไม่มี Thai subtitle หรือเกิดข้อผิดพลาด
8. ไม่ผูก frontend เข้ากับ provider ใด provider หนึ่งโดยตรง
9. รักษาระบบ library, playback progress และ persistence เดิมของ Sabame

## References

- [Zenshin](https://github.com/hitarth-gg/zenshin)
- [anime-sdk documentation](https://anime-sdk.hexxt.dev/)
- [anime-sdk GitHub](https://github.com/hexxt-git/anime-sdk)

## สถานะโครงสร้าง Sabame ปัจจุบัน

ตรวจจาก repository ปัจจุบัน:

- Next.js 16.3.3 App Router, React 19.2.8, strict TypeScript
- Zustand 5 และ Tailwind CSS 4
- `src/features/tracker/types.ts` มี `Anime`, `LibraryEntry`, `DemoSession`
- `src/features/tracker/seed.ts` มี `ANIME_CATALOG`, `getAnimeById()` และ seed library
- `src/features/tracker/model.ts` จัดการ episode selection, playback position, completion และ library status
- `src/features/tracker/store.ts` ใช้ Zustand persistence ด้วย key `sabame:v1`, version 1
- `src/components/layout/header-search.tsx` ค้นหาเฉพาะ seed catalog
- `src/app/watch/[animeId]/page.tsx` อ่าน anime จาก seed catalog และสร้าง episode list จาก `totalEpisodes`
- `src/components/simulated-player.tsx` เป็น player จำลอง ยังไม่มี video stream จริง
- `src/components/layout/app-shell.tsx` จัดการ demo session, navigation, theme และ route fade
- มี Vitest/Testing Library สำหรับ unit/component tests และ Playwright/Axe ใน `e2e/`
- ยังไม่มี `anime-sdk` หรือไลบรารีสำหรับเล่น HLS ใน dependencies

ข้อควรระวัง:

- Anime ID เช่น `skyward-bloom` เป็น local Sabame ID ของ Frieren ไม่ใช่ provider ID หรือ MAL ID
- `getAnimeById()` ทำให้ remote anime ที่ไม่อยู่ใน seed catalog ยังใช้ tracker เดิมไม่ได้
- Playback position ปัจจุบันจำกัดด้วย `anime.episodeMinutes * 60` จึงต้องรองรับ duration จริง
- Demo session ใน localStorage ไม่ใช่ server authentication

## Architecture เป้าหมาย

```text
Sabame Search / Catalog
  ↓
Canonical Anime Identity
  ↓
Episode Selection
  ↓
Server-side Media Aggregator
  ├─ Metadata / Provider ID Mapping
  ├─ Media Resolver → anime-sdk provider adapters
  └─ Subtitle Resolver → normalize / validate / rank
  ↓
Unified Media Response
  ↓
Real Player + Existing Tracker
```

แนวคิดการทำงานของ SDK ที่ต้องยืนยันจาก source จริง:

```text
Anime
  ↓
Content Unit
  ↓
Provider
  ↓
resolveStream()
  ↓
Video + Tracks
```

## สิ่งที่ต้องตรวจจาก source code จริงก่อนเขียนโค้ด

ห้ามเดา API จาก README อย่างเดียว ให้ตรวจ source code และ version/commit ที่ใช้งานจริง:

- Provider registry และ provider ทั้งหมด
- Provider interface และ `IContentUnit`
- ความหมายของ `availableLanguages`
- Signature, arguments และ return type ของ `resolveStream()`
- `/tracks` และ `/meta/tracks` อยู่ในไฟล์ใด และถูกเรียกอย่างไร
- โครงสร้าง `tracks[]`
- Field ที่ระบุภาษา เช่น `language`, `lang`, `srclang`, `label` หรือ field อื่น
- Subtitle formats ที่รองรับ เช่น VTT, SRT, ASS
- External subtitle URLs, embedded subtitles และ HLS subtitle renditions
- Video output เช่น HLS, MP4, torrent หรือ embed
- Runtime requirements เช่น browser, cookie, session, headers, CORS และ URL expiry
- License และข้อจำกัดของ SDK

หาก API ที่กล่าวถึงไม่มีใน revision ปัจจุบัน ให้รายงานว่าไม่พบและอธิบาย API จริง ห้ามสร้าง API ขึ้นมาให้ตรงกับโจทย์

ต้องแยกให้ชัดเจน:

```text
SDK capability
≠ Provider capability
≠ Episode-specific subtitle availability
≠ Browser playback compatibility
```

## การทดสอบ provider จริง

หาก environment และ public SDK interface อนุญาต ให้ทดสอบอย่างน้อย 3 anime คนละเรื่อง เรื่องละอย่างน้อย 1 episode และตรวจ `tracks[]` จริง

เริ่มจากชื่อเรื่องใน seed catalog ได้ แต่ต้องยืนยัน season, cour, episode mapping และ provider ID ก่อน ห้ามส่ง local slug เป็น provider ID หรือเลือกผลค้นหาแรกโดยอัตโนมัติ

บันทึกข้อมูลต่อไปนี้:

- Anime title, season และ canonical ID ถ้ามี
- Provider ID, content-unit ID และ episode number
- วันเวลาทดสอบและคำสั่งที่ทำซ้ำได้
- Video type และ track fields ที่ได้รับจริง
- ภาษาก่อนและหลัง normalize
- Subtitle format และผลตรวจ URL
- Error หรือ blocker เช่น timeout, 403 และ session dependency

หากทดสอบไม่ได้ ให้ระบุ `UNTESTED` หรือ `BLOCKED` พร้อมเหตุผล ห้ามใช้ mock เป็นหลักฐาน Thai และห้ามสรุปว่าไม่มี Thai เพียงเพราะ request ล้มเหลว

## รายงานวิจัยที่ต้องส่งก่อน implementation

### Provider matrix

| Provider | Video | Subtitle Tracks | Multi-language | Thai confirmed | Format | Evidence / Limitations |
|---|---|---|---|---|---|---|
| ตรวจจาก source จริง |  |  |  |  |  |  |

`Thai confirmed` ต้องมาจาก actual episode response เท่านั้น ใช้ `YES`, `NO in tested episode`, `UNTESTED` หรือ `BLOCKED` ตามหลักฐาน

สำหรับแต่ละ episode ให้แยกผลดังนี้:

```text
SDK supports subtitle abstraction: YES/NO
Provider returns subtitle tracks: YES/NO
Tested episode contains Thai: YES/NO/UNTESTED
Thai subtitle externally hosted: YES/NO
Thai subtitle format: VTT/SRT/ASS/...
Thai URL reachable: YES/NO/UNKNOWN
Thai subtitle verified to match video: YES/NO
Browser playback tested: YES/NO
```

### Source flow

ระบุ function, file, provider และ endpoint จริงในรูปแบบ:

```text
function A
  ↓
function B
  ↓
provider
  ↓
endpoint
  ↓
tracks[]
```

## Catalog identity และ tracker integration

- ใช้ canonical Sabame ID ที่คงที่ และเก็บ provider mappings ฝั่ง server
- รักษา local seed IDs และข้อมูลผู้ใช้เดิม
- รองรับ remote search ให้ watch route และ tracker ใช้งานได้จริง
- แยก season, cour, specials และ episode numbering
- หาก mapping กำกวม ให้คืนสถานะ `mapping_required`
- หากเปลี่ยน persisted schema ให้เพิ่ม version, migration และ tests
- Persist เฉพาะ metadata/progress ที่จำเป็น
- ห้าม persist stream URLs, signed subtitle URLs หรือ raw provider responses

## ไฟล์ที่คาดว่าจะเพิ่มหรือแก้

ปรับชื่อและตำแหน่งตามผล inspection จริง:

```text
src/features/catalog/types.ts
src/features/catalog/server/catalog-service.ts
src/features/catalog/server/identity-mapping.ts

src/features/media/types.ts
src/features/media/subtitle-language.ts
src/features/media/subtitle-resolver.ts
src/features/media/server/provider-adapter.ts
src/features/media/server/providers/anime-sdk-adapter.ts
src/features/media/server/media-resolver.ts
src/features/media/server/subtitle-validator.ts

src/app/api/anime/search/route.ts
src/app/api/anime/[animeId]/episodes/route.ts
src/app/api/anime/[animeId]/media/route.ts

src/components/player/anime-player.tsx
docs/anime-sdk-investigation.md
```

ต้องแยก pure utilities, shared DTOs และ server-only provider/network logic ไม่ให้ SDK หรือ secrets เข้า client bundle

## Unified response

ปรับ type ให้ตรงกับข้อมูลจริงจาก SDK แต่ต้องรักษา provider abstraction:

```typescript
interface MediaResult {
  provider: string;
  video: {
    url: string;
    type: "hls" | "mp4" | "torrent" | "unknown";
  };
  subtitles: SubtitleTrack[];
  audio?: AudioTrack[];
  metadata: {
    animeId: string;
    episodeNumber: number;
    durationSeconds?: number;
  };
}

interface SubtitleTrack {
  language: string;
  label: string;
  url: string;
  format: "vtt" | "srt" | "ass" | "unknown";
  default?: boolean;
  availability: "reachable" | "unreachable" | "unknown";
  syncStatus: "verified" | "unverified";
}
```

Frontend ห้าม import SDK provider types และห้าม branch logic ตามชื่อ provider

## Thai subtitle normalization

สร้าง utility ให้ตรงกับ interface จริงของ SDK เช่น:

```typescript
normalizeLanguage(value: unknown): string | undefined
isThaiSubtitle(track: SubtitleLanguageInput): boolean
```

อย่างน้อยต้อง normalize:

```text
Thai, thai, TH, th, tha, th-TH → th
```

พิจารณา whitespace, locale variants และชื่อภาษาไทยเมื่อมีข้อมูลรองรับ ต้องป้องกัน false positives จาก substring เช่น `th` ในคำอื่น

แยก subtitle/caption tracks ออกจาก thumbnails, chapters และ audio language ไม่ใช้ audio ภาษาไทยเป็นหลักฐาน subtitle ภาษาไทย

## Provider fallback และ subtitle matching

จัดอันดับผลลัพธ์ตามข้อมูลจริงของ episode:

1. Video ที่เล่นได้ + Thai subtitle ที่ใช้งานได้
2. Video ที่เล่นได้ + English subtitle ที่ใช้งานได้
3. Video ที่เล่นได้ แม้ไม่มี subtitle ที่ใช้งานได้

กำหนด timeout, retry/concurrency limits และ overall deadline ให้ deterministic

- Provider error, empty response, invalid source หรือ Thai URL เสีย ต้องลอง provider ถัดไป
- เก็บ candidate เดิมไว้หาก provider ถัดไปล้มเหลว
- อย่าใช้ HEAD failure เพียงอย่างเดียวสรุปว่า URL เสีย
- เลือก video และ subtitles เป็นชุดจาก resolution/source เดียวกันเป็นค่าเริ่มต้น
- อย่ารวม subtitle ข้าม provider อัตโนมัติ
- หากหลักฐานไม่พอ ให้ใช้ `syncStatus: "unverified"`

การ matching ต้องพิจารณา release group, source, resolution, codec, episode number, duration, filename, metadata และ timing

## การเชื่อม real player กับ Sabame

- แก้ watch page ให้เรียก unified API
- รองรับ HLS/MP4 ตาม browser capability
- เพิ่ม subtitle selector พร้อมสถานะ Thai จากข้อมูลจริง
- ใช้ native `<track>` กับ WebVTT เท่านั้น หากไม่แปลง SRT/ASS อย่างถูกต้อง
- Torrent/embed/unsupported source ต้องมีสถานะชัดเจน
- เพิ่ม loading, empty, retry, playback error และ expired-source handling
- ยกเลิกหรือ ignore stale requests เมื่อเปลี่ยน anime/episode
- ใช้ media events จริงสำหรับ play, pause, seek, duration และ progress
- ใช้ duration จริงแทน `episodeMinutes` เมื่อมีข้อมูล
- รักษา explicit “Mark episode complete” และป้องกัน event จาก episode เก่า
- ห้าม fallback ไป simulated playback แบบเงียบ ๆ จนดูเหมือน stream สำเร็จ

## Security และ reliability

- ห้าม bypass Cloudflare, authentication, DRM หรือ anti-bot protection
- หาก provider ต้องใช้ browser session/cookie ให้ document dependency และข้อจำกัด
- ใช้ official/public SDK interface ก่อน ไม่เขียน scraper เพิ่มโดยไม่จำเป็น
- ไม่ hardcode secrets และไม่ส่ง private headers/cookies ไป frontend
- Validate API inputs และ upstream responses
- ตรวจ subtitle URL ฝั่ง serverต้องป้องกัน SSRF, redirects, private/internal addresses, timeout และ size limits
- ไม่สร้าง unrestricted proxy
- Log เฉพาะ request ID, provider, episode, latency, error code และ language summary โดย redact sensitive URLs

## Tests และ acceptance criteria

ต้องเพิ่ม deterministic unit/component tests สำหรับ:

1. Video + Thai subtitle
2. Video + English only
3. Video + multiple subtitle languages
4. Provider ไม่มี subtitle
5. Provider error → fallback สำเร็จ
6. Label `"Thai"`
7. Language `"th"`
8. Language `"tha"`
9. Thai subtitle URL ใช้งานไม่ได้ → fallback/ranking ถูกต้อง
10. `"TH"`, `"thai"`, `"th-TH"`, whitespace, missing fields และ false positives
11. ทุก provider ล้มเหลว
12. Timeout/cancellation และ stale episode response
13. Mapping กำกวม/season ผิด
14. ไม่ merge subtitles ข้าม provider โดยไม่ยืนยัน
15. Persistence migration และไม่บันทึก ephemeral URLs

เพิ่ม Playwright flow:

```text
search → watch → select episode → resolve media → choose subtitle
→ update progress → reload/resume
```

ใช้ controlled fixtures และ media ที่มีสิทธิ์ใช้ แยก live provider smoke tests ออกจาก CI ปกติ

รัน verification commands:

```text
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

ใช้ `npm run build -- --webpack` เมื่อ Turbopack ใช้ไม่ได้ และรายงานเหตุผล

## ข้อห้ามสำคัญ

ห้ามเขียนว่า:

> anime-sdk supports Thai subtitles

จาก type definitions หรือ documentation เพียงอย่างเดียว ต้องระบุ provider, anime, episode และหลักฐาน actual response ที่พบ Thai track เสมอ
