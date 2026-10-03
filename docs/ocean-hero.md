# Ocean homepage hero

Design reference: <https://flood.pop.in.th/>.

The homepage hero is a layered open-ocean scene drawn with CSS and Canvas rather than a baked background image. CSS shapes provide the pale sky, soft clouds and sun; the dark theme layers in a night tint, moon and stars. Three deterministic anime posters and two fish remain separate from the copy, CTA links and navigation. The retained `public/images/ocean-clouds.webp` and `ocean-day.webp` assets are not currently rendered by the hero.

Desktop uses a 66% waterline and a bounded 760–900px hero. On mobile the waterline is anchored 260px from the hero's bottom, with at least 340px of scene space after the content row. This keeps the complete copy and actions above the water at narrow widths and larger text sizes. A zero-size marker positioned from `--ocean-waterline` gives Canvas the same measured CSS pixel as the static water layer and SVG fallback, including when the custom property uses `calc()`.

Canvas draws a continuous ocean body from slightly above the moving surface to the bottom, then adds restrained shaded swells, broken crest glints, light ribbons and underwater caustics. Work is capped at 30 frames per second with bounded pixel density (DPR capped at 1.5 and backing width at 1920px). Motion pauses for reduced-motion preferences, hidden tabs and offscreen content. A CSS gradient and static SVG crest remain available if Canvas 2D is unavailable; the scene does not intercept page scrolling.

## Verification

- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run test:e2e -- e2e/ocean-hero.spec.ts e2e/sabame.spec.ts`
- `npm run test:e2e -- e2e/home-header.spec.ts`
- `npm run test:e2e -- e2e/top-navigation.spec.ts`
- `npm run test:e2e -- e2e/ocean-depth.spec.ts`

The hero browser suite checks day/night transitions, CTA routes, desktop card and copy separation, moving Canvas pixels, lower-ocean coverage, reduced-motion and offscreen pauses, normal mobile scrolling, 320px/200%-text geometry and the static CSS/SVG fallback.

## Shared navigation behavior

All navigation headers share the same scroll behavior: after scrolling past the original 80px bar, the same navigation becomes fixed with a short entrance animation. It stays fixed while scrolling back up until the top is reached. Header backgrounds are opaque in both themes, except the homepage header before it becomes sticky. The login page also uses the public navigation with an opaque background. Reduced motion disables the entrance animation; the feature anchor leaves room for the bar. Application pages retain their reserved header space and page-content fade.

## Deep-ocean continuation

The server-rendered feature section descends from the hero's water color into a shared ocean-floor footer. A homepage-scoped CSS module supplies static soft light, translucent non-interactive feature panels, and matching light/dark color tokens; the hero receives only a masked bottom fade, with no Canvas changes or added motion. The section anchor, existing copy, footer demo route, and page-level footer landmark remain intact. The focused e2e/ocean-depth.spec.ts suite covers theme continuity, contrast, anchor/footer navigation, reduced motion, and mobile/zoom geometry.
