# MyAnimeList Accounts in Sabame

Sabame now includes MAL OAuth login, complete list import, and two-way progress/status sync. The first implementation runs on Node.js 22.13+ with a persistent SQLite database. A real MAL connection requires your registered application credentials; the browser tests use explicit fixtures and do not access a real account.

## Run Locally

1. Register a **Web** application through [MAL API configuration](https://myanimelist.net/apiconfig).
2. Register the callback URL `http://localhost:3000/api/auth/mal/callback` exactly. Use your HTTPS origin for a hosted Node server.
3. Add these values to the existing, ignored `.env.local` without removing your media configuration:

   ```dotenv
   MAL_CLIENT_ID=your-client-id
   MAL_CLIENT_SECRET=your-client-secret
   MAL_REDIRECT_URI=http://localhost:3000/api/auth/mal/callback
   MAL_TOKEN_ENCRYPTION_KEY=your-64-character-hex-key
   # Optional; defaults to .data/sabame.sqlite
   MAL_DATABASE_PATH=
   ```

   Generate the encryption key with `openssl rand -hex 32`. Keep the value private and stable across restarts; replacing it makes existing encrypted connections unreadable and requires users to reconnect.
4. Run `npm run dev`, open `/login`, and select **Continue with MyAnimeList**. Log in and authorize on MAL itself. Sabame never asks for the MAL password.
5. After import, open **Library**. Change a watched count or list status; wait for **Synced with MyAnimeList**, then verify the value on MAL. Use **Sync now** to import changes made on MAL.

Without credentials, the login screen explains that MAL is not configured and **Try demo instantly** remains usable. It does not simulate a successful MAL connection.

## Implemented Behavior

- OAuth Authorization Code with MAL's documented `plain` PKCE, unique verifier/state, a browser-bound transaction, and one-time callback consumption.
- Opaque HttpOnly session cookies. Access/refresh tokens are AES-256-GCM encrypted in the server database; tokens and codes are excluded from browser state and application logs.
- All list pages are imported before replacing a snapshot. Empty lists are valid, and incomplete imports retain the previous data.
- Watching, Plan to Watch, Completed, On Hold, and Dropped states; personal MAL scores are shown separately from community ratings.
- Demo and MAL account libraries are isolated. A browser cache cannot authenticate a MAL user. Pending changes and local resume positions are scoped to the verified MAL user ID.
- Explicit progress/status edits enqueue absolute values. Viewing a title, hydrating state, and saving playback seconds do not write to MAL. Finishing an actual episode can update progress; the demo simulator never changes a real account.
- MAL writes use canonical `mal-N` IDs. Combined demo seasons cannot be written to a single MAL season accidentally.
- Failed edits remain available for retry. Conflicts offer **Use MAL** or **Keep my change**; the client does not silently prefer a larger watched count.
- Session logout revokes that browser session. It does not delete the user's MAL list or revoke MAL's application authorization.

## Storage and Deployment

SQLite creates tables automatically on first configured account request. The default `.data/` directory is ignored by Git. Back up the database and encryption key securely. The repository has no hosted database dependency or automatic paid provisioning.

Run this version on a Node server with a persistent disk. Ephemeral/serverless filesystems such as Vercel Functions are **not supported** by this storage adapter; MAL configuration fails closed there. A shared transactional database adapter is required before such a deployment. Node's built-in SQLite module can emit an experimental warning on Node 22.

Database tables cover accounts, sessions, OAuth transactions, imported entries, durable sync operations, and account-wide leases. Leases serialize token refresh and sync across requests/processes using the same database. Browser operations retain IDs and baselines across retries; credentials never enter that outbox.

## Scope and Limits

- Refresh occurs during login/import or **Sync now**; there is no background worker or promise of immediate updates while the app is closed.
- A network edit not yet received by Sabame's server remains in the account's browser outbox. Clearing browser storage can discard that unsent edit. Changes accepted by the server survive browser restarts.
- MAL provides no documented atomic compare-and-swap for list writes. A simultaneous edit directly on MAL can still race between the preflight read and PATCH.
- Progress and status are editable; personal scores and rewatch information are displayed/preserved. Score editing, automatic list deletion, and dedicated disconnect/revoke UI are outside this first version.
- Local resume positions remain on that browser. Sign-out isolates the active view but does not wipe account caches or revoke the app at MAL; use MAL's authorized application settings to revoke access.
- Metadata/list availability does not guarantee a playable media provider or Thai subtitles.

## Verification

Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run test:e2e`. Playwright builds with webpack and covers demo regressions plus MAL login states, imported list rendering, progress acknowledgement, conflicts, retries, and logout. Server tests exercise actual SQLite persistence with mocked upstream MAL responses, OAuth state/replay rejection, encrypted credentials, pagination, refresh, and idempotent updates.

Browser screenshots are written to `test-results/login-mal.png` and `test-results/library-mal-imported.png`. Imported-list screenshots use test fixtures; they are not proof of a live account connection. No real MAL account is modified by automated tests.

Official contracts: [MAL OAuth](https://myanimelist.net/apiconfig/references/authorization), [MAL API v2](https://myanimelist.net/apiconfig/references/api/v2). Architecture background: [account sync review](mal-account-sync-review.md).
