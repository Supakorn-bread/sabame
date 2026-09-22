# Sabame UX review — September 2026

## Scope and approach

This refactor follows `AGENTS.md`, the local UI UX Pro Max skill, and Vercel React best practices. It retains the tracker, MAL synchronization, media resolver, design tokens, and navigation. The dashboard keeps the anime poster on the left and details aligned to the top on the right.

## Findings and changes

- **Dashboard:** extract `CurrentlyWatching` into a focused component. Keep the full poster visible at its intended display size, use responsive image sizes and an explicit Next.js quality allowlist, and avoid stretching a portrait into a banner. Accounts with no Watching titles still receive a heading and a useful next action. Incomplete MAL sync is distinguished from an empty library.
- **Library:** separate artwork from an opaque content surface so titles and controls remain readable over any poster. Reserve two title lines with ellipsis and expose the full title through the link's accessible name and title. Keep community and personal scores distinct, provide comfortable episode controls, and distinguish an empty library from filters with no matches.
- **Search:** distinguish pending, failed, and empty remote results. Keep local results usable during remote failure and offer retry without clearing the query. Bound the active keyboard option to available results; standalone results stay in document flow.
- **Navigation and account:** add a keyboard skip link, comfortable navigation and theme controls, and mobile safe-area spacing. Dismiss the account disclosure on Escape, focus leaving, or an outside press. Failed MAL avatar loads fall back to initials. Preserve stable navigation and reduced-motion-aware page fades.
- **Login and product copy:** focus the first invalid demo field, associate readable error messages, and remove stale statements that MAL integration is unavailable. Seasonal discovery and schedules describe their current limitations.
- **Theme contrast:** place the global link reset in the CSS base layer so component text colors can override it. The previous rule overrode button-link colors and caused insufficient contrast on the dark dashboard's primary action.

## Interaction standards

Enabled buttons use a pointer cursor; disabled controls use not-allowed. Prefer 44px touch targets, visible keyboard focus, semantic labels, and announced status changes. Every available action should perform its label. Preserve the 150–250ms content fade without delaying navigation and disable motion when requested. Use real catalog artwork; higher encoding quality cannot recover detail absent from the source image.

## Verification

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run test:e2e`. The browser command builds production assets before testing. Focused coverage lives in `e2e/library-ux.spec.ts`, `e2e/navigation-ux.spec.ts`, and `e2e/ux-review.spec.ts`; existing suites cover persistence, MAL flows, player behavior, route transitions, and reduced motion.

The visual review checks dashboard and library in light/dark themes at desktop, portrait-phone, and landscape widths, with Axe scans and overflow checks. Screenshots are generated under ignored `test-results/`. Browser API fixtures verify UI states without modifying a real MAL account.

Verified on September 22, 2026: lint and TypeScript passed; 161 Vitest tests and 24 Playwright tests passed. The Playwright run completed a production webpack build. Dashboard/library scans found no Axe violations at 1280×900, 375×812, and 812×375 in either theme. Generated desktop and phone screenshots were also visually inspected.

## Remaining limitations

MAL requires configured OAuth credentials; remote synchronization and media availability depend on their services. Thai subtitles must be confirmed per resolved episode; the interface must not imply every title has them. Seasonal and schedule pages remain explanatory placeholders. Automated accessibility checks and visual inspection do not establish complete WCAG conformance. Live MAL authorization and provider playback require separate integration verification.
