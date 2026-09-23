# Sabame mascot

The supplied `public/sabame.png` is the source artwork. `public/sabame-mark.webp` is a 512 × 512 transparent web version used by the shared brand mark and the homepage fish. The previous `sabame-mark.svg` has been replaced.

Brand placements include the homepage navigation, application header/footer, login screen and loading screen. Decorative images have empty alternative text; their surrounding links retain accessible names.

Next.js file metadata exposes `src/app/icon.png` (48 × 48) for browser tabs and `src/app/apple-icon.png` (180 × 180, pale blue background) for home-screen bookmarks. Keep these assets in sync when changing the source mascot.

Homepage fish are decorative and use CSS transforms. They dim with the night theme and respect the hero's visibility pause and reduced-motion settings.
