# Check Thai provider playback before deploying Sabame

Run the same cases against local Sabame and a Render test service. This check uses the existing media endpoint and provider adapters. It does not change MAL progress or add provider mappings.

## Run the local baseline

1. Start Sabame with `npm run dev` and wait for the web app to respond.
2. Run `npm run test:probe:thai` to check the diagnostic tool against controlled HTTP responses.
3. Run the delivery checks from the repository root.

```sh
npm run probe:thai -- --origin http://localhost:3000 --environment local
```

4. Run the browser checks with an installed Playwright Chromium browser.

```sh
npm run probe:thai -- --origin http://localhost:3000 --environment local --browser
```

Use `--case <id>` to repeat one case from `scripts/fixtures/thai-media-cases.json`. Keep the same case file for both environments. The initial cases are a compatibility sample, not a complete provider inventory.

The probe keeps response bodies in memory and prints a redacted report. Do not enable browser traces, videos, HAR files, or media downloads. A browser run uses an isolated player through Sabame's delivery endpoint. It does not verify the watch page UI, subtitle accuracy, or subtitle timing.

## Prepare a Render test service

1. Connect only the Sabame repository to the intended Render account.
2. Select an explicit test branch containing the reviewed code. Record its commit before comparing results. Local uncommitted adapter changes are not included in a Git deployment.
3. Configure a Node Web Service with the repository root as its root directory.
4. Use `npm ci && npm run build -- --webpack` as the build command.
5. Use `npm run start -- --hostname 0.0.0.0 --port $PORT` as the start command.
6. Set a dedicated `MEDIA_PROXY_SECRET` in Render. Generate it locally with `openssl rand -hex 32` and enter it as a secret. Do not put it in a report or commit.
7. Set `MAL_CLIENT_ID` securely if the local resolver uses the official MAL API. Keep metadata configuration consistent between targets.
8. Confirm the region, instance plan, deployment access, and cost before creating the service.

This service tests the Next.js media routes. It does not require copying a user database or MAL account tokens. Account, library, and schedule features still require NestJS and PostgreSQL. Do not treat this configuration as the full production deployment.

The repository's media endpoints are currently public. Review access and traffic limits before exposing a test service. Keep the test deployment separate from production and stop it when the test is finished.

## Run the same cases against Render

Replace `YOUR-SERVICE` with the deployed service hostname.

```sh
npm run probe:thai -- --origin https://YOUR-SERVICE.onrender.com --environment render --browser
```

Run the probe from your machine against the remote app. Provider discovery and video retrieval then run on the target Next.js server. The local browser receives media through that server. The environment label alone does not prove the server runs on Render. Confirm the deployment URL, region, and commit in the Render dashboard.

Repeat after a restart and at another time. Compare the same matrix and commit. Check explicit server and quality cases when the provider offers alternatives.

## Decide from the evidence

- Treat a failed resolution as a failure at that stage. An API error alone does not prove the provider lacks the title.
- Require successful media delivery as well as resolution. A successful HTML response is not a video.
- Require natural playback progress and playback after a seek for browser compatibility. A successful byte-range request alone is not a browser seek.
- Keep skipped browser checks marked unverified. Do not count them as passes.
- Distinguish provider-declared Thai subtitles from visually verified Thai subtitles.
- Investigate failures before changing hosting or weakening matching and URL validation rules.
- Keep the mapping registry work behind the Render compatibility decision.

The client caps response sizes. Existing HLS delivery can fetch a complete segment upstream even when the client asks for a range. These checks do not bound total provider bandwidth to the range size.

Read [Render service types](https://render.com/docs/service-types), [outbound IP addresses](https://render.com/docs/outbound-ip-addresses), and [free service limits](https://render.com/docs/free) when choosing the test configuration.
