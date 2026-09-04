# Sabame Daily Tracker MVP Implementation Plan

> **For agentic workers:** Implement task-by-task with test-driven development and verify each checkpoint before continuing.

**Goal:** Build a responsive, persistent daily anime tracker from the approved Sabame Stitch designs.

**Architecture:** Use Next.js App Router with shared responsive components and a versioned Zustand store persisted in browser local storage. Keep authentication, anime data, and playback simulated while preserving a clean replacement boundary for future APIs.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, Zustand, next-themes, Vitest, Testing Library, Playwright, axe-core.

## Global constraints

- Working routes: `/login`, `/dashboard`, `/library`, `/watch/[animeId]`.
- `/seasonal` and `/schedule` are intentional coming-soon routes.
- No real authentication, MAL API, backend database, social feature, or video streaming.
- Theme defaults to the operating system and supports a persisted manual override.
- Desktop follows Stitch; tablet and phone adapt the same hierarchy.
- All behavior is implemented test-first.

## Tasks

1. Scaffold Next.js, styling, and test tooling.
2. Implement typed seed data and the versioned persisted store.
3. Build tokens, shared components, responsive shell, theme handling, and demo login.
4. Implement Dashboard and Library against shared state.
5. Implement simulated Watch behavior and coming-soon routes.
6. Verify responsive fidelity, accessibility, tests, lint, types, and production build.
