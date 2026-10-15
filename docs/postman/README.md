# Sabame API in Postman

The collection documents the 14 NestJS routes and two Next.js playback routes implemented in Sabame. Each response example is illustrative, not captured from a running service. The export contains no user data, session cookies, OAuth values, or signed media tickets.

## Import the files

Import [sabame-api.collection.json](./sabame-api.collection.json) into Postman. Its variables include the local defaults, so you can use the collection without an environment. Import and select [sabame-local.environment.json](./sabame-local.environment.json) if you want to edit local values separately.

The default baseUrl is http://localhost:3000. Requests pass through Next.js, which rewrites the NestJS routes to the backend. backendUrl is http://localhost:4000 for direct NestJS diagnostics. Keep appOrigin at http://localhost:3000 for local requests that send Origin. The host in baseUrl and appOrigin must match.

The environment leaves userId, animeId, operationId, and ticket empty. Set them only in your local Postman environment when needed. The search text, seasonal year, page, week, time zone, and air type have usable defaults.

## Use MAL account routes

GET /api/auth/session reports whether MAL is configured and returns the current user when a session cookie is present. The private library and schedule routes require the sabame_mal_session cookie. Sabame does not return that cookie in JSON.

Complete MAL authorization in a browser. Open GET /api/auth/mal/start at the app origin, complete consent on MAL, and let MAL return to /api/auth/mal/callback in the same browser. The callback exchanges the code, sets the session cookie, and redirects to /dashboard. Postman does not automate that flow or copy cookies from the browser. It sends an existing session only when Postman's local cookie jar has one.

JSON writes to /api/auth/logout, /api/mal/import, and /api/mal/anime/{animeId} require Origin equal to appOrigin and Content-Type application/json. The collection sets those headers. Logout accepts an empty JSON object. Import requires expectedUserId to match the signed-in MAL user.

## Send tracking updates safely

Read every library page before PATCHing an anime. Follow nextCursor until it is absent before concluding that an anime is not on the list and setting base to null. Otherwise, copy the anime's remote status object into base. Set userId to the signed-in MAL user id and operationId to a UUID or another value with 16 to 100 letters, digits, underscores, or hyphens.

Keep operationId, base, and changes unchanged when retrying the same operation. A changed remote baseline can produce a 409 conflict response with operation.remote. Resubmit that operation with resolution local to keep your requested changes, or resolution remote to accept the MAL state. A failed upstream update can return HTTP 200 with operation.state set to failed.

## Inspect playback responses

POST /api/anime/{animeId}/media accepts an episodeNumber from 1 through 10000. Its response contains relative signed URLs under /api/media/resource. Set the local ticket variable to the ticket query value from a response before sending GET Signed Media Resource. The ticket is a short-lived bearer capability. Do not export or share it.

GET /api/media/resource verifies the ticket and fetches an approved HTTPS source. It can return subtitle text, an HLS manifest, or media bytes. MP4 requests accept one byte range. Sabame caps each requested range to 8 MiB from its start byte and truncates a larger requested end. Without a Range header, it requests the first 8 MiB. The endpoint does not serve a plaintext stream without a valid ticket.

## Route coverage

The collection groups the current routes like this:

| Folder | Routes |
| --- | --- |
| health | GET /api/health, GET /api/ready |
| auth | GET /api/auth/session, GET /api/auth/mal/start, GET /api/auth/mal/callback, POST /api/auth/logout |
| catalog | GET /api/anime/search, GET /api/anime/seasonal, GET /api/anime/{animeId}, GET /api/anime/{animeId}/episodes |
| library | GET /api/mal/list, POST /api/mal/import, PATCH /api/mal/anime/{animeId} |
| schedule | GET /api/schedule |
| playback | POST /api/anime/{animeId}/media, GET /api/media/resource |

NestJS routes are declared in the controllers under [apps/api/src/modules](../../apps/api/src/modules/). The frontend rewrite list is in [backend-routing.ts](../../apps/web/src/config/backend-routing.ts). Playback routes are implemented in the [anime media route](../../apps/web/src/app/api/anime/[animeId]/media/route.ts) and [media resource route](../../apps/web/src/app/api/media/resource/route.ts).
