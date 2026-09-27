# Architecture and contribution scopes

Sabame uses one npm-workspace repository, two application deployments, and a
modular monolith for the backend. Backend features communicate through injected
providers inside one NestJS application. There are no independently deployed
backend microservices or message brokers.

```text
apps/web/                  Next.js UI and current playback endpoints
apps/api/                  NestJS API, persistence, and migrations
  src/modules/             Feature controllers, services, and modules
  src/database/            PostgreSQL connection and persistence boundary
  prisma/                  Schema and versioned migrations
  test/                    API and PostgreSQL integration tests
packages/domain/           Browser-safe contracts and pure domain functions
packages/catalog/          Shared server-side provider integration
e2e/                       Browser flows across both applications
scripts/                   Workspace development and architecture tooling
docs/                      Decisions and setup guides
```

## Ownership and dependencies

| Scope | Owns | Allowed dependencies |
| --- | --- | --- |
| `apps/web` | Pages, UI components, browser state, media delivery | Domain contracts; catalog only from server code |
| `apps/api` | MAL OAuth, sessions, imports, tracking, metadata, schedules | Domain, catalog, Prisma/PostgreSQL |
| `packages/domain` | Shared data shapes and pure calculations | Its own files only |
| `packages/catalog` | Provider requests and normalization | Domain and server/provider libraries |
| Root | Workspace commands, cross-app tests, shared tooling | Application build/test commands |

The browser uses relative `/api` URLs. Next.js forwards the migrated paths to
NestJS through `BACKEND_URL`; playback endpoints remain in Next.js for this
phase. The web app never imports the NestJS application or Prisma client.
Shared packages never import application internals. Domain contracts must not
contain secrets, database models, or framework dependencies.

`npm run lint` checks these workspace import boundaries, including relative
imports, re-exports, and literal dynamic imports. Client-component imports of
server modules are rejected; Next.js `server-only` wrappers additionally guard
the web module graph. `npm run test:architecture` verifies the lint rules.

## NestJS conventions

Organize each business feature into its own directory with named files such as
`auth.module.ts`, `auth.controller.ts`, and `auth.service.ts`. Controllers own
HTTP routing and delegate business work to providers. Injectable providers are
registered in their owning module; modules explicitly import dependencies and
export only the providers other features need. Avoid global service instances
and registering the same shared provider independently in multiple modules.

The database connection is created lazily and closed with the Nest application
lifecycle. Application startup never runs migrations. Existing API status codes,
JSON error contracts, cookie attributes, and origin checks remain compatibility
requirements during refactors. Pure normalization and conflict-resolution
functions can remain ordinary functions; Nest does not require every helper to
be a provider.

The migrated HTTP boundary uses Nest's documented Express-specific `@Req()` and
`@Res()` mode to retain the existing Web Request/Response contracts, cookie
forwarding, and disconnect cancellation. The transport adapter is shared;
feature controllers remain small. This mode handles responses explicitly, so
future Nest response interceptors or serialization features must account for
that choice. Existing domain validation remains explicit rather than adding
decorators that would silently change accepted payloads or error responses.

Formatting uses two-space indentation and the API's Prettier configuration.
Use `npm run format:api` to format backend files and
`npm run format:check:api` to verify them. Nest's examples establish module,
controller, and provider patterns; formatting preferences are repository
conventions, not requirements imposed by the framework.

## Working on one scope

Run commands from the repository root. Install once with `npm ci`; keep a single
root lockfile. `npm run dev` builds shared packages, generates Prisma Client, and
starts both apps. Restart it after editing a shared package.

| Task | Command |
| --- | --- |
| Run only frontend/backend in development | `npm run dev:web` / `npm run dev:api` |
| Frontend, shared catalog, and boundary tests | `npm test` |
| Shared catalog tests only | `npm run test:catalog` |
| Backend unit/HTTP tests | `npm run test:api` |
| Database integration tests | `npm run test:integration` |
| Lint frontend/backend separately | `npm run lint:web` / `npm run lint:api` |
| All TypeScript checks | `npm run typecheck` |
| Frontend/backend production build | `npm run build` / `npm run build:api` |
| Both builds | `npm run build:all` |
| Complete browser flows | `npm run test:e2e` |

Frontend environment variables live in `apps/web/.env.local`; backend variables
live in `apps/api/.env`. Each app has its own `.env.example` and `package.json`.
The workspace move relocates an existing root `.env.local` without displaying or
changing its contents. Account credentials belong in the backend environment.

For review, keep UI changes in `apps/web`, backend features in `apps/api`, and
shared contract changes in `packages/domain`. When changing a contract, review
both consumers and keep deployment compatibility in mind: one Git commit does
not make two production deployments atomic. Cross-app tests belong in `e2e`.

Vercel project roots are `apps/web` and `apps/api`. Enable access to files outside
each project root for workspace dependencies. Each project's checked-in
configuration builds shared dependencies from the repository root. See
[deployment and database setup](backend-migration.md).

## References used for this structure

- [NestJS modules](https://docs.nestjs.com/modules): feature encapsulation and explicit imports/exports.
- [NestJS providers](https://docs.nestjs.com/providers): dependency injection and service ownership.
- [NestJS controllers](https://docs.nestjs.com/controllers): routing and response handling.
- [NestJS exception filters](https://docs.nestjs.com/exception-filters): HTTP error boundaries.
- [NestJS testing](https://docs.nestjs.com/fundamentals/testing): testing modules and provider overrides.
- [NestJS Prisma integration](https://docs.nestjs.com/recipes/prisma): injectable persistence integration.
- [Vercel monorepos](https://vercel.com/docs/monorepos): separate app roots and shared dependencies.

Framework configuration was also checked against the installed Next.js 16.3.3
documentation for output file tracing and Turbopack workspace roots.
