# sabame
Sabame : saba + anime, for watching and tracking MAL (myanimelist) and hareshi-like all-in-one in this project.

An npm-workspace monorepo: `apps/web` owns Next.js, `apps/api` owns the NestJS modular monolith and PostgreSQL, and `packages/` holds shared code. See [architecture and contribution scopes](docs/architecture.md).

Start, configure, and develop the backend: [NestJS and database usage guide](docs/nestjs-database-guide.md).

MyAnimeList login, list import, and two-way progress sync: [account setup](docs/mal-account-setup.md). Uses a NestJS backend and PostgreSQL (Neon in production). Requires Node 22.13+. Demo mode works without MAL credentials while the backend is running. See [backend setup and deployment](docs/backend-migration.md).

Media search/player setup, API contract, subtitle limitations and verification commands: [media implementation](docs/media-implementation.md).

Anime broadcast timetable integration and server token setup: [schedule setup](docs/schedule-setup.md).

Provider/source evidence: [anime-sdk investigation](docs/anime-sdk-investigation.md).
