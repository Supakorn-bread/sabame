# Sabame UX review — September 2026

## Findings and upgrades

- Account: the avatar previously signed out immediately. It now opens a disclosure with an explicit sign-out action and Escape dismissal.
- Onboarding: explain demo credentials and provide instant demo entry. Remove inactive recovery, registration, and MyAnimeList actions.
- Library: expose search at every breakpoint, provide title/score sorting, use pressed filter buttons, announce result counts, and show progress feedback.
- Touch and keyboard: use 44px progress controls and reveal player controls on keyboard focus. Keep pointer cursors and the existing reduced-motion-aware route fade.
- Watch: expose every episode, disable progress controls at their bounds, show title-specific catalog data and artwork, and link recommendations to actual titles.
- Trust: remove fabricated rankings and studio details, dead footer links, and implied live MAL synchronization. Explain browser-local persistence.

## UX standards for future work

Every visible action should perform its labeled function. Expose unavailable capabilities as explanatory text. Prefer 44px touch targets, preserve visible keyboard focus, and make status updates available to assistive technology. Keep navigation stable and honor reduced-motion preferences.

## Research and verification

The review used Vercel React best practices and W3C guidance on [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum), [focus visibility](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html), and [status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages). The WCAG AA target minimum is 24px with exceptions; 44px is our comfort target.

Verify with lint, TypeScript, Vitest, the production build, and Playwright. Set `PLAYWRIGHT_PORT=3101` to test an isolated worktree. Browser coverage includes demo entry, account actions, search, persistence, episode selection, keyboard player visibility, navigation fade, reduced motion, accessibility scans, and mobile overflow.

## Remaining limitations

Playback is simulated; MAL authentication and synchronization require a separate integration. Existing artwork includes prototype imagery. Automated accessibility checks supplement visual and keyboard review but do not establish complete WCAG conformance.
