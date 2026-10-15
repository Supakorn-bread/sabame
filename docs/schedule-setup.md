# Anime broadcast schedule setup

Sabame uses the AnimeSchedule.net API to show RAW broadcasts for current-season and ongoing anime in a signed-in user's imported MyAnimeList list. The browser calls Sabame's authenticated /api/schedule route; the AnimeSchedule application token stays on the server.

## Prerequisites

- Configure MyAnimeList sign-in and persistent list storage using the [account setup](mal-account-setup.md) guide.
- Sign in to MyAnimeList in Sabame and finish importing the account's list.
- Configure an AnimeSchedule application token as described below.

The schedule is account-personalized. It uses only entries whose last confirmed MAL status is Watching, matches their MAL IDs to the current season and ongoing AnimeSchedule routes, then filters the public RAW weekly broadcast timetable. A user must sign in and complete list import first; demo mode does not receive a global schedule. Pending local edits do not change schedule membership until MAL confirms them.

## Configure the AnimeSchedule API

1. Sign in or create an AnimeSchedule.net account.
2. In account settings, open the API tab and create an application.
3. Copy the application token for the documented non-OAuth API.
4. Set `ANIMESCHEDULE_API_TOKEN` in `apps/api/.env` for local development or in the NestJS deployment's server environment. Keep it out of source control and never use a `NEXT_PUBLIC_` variable.
5. Restart the development server or redeploy.

The server requests the paginated current-season catalog at GET /api/v3/anime?years=YYYY&seasons=SEASON&page=N and the ongoing catalog at GET /api/v3/anime?airing-statuses=ongoing&page=N. It reads anime[].websites.mal plus anime[].route from both catalogs to build one crosswalk, preserving alternate routes and deduplicating overlaps. It then requests GET /api/v3/timetables/raw?year=YYYY&week=ISO_WEEK&tz=IANA_TIME_ZONE with Authorization: Bearer <application-token>. Schedule always uses the RAW timetable; old valid airType query values remain accepted for compatibility but do not change the response.

The AnimeSchedule API receives catalog and timetable requests only; Sabame does not send MAL IDs or account list data to it. No AnimeSchedule OAuth callback or redirect URI is needed. The existing MAL OAuth setup remains as documented in the account guide. The combined current-season and ongoing crosswalk is cached for 15 minutes and raw timetable responses for five minutes. User-filtered API responses are private and marked no-store. If a poster cannot load, the schedule card shows the anime title's initial instead.

AnimeSchedule documents a limit of 120 requests per minute per IP and application; keep that in mind for shared deployments. If ANIMESCHEDULE_API_TOKEN is missing, Sabame displays a setup message rather than sample or global schedule data.

## Attribution and usage terms

The schedule visibly credits and links to AnimeSchedule.net. Review the [API documentation](https://animeschedule.net/api/v3/documentation/anime) and [API terms of use](https://animeschedule.net/api-terms-of-use) before deployment. AnimeSchedule requires permission for commercial API use; obtain it before offering this feature commercially.

Schedule data is for RAW broadcast times; it does not represent reminders, ratings, or streaming availability.
