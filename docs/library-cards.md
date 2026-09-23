# Library cards

Library cards present the poster first. Hover reveals a glass details panel covering the bottom half, with a short fade and upward movement. Moving the mouse away dismisses it, including after using a control. There is no close button or internal scroll area: scrolling over the panel scrolls the page normally. The details control supports touch toggling and keyboard activation; Escape also dismisses the panel. Scores, progress, and status controls use a compact layout, with fewer grid columns on small screens to keep them usable.

The details panel uses a blurred translucent surface, supports both themes, and disables its animation for reduced-motion preferences. Hidden details are excluded from keyboard navigation.

MAL imports now prefer the provided large artwork over medium artwork. Library artwork also uses the already-stored large image for existing imports, falling back to the cover when unavailable. Responsive image selection remains handled by Next Image; library hover does not enlarge the poster. This improves source selection but cannot restore detail absent from the original image.

Coverage includes library disclosure, progress persistence, MAL synchronization, touch/keyboard interaction, theme contrast, reduced motion, and image-source fallback.
