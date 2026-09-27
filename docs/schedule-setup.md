# Anime broadcast schedule setup

Sabame uses the AnimeSchedule.net API to show current-season broadcasts for anime in a signed-in user's imported MyAnimeList list. The browser calls Sabame's authenticated /api/schedule route; the AnimeSchedule application token stays on the server.

## Prerequisites

- Configure MyAnimeList sign-in and persistent list storage using the [account setup](mal-account-setup.md) guide.
- Sign in to MyAnimeList in Sabame and finish importing the account's list.
- Configure an AnimeSchedule application token as described below.

The schedule is account-personalized. It reads the server-stored MAL list across all statuses, matches MAL anime IDs to AnimeSchedule routes, then filters the public broadcast timetable. A user must sign in and complete list import first; demo mode does not receive a global schedule. Pending local MAL edits are excluded until MAL confirms them.

## Configure the AnimeSchedule API

1. Sign in or create an AnimeSchedule.net account.
2. In account settings, open the API tab and create an application.
3. Copy the application token for the documented non-OAuth API.
4. Set `ANIMESCHEDULE_API_TOKEN` in `apps/api/.env` for local development or in the NestJS deployment's server environment. Keep it out of source control and never use a `NEXT_PUBLIC_` variable.
5. Restart the development server or redeploy.

The server requests the paginated season catalog at GET /api/v3/anime?years=YYYY&seasons=SEASON&page=N and reads anime[].websites.mal plus anime[].route to build the crosswalk. It then requests GET /api/v3/timetables/{all|raw|sub|dub}?year=YYYY&week=ISO_WEEK&tz=IANA_TIME_ZONE with Authorization: Bearer <application-token>. The selected IANA time zone and language filter determine the weekly timetable.

The AnimeSchedule API receives catalog and timetable requests only; Sabame does not send MAL IDs or account list data to it. No AnimeSchedule OAuth callback or redirect URI is needed. The existing MAL OAuth setup remains as documented in the account guide. Public season crosswalks are cached for 15 minutes and raw timetable responses for five minutes. User-filtered API responses are private and marked no-store.

AnimeSchedule documents a limit of 120 requests per minute per IP and application; keep that in mind for shared deployments. If ANIMESCHEDULE_API_TOKEN is missing, Sabame displays a setup message rather than sample or global schedule data.

## Attribution and usage terms

The schedule visibly credits and links to AnimeSchedule.net. Review the [API documentation](https://animeschedule.net/api/v3/documentation/anime) and [API terms of use](https://animeschedule.net/api-terms-of-use) before deployment. AnimeSchedule requires permission for commercial API use; obtain it before offering this feature commercially.

The Sub timetable can include Raw entries when no subtitled listing is available, as defined by the API. Schedule data is for broadcast times; it does not represent reminders, ratings, or streaming availability.
