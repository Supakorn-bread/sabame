# NestJS and PostgreSQL migration

Sabame keeps Next.js for its UI and media delivery. NestJS owns MAL OAuth,
sessions, imports, tracking writes, anime metadata, seasonal lists, and schedules.
Both applications use the same domain contracts and catalog implementation.
No SQLite data is uploaded or deleted by this migration.

## Local development

Use Node 22.13+ and npm. Run commands below from the repository root.

1. Run `npm ci`, then copy `apps/web/.env.example` to `apps/web/.env.local` and
   `apps/api/.env.example` to `apps/api/.env`. Keep both files out of Git.
2. Run `npm run db:up` to start PostgreSQL 16 on localhost port 55432.
   Its development database is `sabame_dev`, username `sabame`, password
   `sabame_local`. These credentials are only for the local container.
3. Set backend `DATABASE_URL` and `DIRECT_URL` to
   `postgresql://sabame:sabame_local@127.0.0.1:55432/sabame_dev`.
4. Run `npm run db:migrate`, then `npm run dev`. The frontend uses port 3000;
   NestJS uses port 4000. Shared packages build before startup; after editing
   a shared package, restart the development command to rebuild it.
5. Register `http://localhost:3000/api/auth/mal/callback` as the MAL callback.
   Set backend `APP_ORIGIN=http://localhost:3000` and the matching
   `MAL_REDIRECT_URI`. Supply MAL credentials and a separate 64-hex-character
   `MAL_TOKEN_ENCRYPTION_KEY` in the backend environment.

`npm run db:stop` stops PostgreSQL without deleting its volume. Do not use
`docker compose down -v` unless you intend to delete the local database.
Without MAL credentials, the backend must still run for the frontend's demo
and unconfigured-login state. Database migrations never run during application
startup or a web request.

## Fresh database cutover

- Review pending edits in the existing application and sync them to MAL before
  cutover. Local pending edits are not included in a fresh server database.
- Keep the old ignored `.data/sabame.sqlite` and its encryption key as a local
  recovery source. This migration neither reads nor deletes that database.
- Users sign in again and import their MAL lists. Old server sessions cannot
  authenticate against the new database.
- Browser demo data, per-account pending edits, and local resume positions keep
  their existing behavior. Do not clear browser storage as a migration step.
  Re-import and normal conflict handling reconcile retained browser edits.
- PostgreSQL stores encrypted tokens; keep its encryption key stable. Losing or
  replacing that key requires affected users to reconnect MAL.

## Two Vercel projects, one public origin

Create a frontend project using `apps/web` and a NestJS project using
`apps/api`. Enable access to files outside both project roots so npm workspaces
and shared packages can be built. Use separate databases/configuration for
production and preview; never point an unconfigured preview at production.

Build the backend with its Vercel build configuration, which builds shared
packages and generates Prisma Client. The frontend's checked-in Vercel config
runs the repository-root `npm run build` to build its shared dependencies first.
Do not apply schema migrations from either project's automatic build command.
Apply the checked-in Prisma migrations once, explicitly, with `npm run db:migrate`
against the intended environment before deploying the backend.

| Environment | Values |
| --- | --- |
| Next.js | `BACKEND_URL` set to the corresponding NestJS HTTPS origin |
| NestJS | Pooled Neon `DATABASE_URL`, direct `DIRECT_URL` for migration tooling |
| NestJS | `APP_ORIGIN` set to the frontend's stable HTTPS origin |
| NestJS | `MAL_CLIENT_ID`, `MAL_CLIENT_SECRET`, `MAL_REDIRECT_URI`, `MAL_TOKEN_ENCRYPTION_KEY` |
| NestJS | `ANIMESCHEDULE_API_TOKEN` for schedules |
| Next.js media | Existing `MEDIA_PROXY_SECRET`, `MEDIA_ALLOWED_HOSTS`, optional `MAL_CLIENT_ID` |

The MAL callback stays on the **frontend** domain at `/api/auth/mal/callback`.
Selected `/api` paths are rewritten to NestJS with their method, body, cookies,
and query string intact. Session cookies are host-only. Browser code continues
using relative URLs; it does not need cross-origin credentials or CORS.
Never cache authenticated API responses at the CDN.

Library responses retain their existing fields and add an optional `nextCursor`
when more data remains. The browser follows `/api/mal/list?cursor=...` and applies
the snapshot only after every page arrives. Pages contain at most 50 entries and
50 pending operations, with a 3 MiB response guard. Account revisions invalidate
continuations when the library or outbox changes; a 409 `library_changed` keeps
the old visible list and asks the user to retry. This avoids Vercel's 4.5 MB
ordinary Function response limit without changing the library UI.

Keep the backend accessible to the frontend rewrite. A deployment-protection
login page in front of the backend will break API calls; use environment-specific
deployment access settings rather than putting bypass secrets in client code.
For OAuth testing use a stable preview/staging frontend URL registered with MAL.

Deploy the backend first, verify `/api/health` and `/api/ready`, then deploy the
frontend with its backend URL. Verify cookies, login, import, and logout through
the frontend domain. Select nearby frontend-function/backend/database regions
when provisioning; this repository does not provision resources or paid plans.

## Verification and rollback

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:api`,
`npm run test:integration`, `npm run build:all`, and `npm run test:e2e`.
Integration tests need a dedicated local `sabame_test` database; create it with
`docker compose exec postgres createdb -U sabame sabame_test` and set
`TEST_DATABASE_URL=postgresql://sabame:sabame_local@127.0.0.1:55432/sabame_test`.
Never use production credentials for tests.

To exercise OAuth cookie forwarding in Playwright, first apply migrations to
the dedicated local test database with `DIRECT_URL` set to its URL, then run
`npm run test:e2e` with `TEST_DATABASE_URL` set. The backend uses dummy OAuth
credentials and tests consent denial without contacting MAL. Without that
variable, Playwright verifies the unconfigured-account flow instead.

Release checks: two independent accounts, expired/revoked sessions, token
refresh, progress updates, conflict resolution, interrupted imports, and
persistence after redeployment. Inspect health/readiness and redacted API error
logs; never log OAuth codes, cookies, access tokens, connection strings, or keys.

Rollback frontend and backend to a compatible deployment pair. Preserve the
PostgreSQL database and encryption key; do not roll migrations back by dropping
tables. The former SQLite backend cannot be used as a Vercel rollback target.

Media providers, licensing, stream delivery, and media bandwidth remain a later
phase. Successful backend migration does not certify the existing playback
integration for a public release.
