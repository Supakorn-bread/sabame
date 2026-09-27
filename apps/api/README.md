# API structure

The API is a NestJS modular monolith. `src/app.module.ts` composes the auth,
MAL, catalog, schedule, and health feature modules. Each feature keeps its
HTTP controller and injected service together under `src/modules/`. The
database module exports a Nest-managed `DatabaseService` and `MalRepository`;
the Prisma connection remains lazy until a repository operation or readiness
check needs it.

`src/mal/` remains for shared MAL protocol and domain helpers such as token
handling, response normalization, library paging, and mutation rules. Request
orchestration lives in the auth and MAL feature services. `src/catalog/http.ts`
holds the shared timeout and error-envelope helper used by the catalog service.

Controllers use Nest's Express request and response objects because the
existing API boundary adapts those requests to the Web `Request`/`Response`
types used by the MAL and catalog helpers. That adapter preserves disconnect
cancellation, the 16 KiB raw JSON limit, multiple `Set-Cookie` headers,
canonical redirects, and existing cache headers and statuses. Nest documents
these Express request/response decorators and its library-specific response
handling in the [controllers guide](https://docs.nestjs.com/controllers#library-specific-approach).
Unexpected application errors pass through the global exception filter, which
keeps Nest `HttpException` statuses and response bodies intact and maps other
errors to the API's stable private error envelope.

Feature and repository tests use Nest's testing module and provider overrides
where dependency substitution is relevant; PostgreSQL integration tests use
an isolated schema for each run.
