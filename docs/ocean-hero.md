# Ocean homepage hero

The homepage uses an open-ocean anime illustration with clouds, without the previous coastline or buildings. The background is `public/images/ocean-clouds.webp` (1586 × 992), encoded to WebP from a new image made with the built-in image generation tool. The previous `ocean-day.webp` is retained as an unused earlier asset.

Light and dark themes use the same image. CSS gradually dims and tints the scene over 1800ms, adding a moon, stars and reflected moonlight. Desktop hero height follows the image aspect ratio. The waterline is positioned at 50% on desktop and mobile, inside the illustration’s surface band. HTML posters and text remain separate from the background.

The transparent Canvas 2D layer supplies four overlapping swells with shaded depth, broken foam, light shafts and underwater caustics. CSS gently moves a masked copy of the painted surface band, while the sky and deep-water background remain fixed. Both layers fade with the theme. Surface-poster water tints use hero-relative lengths so their cuts follow the waterline on wide screens. Rendering runs outside React state, at no more than 30 frames per second with bounded pixel density. Motion stops for reduced-motion preferences, hidden tabs and offscreen content; there is no Pause/Resume button, and the scene does not intercept scrolling.

The surface animation uses a softly feathered mask and a small 16-second looping drift to keep painted foam aligned with the background. The water tint fades in below the surface rather than beginning at a hard horizontal edge; procedural swell fills and foam highlights soften toward their boundaries.

## Final background prompt

Mode: built-in image generation; new illustration, encoded into the workspace asset above.

> Use case: stylized-concept. Production background illustration for an anime website hero, no interface. Wide 16:10 composition. A beautiful hand-painted 2D anime OPEN OCEAN beneath a blue sky with soft towering white cumulus clouds, absolutely no land, coastline, buildings, lighthouse, boats or people. Side-on above/below-water cutaway: upper 38 percent is spacious pale blue sky and cloud banks, with clean light negative space on the upper left for later HTML headline; the water surface is horizontal at precisely 38 percent of image height. Lower 62 percent is clear luminous turquoise underwater gently deepening to blue, quiet open water with subtle painterly depth and soft diffuse light only. Calm rolling open-sea water surface in elegant anime illustration style. Keep the waterline gentle and low contrast: animated wave crests, light shafts, caustics and cards will be drawn separately in code, so avoid strong baked-in foam or rays or fish or coral. The sky and clouds are the main scenic subject. Rich but restrained cel-painted color and atmospheric cloud shading, crisp high quality illustration, not photorealistic, not 3D. No text, letters, logos, UI, posters, borders, split panels or watermark. Single continuous daytime scene; night uses same image color treatment in code.

## Verification

All navigation headers share the same scroll behavior: after scrolling past the original 80px bar, the same navigation becomes fixed with a short entrance animation. It stays fixed while scrolling back up until the top is reached. Header backgrounds are opaque in both themes, except the homepage header before it becomes sticky. The login page also uses the public navigation with an opaque background. Reduced motion disables the entrance animation; the feature anchor leaves room for the bar. Application pages retain their reserved header space and page-content fade.

- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run test:e2e -- e2e/ocean-hero.spec.ts e2e/sabame.spec.ts`
- `npm run test:e2e -- e2e/home-header.spec.ts`
- `npm run test:e2e -- e2e/top-navigation.spec.ts`

The browser runner builds production with Webpack. Tests cover the new image, reversible day/night transitions without image swapping, moving pixels in the surface and underwater lighting regions, reduced motion, mobile and wide-screen layout, normal scrolling and accessibility in both themes.
