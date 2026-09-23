# Seasonal browsing

`/seasonal` opens the current calendar season. Winter, Spring, Summer, and Fall tabs select the anime list below; the year selector and adjacent-year buttons support older and upcoming seasons. Selection is reflected in `?year=2026&season=summer`, so links, refresh, and browser history retain the selected season.

Cards show MAL artwork, title, studio, synopsis, genres, score, member count, and premiere information. Search, format filters, and sorting apply to the loaded titles. Load more reveals additional cards and requests another catalog page when needed. Opening a card registers its metadata with the existing catalog and goes to its `/watch/mal-…` page. A catalog listing does not guarantee playback availability.

Anime already in the active user's library also shows **Your score**, separate from the MAL community score. Unrated library entries show **Not scored**. This reads the existing library state, including imported MAL scores, and updates when that state changes.

`GET /api/anime/seasonal` validates `year`, `season`, and `page`. It uses the existing server-only `MAL_CLIENT_ID` for the official MAL seasonal catalog, or Jikan when that credential is absent. No new environment variables are required. Successful results have a bounded five-minute in-memory cache; failed and aborted requests are not cached. The client cancels stale requests when selection changes and provides retry and empty states.

Verification:

- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run test:e2e -- e2e/seasonal.spec.ts e2e/navigation-ux.spec.ts`

Browser coverage includes season/year selection, history, keyboard navigation, filtering, pagination, request failures, stale requests, mobile layout, and light/dark accessibility checks.
