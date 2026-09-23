<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Guidance

For new lead sessions, use the following model configuration and division of responsibility:

- `gpt-6-astra`, `reasoning_effort: medium`: lead and primary planner. Astra owns requirement clarification, the implementation plan, task breakdown, technical direction, delegation, integration decisions, and the final report to the user.
- `luna-6`, `reasoning_effort: max`: primary implementer. Luna owns the main coding and implementation work assigned by Astra, including focused changes, tests, and implementation-level verification.
- `sol-6`, `reasoning_effort: high`: reviewer and verifier. Sol reviews Luna's implementation, checks correctness, regressions, tests, code quality, and requirement coverage, then reports findings and required fixes to Astra.

This file expresses a preferred operating configuration; it does not identify or switch the active runtime. Astra remains accountable for the result and may perform difficult implementation work or resolve issues when the review identifies a problem. Work should normally flow as: Astra plans and delegates -> Luna implements -> Sol reviews and verifies -> Astra decides fixes, integrates, and reports completion.

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

# Agent Roles and Delegation

The Astra lead owns requirement clarity, planning, complex reasoning, task decomposition, delegation, documentation/specification verification, integration, output QA, and the final user report. Before production, verify applicable documentation, especially docs/art-requirements.md; Astra approves specifications before costly generation. Never treat a preview as a native asset without passing the documented native gates.

When implementation is needed, Astra should delegate the main coding task to Luna-6 with a concrete scope, acceptance criteria, relevant files, and required verification. Luna should implement the change, add or update meaningful tests where required, run the checks appropriate to the change, and report changed files, commands, results, limitations, and open questions.

After Luna reports completion, Astra should send the implementation to Sol-6 for an independent review. Sol should inspect the actual diff and relevant surrounding code, verify requirements and failure paths, run or assess the applicable checks, and report findings ordered by severity with file paths, evidence, and recommended fixes. Sol reviews the work; Luna remains the primary implementer for fixes unless Astra assigns the fix elsewhere.

Astra must inspect Sol's review, decide whether fixes are needed, coordinate another implementation pass and re-review when necessary, and perform the final integration and acceptance decision. Delegation does not require individual user approval. All delegated agents must report evidence including file paths, commands, results, sources when research is involved, and limitations. Leaf agents should ask Astra before recursive delegation unless recursive delegation was expressly assigned.
