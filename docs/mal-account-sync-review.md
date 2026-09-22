# MAL Account Login and Two-Way Sync Review

Reviewed: 2026-09-15. Status: source review and implementation proposal; MAL account integration is not implemented or live-tested.

## Outcome

Use **Continue with MyAnimeList** as Sabame's primary sign-in. Import the authenticated user's anime list, then send explicit progress and status edits back to MAL. Keep **Try demo** as a separate local workspace. A MAL account should work without creating a separate Sabame password.

Keep the existing tracker UI and media resolver. Account/list synchronization belongs in a new server-side MAL integration; media availability remains independent of whether an anime is in the user's list.

## Findings in the Current Repository

| Priority | Finding and evidence | Required change |
| --- | --- | --- |
| High | `src/components/login-form.tsx` and `tracker/model.ts` accept any valid email plus six-character password. `tracker/store.ts` writes a `DemoSession` to localStorage. | Replace the primary form with MAL authorization; obtain identity from the server. Browser state cannot authorize MAL requests. |
| High | `tracker/store.ts` uses one `sabame:v1` key. Logout clears only the session, and hydration merges seed entries into the library. | Isolate data and pending writes by MAL user ID. Never import demo progress into an account automatically or populate a real empty account with seed data. |
| High | `tracker/types.ts` and `persistence.ts` accept only watching/planned/completed. | Preserve MAL's on-hold and dropped states; update filters, selectors, validation, and status controls together. |
| High | `seed.ts` represents Mushoku S2 as 24 episodes while `seed-artwork.json` supplies one MAL ID. Provider mappings already split it across two cours. | Use one canonical MAL ID per account library entry. Do not send combined progress to the artwork's ID. Verify each season before any optional demo migration. |
| High | `store.ts` progress/status actions only update local state. `watch/[animeId]/page.tsx` also creates a planned entry automatically on opening a title. | Introduce explicit sync intents. Viewing a page, registering metadata, and restoring state must never create or modify a MAL list entry. |
| Medium | `persistence.ts` silently limits catalog to 500 items and library to 1,000; entries with missing catalog metadata disappear from selectors. | Use paginated account storage and visible import progress. Do not silently truncate a real MAL list. |
| Medium | `model.ts` changes `updatedAt` for playback position and episode selection as well as progress. | Separate playback timestamps, local edit revisions, and the last acknowledged MAL snapshot. |
| Medium | `Anime.score` is a catalog rating; `LibraryEntry` has no personal score or rewatch fields. | Keep aggregate rating separate from personal score. Preserve remote fields that Sabame does not edit. |

These are gaps for real account integration; the current UI explicitly labels itself a demo.

## Proposed User Flow

```text
Continue with MyAnimeList
  → Sabame creates a short-lived authorization transaction
  → MAL login and user consent
  → Sabame verifies callback and exchanges code on the server
  → Fetch authenticated MAL profile; create Sabame session
  → Import every list page into the account workspace
  → Dashboard / Library / Watch

User edits watched count or status
  → Local UI shows Pending sync
  → Sabame saves an account-scoped sync operation
  → Check remote state and send the requested fields to MAL
  → Apply acknowledged response; show Synced
```

Show separate states for authorization cancellation, import failure, expired connection, pending changes, retryable errors, and conflicts. Login can succeed while import fails; offer Retry import without discarding the session or showing demo records.

Account menu: MAL username, last successful sync, Sync now, reconnect when needed, and Sign out. Sign out invalidates the server session and clears the active account view. Disconnect additionally removes the stored connection and stops its pending work; it must not delete MAL entries.

## Official API and Authentication

The official [MAL authorization guide](https://myanimelist.net/apiconfig/references/authorization) documents Authorization Code with PKCE, currently supporting `plain`. Create a fresh random verifier and `state` per login, bind them to the initiating browser, expire and consume the transaction once, and reject mismatched callbacks. Register the exact callback URI. Exchange and refresh credentials only on the server; derive expiry from the returned `expires_in` rather than hardcoding a lifetime.

The account API contract is based on the official [MAL API v2 reference](https://myanimelist.net/apiconfig/references/api/v2):

| Purpose | MAL endpoint |
| --- | --- |
| Authorize | `GET https://myanimelist.net/v1/oauth2/authorize` |
| Exchange code / refresh token | `POST https://myanimelist.net/v1/oauth2/token` |
| Identify the signed-in user | `GET https://api.myanimelist.net/v2/users/@me` |
| Import their list | `GET https://api.myanimelist.net/v2/users/@me/animelist` |
| Read one anime and current user list status | `GET https://api.myanimelist.net/v2/anime/{id}?fields=my_list_status` |
| Update watched count / status | `PATCH https://api.myanimelist.net/v2/anime/{id}/my_list_status` |

Use the authenticated user's numeric ID as the account key. Request only needed profile fields; do not require or fabricate an email address. Public catalog metadata does not provide account authorization. Existing anime-sdk/Jikan catalog access does not replace the MAL account API.

## Data and Sync Rules

1. **Canonical identity:** account entries use `mal-{id}`. Deduplicate by MAL ID, never title text. Keep seed/provider episode offsets outside account identity. A title without a playable source still belongs in the library and supports tracking.
2. **Initial import:** MAL supplies the initial snapshot. Preserve all five list statuses, watched count, personal score, rewatch state, and remote update time. Store unexposed fields without writing defaults back. An empty list is a valid result.
3. **Status mapping:** `plan_to_watch` maps to Sabame `planned`; `watching`, `completed`, `on_hold`, and `dropped` retain their meaning. Import snapshots directly rather than calling mutation helpers that derive status from counts. A MAL episode total of zero should represent an unknown total, not a completed zero-episode series.
4. **Explicit writes:** send only changed, validated fields. Write absolute watched counts, not increment commands. Do not send scores, dates, comments, or rewatch fields when the user only changes progress. Preserve deliberate decreases.
5. **Playback:** resume seconds and selected episode remain local initially. Do not enqueue from `timeupdate`, hydration, or a generic subscription to all store changes. Episode completion can create one intent tied to the account, title, and expected episode; duplicate or stale completion callbacks must be ignored. Preserve the current meaning of watched count as progress through episode N.
6. **Acknowledgement:** a local edit is not synchronized until MAL confirms it. Keep durable pending operations, last acknowledged values, and local revisions. Serialize/coalesce writes per account and anime; an old response must not overwrite a newer local edit.
7. **Conflict handling:** compare the last acknowledged snapshot, local intent, and a fresh remote value per edited field. Merge disjoint edits; surface incompatible edits to the same field. Offer Use MAL / Keep my change. Do not resolve by blindly taking the larger count or comparing browser clocks. Remote reads and writes are not assumed atomic; document the residual race with simultaneous edits on MAL itself.
8. **Retries:** bound attempts and use backoff for throttling and transient errors. After an ambiguous timeout, read the current remote value before resending an absolute assignment. Refresh tokens under a per-account lock and persist replacement credentials atomically. Revoked authorization requires reconnection.
9. **Pulls and deletions:** pull on login, explicit Sync now, and throttled return to the foreground. Do not claim instant background synchronization. Commit a full import only after all pages succeed; an incomplete page set cannot prove deletion. Remote removal with a local pending edit becomes a conflict. Automated outbound deletion is outside the first release.

## Server Storage and Security

Recommend a relational database for account connections, sessions, list snapshots, import runs, and pending sync operations. The repository has no database/authentication dependency today, so deployment storage must be configured before a real launch.

Use server-only modules with encrypted access/refresh tokens and an opaque session ID in an HttpOnly, Secure-in-production, SameSite=Lax cookie. Store the session ID hash server-side. Authenticate every account route, check origin/CSRF protection on mutations, validate input, and disable shared caching for private responses. Accept account ownership from the server session, never from a client-supplied user ID.

Keep tokens, callback codes, authorization URLs, and secrets out of browser storage and logs. Account-scoped diagnostics should record operation IDs, outcomes, duration, and sanitized error codes. Follow the installed Next.js documentation: `cookies()` is asynchronous and cookie writes belong in Route Handlers or Server Functions.

Proposed server configuration: `MAL_CLIENT_ID`, `MAL_CLIENT_SECRET`, `MAL_REDIRECT_URI`, `DATABASE_URL`, and `MAL_TOKEN_ENCRYPTION_KEY`. Add names and setup instructions to `.env.example`; provision actual values privately. The existing media signing secret remains separate. Review an authentication/session library's actual MAL/PKCE compatibility before adopting it.

## Implementation Sequence and File Scope

| Phase | Files to add or update | Exit criteria |
| --- | --- | --- |
| 1. Account foundation | New `src/features/mal/server/{config,oauth,session,repository}.ts`, database migrations, `src/app/api/auth/mal/{start,callback}/route.ts`, session/logout routes; update login page/form and account menu | Validated OAuth callback, server identity, isolated demo mode, expiry/logout behavior |
| 2. Import | New `src/features/mal/{types,normalization}.ts`, `server/{client,import}.ts`, MAL list/import routes; update tracker types, persistence, store, selectors, library and watch status controls | All pages and statuses preserved; no seed upload, account mixing, duplicates, or truncation |
| 3. Push and reconcile | New `src/features/mal/server/sync.ts`, sync operation storage, authenticated progress route and a sync-status component; update explicit tracker/watch actions | Acknowledged progress writes, ordering, retry, refresh, conflict handling, reconnect |
| 4. Verification and setup | Colocated MAL/session/sync tests, `e2e/mal-account.spec.ts`, `.env.example`, README, implementation documentation | Deterministic end-to-end flow plus a separately identified live MAL test |

Lead owns session security, sync semantics, season identity, integration, and QA. Bounded helper tasks can cover DTO mapping/tests, API client tests, and UI states after the contracts are fixed. Reuse existing tracker actions and media resolver rather than duplicating provider logic.

## Acceptance Tests

- Login success, consent denial, tampered/expired/replayed callback, invalid session, refresh failure, and logout.
- Full paginated and empty imports; on-hold/dropped entries; unknown episode counts; more than 500 titles; interrupted pagination.
- Account A → logout → account B cannot expose A's library or send A's pending edits using B's credentials. Demo progress never uploads automatically.
- Progress/status edits reach the exact MAL ID; a progress-only edit preserves score and rewatch fields. Combined demo seasons cannot produce an unsafe write.
- Duplicate completion, rapid increments/decrements, out-of-order responses, concurrent tabs, retry after timeout, throttling, and revoked credentials.
- Same-field conflict, disjoint-field merge, remote deletion, and re-import while local changes are pending.
- Browser flow: MAL login → list import → edit progress → confirmed sync → reload; failure messages and reconnect are accessible.
- Live acceptance with a consenting account: read a known entry, perform an explicitly chosen progress edit, independently read it back from MAL, and record results without credentials. Mock tests alone cannot establish real MAL sync.

## Review Evidence and Limits

Read the current login, app shell, tracker store/model/types/persistence/selectors, library/watch integration, seed identities, provider mappings, package configuration, and installed Next.js authentication/cookie guides. The official MAL documentation was retrieved as HTML and embedded API reference data; the web reader could not render those pages directly.

Ran `npm test -- src/components/login-form.test.tsx src/features/tracker/store.test.ts src/features/tracker/model.test.ts src/features/tracker/media-persistence.test.ts src/features/tracker/selectors.test.ts`: **22 tests passed across 5 files**. Lint, TypeScript, and `npm run build -- --webpack` also passed. These validate current local behavior, not OAuth or MAL writes. This change adds the review document only; no real account was accessed or modified.
