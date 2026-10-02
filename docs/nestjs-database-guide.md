# Using NestJS and PostgreSQL in Sabame

Reviewed against the repository on 2026-09-28. This guide describes the implemented backend and how to work with it. Commands run from the repository root unless stated otherwise.

## 1. What is implemented

| Component | Role in Sabame |
| --- | --- |
| Next.js — `apps/web` | UI, browser state, API forwarding, and current playback endpoints |
| NestJS 11 — `apps/api` | MAL login, sessions, library imports, tracking updates, anime metadata, and schedules |
| Prisma 7 | Typed database access and versioned SQL migrations |
| PostgreSQL 16 locally | Persistent account, session, library, and sync data |
| Neon PostgreSQL in production | Intended hosted database; provisioning is separate from this implementation |

The repository is a monorepo. The backend is one modular monolith: all Nest feature modules run together in one application.

```mermaid
flowchart LR
  Browser -->|Same-origin /api requests| Web[Next.js :3000]
  Web -->|Selected API rewrites| API[NestJS :4000]
  API --> Service[Feature service]
  Service --> Repository[MalRepository]
  Repository --> Prisma[DatabaseService / Prisma]
  Prisma --> DB[(PostgreSQL)]
  Service --> External[MAL / metadata / schedule APIs]
```

The frontend never imports the Nest backend or accesses PostgreSQL directly. Playback resolution and media delivery still live in Next.js; this migration does not add video storage to PostgreSQL.

## 2. Start locally

Prerequisites: Node.js 22.13+, npm, and a running Docker installation with Docker Compose.

Install dependencies and create environment files **only if they do not already exist**:

```bash
npm ci
test -f apps/web/.env.local || cp apps/web/.env.example apps/web/.env.local
test -f apps/api/.env || cp apps/api/.env.example apps/api/.env
```

Check these settings in `apps/api/.env`:

```dotenv
APP_ORIGIN=http://localhost:3000
PORT=4000
DATABASE_URL=postgresql://sabame:sabame_local@127.0.0.1:55432/sabame_dev
DIRECT_URL=postgresql://sabame:sabame_local@127.0.0.1:55432/sabame_dev
```

Set the frontend's `apps/web/.env.local` to use:

```dotenv
BACKEND_URL=http://127.0.0.1:4000
```

Start the local database, apply committed migrations, and start both applications:

```bash
npm run db:up
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`. The development command builds the shared packages, generates Prisma Client, and starts both apps. PostgreSQL runs separately in Docker and persists data in the `sabame-postgres` volume.

For later sessions, use `npm run db:up` and `npm run dev`; apply migrations again whenever new migration files arrive. Restart development after editing shared packages so they rebuild.

To run one app at a time in separate terminals:

```bash
npm run dev:api
npm run dev:web
```

Stop the app processes with Ctrl+C. Stop PostgreSQL with `npm run db:stop`; this retains its data volume.

## 3. Configure MAL login

Demo mode works without MAL credentials, but the Nest backend must still run. Real account management needs the database plus these values in **`apps/api/.env`**:

| Variable | Purpose |
| --- | --- |
| `MAL_CLIENT_ID` / `MAL_CLIENT_SECRET` | Credentials for your MAL application |
| `MAL_REDIRECT_URI` | `http://localhost:3000/api/auth/mal/callback` locally |
| `MAL_TOKEN_ENCRYPTION_KEY` | Stable 64-character hexadecimal key for stored tokens |
| `ANIMESCHEDULE_API_TOKEN` | Optional for basic tracking; needed for broadcast schedules |

Generate a key once with `openssl rand -hex 32`, then save it in the backend environment. Keep it stable across restarts and deployments.

Register the callback on the **frontend origin**, not port 4000. `MAL_REDIRECT_URI` must match `APP_ORIGIN` plus `/api/auth/mal/callback`. Use `localhost` consistently in the browser and callback registration; do not mix it with `127.0.0.1` for login.

Restart the backend after changing environment values. Open `/login`, sign in through MAL, then import your list. The browser receives an HTTP-only session cookie; access and refresh tokens remain encrypted on the server. For registration details, see [MAL account setup](mal-account-setup.md).

## 4. Understand the NestJS structure

| File or directory | Responsibility |
| --- | --- |
| [main.ts](../apps/api/src/main.ts) | Starts the HTTP listener and enables shutdown hooks |
| [app.ts](../apps/api/src/app.ts) | Creates the app, configures body handling, and installs the global exception filter |
| [app.module.ts](../apps/api/src/app.module.ts) | Composes all feature modules |
| [modules](../apps/api/src/modules/) | Auth, MAL, catalog, schedule, and health controllers/services/modules |
| [database.module.ts](../apps/api/src/database/database.module.ts) | Registers and exports shared database providers |
| [prisma.service.ts](../apps/api/src/database/prisma.service.ts) | Lazily creates Prisma and the connection pool; closes them at shutdown |
| [repository.ts](../apps/api/src/database/repository.ts) | Account-scoped queries, transactions, sessions, and synchronization leases |
| [mal](../apps/api/src/mal/) | Shared MAL protocol, encryption, normalization, pagination, and mutation helpers |
| [transport.ts](../apps/api/src/transport.ts) | Bridges Express requests/responses to the existing Web Request/Response contracts |

A **controller** maps an HTTP route, a **service** coordinates its work, and a **module** declares which controllers/providers belong together. Other modules obtain shared providers through explicit imports and exports. This follows the [Nest module](https://docs.nestjs.com/modules) and [provider](https://docs.nestjs.com/providers) patterns.

For example, `MalController` delegates to `MalService`, which receives `MalRepository` through constructor injection. `MalModule` imports `DatabaseModule`; it does not construct a global database singleton. The database module supplies a lazy client factory so startup and dependency-injection tests do not require an immediate database connection.

Use this sequence when adding backend functionality:

1. Extend the appropriate feature under `apps/api/src/modules/`, or add a feature directory with `.module.ts`, `.controller.ts`, and `.service.ts` files.
2. Register the service in its module and import that module into `AppModule` when it is new.
3. Use explicit `@Inject(...)` tokens, matching the existing services. The current TypeScript configuration disables emitted decorator metadata.
4. Put database operations behind a repository and obtain shared database providers through `DatabaseModule`.
5. Add shared browser-safe response types to `packages/domain` when both apps need them.
6. Add tests and, for a new public API path, update [backend-routing.ts](../apps/web/src/config/backend-routing.ts) so the frontend forwards it.

The current controllers deliberately use explicit response handling through the transport adapter. See the [API structure notes](../apps/api/README.md) before adding response interceptors or changing cookie/error behavior. Validation already exists in the helpers; a global DTO/ValidationPipe setup and Swagger UI are not currently installed.

## 5. What the database stores

The source of truth for the schema is [schema.prisma](../apps/api/prisma/schema.prisma).

| SQL table | Stored information |
| --- | --- |
| `accounts` | MAL user ID/profile, encrypted OAuth tokens, expiry, import state, sync time, library revision |
| `sessions` | Hashed session tokens, user association, and expiry |
| `oauth` | Temporary OAuth transaction/state hashes, encrypted PKCE verifier, and expiry |
| `entries` | Each user's anime-library snapshot, keyed by user ID and anime ID |
| `operations` | Tracking-operation records for idempotency, retry, and conflict handling |
| `leases` | Temporary per-account locks preventing competing synchronization work |

Prisma also maintains its migration-history table. The application schema does not contain a standalone global anime-metadata table: library entries include anime information in JSON payloads, and catalog data comes from the provider integrations. Local demo state and playback positions retain their browser-persistence behavior.

MAL remains the upstream account list. PostgreSQL stores Sabame's account/session state, imported snapshots, and operation records. Import replaces the snapshot transactionally while retaining applicable pending work; tracking updates use the existing conflict/idempotency logic. Library reads are paginated, and revisions detect changes between pages.

The runtime pool allows up to five connections **per backend instance**. It is not a five-connection limit across an entire scaled deployment.

## 6. Database URLs and migrations

| Setting or command | Meaning |
| --- | --- |
| `DATABASE_URL` | Runtime PostgreSQL connection used by Nest; use the Neon pooled URL in production |
| `DIRECT_URL` | Prisma CLI datasource in this repo; use the direct production connection for migrations |
| `npm run db:migrate` | Apply existing committed migrations (`prisma migrate deploy`) |
| `npm run db:migrate:dev` | Create/apply schema changes in a development database |
| `npm run db:generate` | Regenerate Prisma Client; does not change the database schema |

Locally both URLs can be identical. Leave `DATABASE_SCHEMA` unset for normal use; the test helper sets it to isolate test schemas. Prisma CLI configuration lives in [prisma7.config.ts](../apps/api/prisma7.config.ts), which loads `apps/api/.env` when run through the workspace scripts.

For a new schema change, edit `apps/api/prisma/schema.prisma`, then run:

```bash
npm run prisma:migrate:dev -w @sabame/api -- --name describe_your_change
npm run db:generate
```

This uses the workspace script directly so `--name` reaches Prisma correctly. Review the generated SQL under `apps/api/prisma/migrations/`, test the change, and commit both the schema and migration. Prisma 7 requires explicit client generation after `migrate dev`. [Prisma 7 migration reference](https://www.prisma.io/docs/cli/v7/migrate/dev)

For an existing environment, apply those reviewed files with `npm run db:migrate` using that environment's `DIRECT_URL`. Application startup and production builds do not apply migrations. `migrate deploy` applies pending migrations without generating client artifacts. [Prisma 7 deploy reference](https://www.prisma.io/docs/cli/v7/migrate/deploy)

Use a local development database for creating migrations. `migrate dev` can request a reset when it detects drift; do not use it against data you need to preserve. Keep the existing SQLite file as a recovery copy: there is no SQLite import step, and users reconnect/re-import MAL into the fresh PostgreSQL database.

To inspect local tables without writing application code:

```bash
docker compose exec postgres psql -U sabame -d sabame_dev
```

Inside `psql`, use `\dt`, `SELECT count(*) FROM accounts;`, and `\q` to list tables, count accounts, and exit. Changing development code does not require clearing the database. Avoid `docker compose down -v` unless you intend to delete the local database volume.

## 7. API entry points and quick checks

Use the frontend origin for browser/API account flows so cookies stay on the same origin.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Process responds; does not require PostgreSQL |
| GET | `/api/ready` | Checks database connectivity and the account table |
| GET | `/api/auth/session` | Login configuration and current session |
| GET | `/api/auth/mal/start` | Begin MAL OAuth |
| GET | `/api/auth/mal/callback` | Complete MAL OAuth |
| POST | `/api/auth/logout` | Revoke the current session |
| GET | `/api/mal/list` | Read a library page; optional `cursor` |
| POST | `/api/mal/import` | Import the signed-in user's MAL list |
| PATCH | `/api/mal/anime/:animeId` | Submit a tracking operation |
| GET | `/api/anime/search`, `/api/anime/seasonal` | Search and seasonal metadata |
| GET | `/api/anime/:animeId`, `/api/anime/:animeId/episodes` | Anime details and episode metadata |
| GET | `/api/schedule` | Personalized broadcast schedule |

```bash
curl -i http://localhost:4000/api/health
curl -i http://localhost:4000/api/ready
curl -i http://localhost:3000/api/auth/session
```

Expect `{"status":"ok"}` from health and `{"status":"ready"}` from readiness after database setup. Readiness returns 503 when its database check fails; it is not a full migration-drift or upstream-MAL check. Session returns `user: null` before login. `configured: true` means the required MAL configuration exists, not that a live MAL login has been verified.

Account writes require the session cookie, an `Origin` matching `APP_ORIGIN`, and a JSON body. Import also requires the current `expectedUserId`. PATCH uses operation IDs and a base snapshot for conflict handling; use the existing frontend account client instead of inventing a simplified PATCH payload.

## 8. Tests and maintenance commands

```bash
npm run lint:api
npm run format:check:api
npm run typecheck
npm run test:api
npm run build:api
```

Use `npm run format:api` to apply backend formatting. The built API starts with `npm run start -w @sabame/api`; root `npm start` starts the frontend only.

Backend unit tests use mocked dependencies. The [module tests](../apps/api/test/modules.test.ts) demonstrate `Test.createTestingModule()` and `overrideProvider()` without connecting to PostgreSQL, following [Nest's testing utilities](https://docs.nestjs.com/fundamentals/testing).

For real PostgreSQL integration tests, create the dedicated test database once:

```bash
docker compose exec postgres createdb -U sabame sabame_test
TEST_DATABASE_URL=postgresql://sabame:sabame_local@127.0.0.1:55432/sabame_test npm run test:integration
```

The test runner requires `TEST_DATABASE_URL` in its process environment; putting it only in `apps/api/.env` does not configure Vitest. The helper accepts only a local database named `sabame_test`, creates isolated schemas, applies migrations there, and removes those schemas afterward. Upstream MAL responses are mocked.

To include OAuth cookie forwarding in browser tests, first migrate the test database's default schema:

```bash
DIRECT_URL=postgresql://sabame:sabame_local@127.0.0.1:55432/sabame_test npm run db:migrate
TEST_DATABASE_URL=postgresql://sabame:sabame_local@127.0.0.1:55432/sabame_test npm run test:e2e
```

Without `TEST_DATABASE_URL`, browser tests cover the unconfigured-account flow instead. These tests do not authorize a real MAL account or deploy the app.

## 9. Common setup problems

| Symptom | Check |
| --- | --- |
| Docker cannot start PostgreSQL | Start Docker; check whether port 55432 is already occupied |
| API health works but readiness is 503 | Confirm `DATABASE_URL`, database availability, and applied migrations |
| Login is not configured | Check all MAL variables, the 64-hex key, `DATABASE_URL`, and callback/origin match |
| Frontend API calls cannot reach Nest | Start both apps and check frontend `BACKEND_URL` |
| `DIRECT_URL is required` | Set it in `apps/api/.env` or the migration command's environment |
| Missing generated Prisma client | Run `npm run db:generate`; do not commit generated output |
| `invalid_origin` on a write | Send requests through the frontend with its exact origin and JSON content type |
| `sync_busy` or `library_changed` | Retry after concurrent sync finishes; do not delete account data |
| A shared-package edit seems ineffective | Restart `npm run dev` so the shared package rebuilds |

For Neon/Vercel setup, follow [backend migration and deployment](backend-migration.md). The deployment roots are `apps/web` and `apps/api`; the database and production credentials still need to be provisioned/configured. For broader contribution boundaries, see [architecture](architecture.md).
