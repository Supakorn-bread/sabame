<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Repository Guidelines

## Project Structure & Module Organization

Sabame is a Next.js App Router application. Routes and global styling live under `src/app/`; reusable components are in `src/components/`; tracker state, selectors, seed data, and domain logic are grouped in `src/features/tracker/`. Unit tests sit beside the code they cover as `*.test.ts` or `*.test.tsx`. Browser tests live in `e2e/`, static assets in `public/`, and implementation notes in `docs/`. Do not commit generated `.next/`, coverage, Playwright reports, or local `.worktrees/` content.

## Build, Test, and Development Commands

- `npm run dev` starts the Next.js development server.
- `npm run lint` runs ESLint with Next.js Core Web Vitals and TypeScript rules.
- `npm run typecheck` validates TypeScript without emitting files.
- `npm test` runs the Vitest unit and component suite once.
- `npm run test:e2e` runs Playwright browser and Axe accessibility checks. Install its browser once with `npx playwright install chromium`.
- `npm run build` creates the production build; `npm run build -- --webpack` is the fallback when Turbopack is unavailable.

## Coding Style & Frontend Rules

Use strict TypeScript and two-space indentation. Name React components and types in `PascalCase`, functions and variables in `camelCase`, and files in `kebab-case`. Prefer focused modules, direct imports, semantic HTML, and accessible labels. Keep browser-only state behind client-component boundaries and persist only versioned, minimal data.

For every React or Next.js implementation, review, or refactor in this repository, apply the `vercel-react-best-practices` skill before changing code. Read the individual rule files relevant to the task, prioritize higher-impact categories first, and verify the result with lint, TypeScript, tests, and a production build. Follow the version-matched Next.js documentation in `node_modules/next/dist/docs/` when framework behavior differs from general guidance.

## UX & Interaction Guidelines

Every enabled `button` and button-like control must use a pointer cursor so its interactivity is immediately clear; disabled controls must use a not-allowed cursor. When a user changes routes through the top navigation, keep the navigation stable and fade the page content in over 150–250ms. Implement the fade with lightweight CSS, do not delay navigation, and honor `prefers-reduced-motion` by effectively disabling the animation. Add or update a browser test when changing either behavior.

## Testing Guidelines

Add tests for each behavior change, including failure paths and persistence boundaries. Use Testing Library for component behavior and Playwright for complete user flows, responsive layouts, and accessibility. Keep tests deterministic and query elements by accessible role or label.

## Commit & Pull Request Guidelines

Use short, imperative Conventional Commit subjects such as `feat: add daily tracker` or `fix: improve theme contrast`. Keep commits focused. Pull requests should summarize behavior, list verification commands, link relevant issues, and include screenshots for visual changes. Call out new environment variables, migrations, and known follow-up work.
