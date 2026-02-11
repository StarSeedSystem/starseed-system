# Holographic Icon System

This theme utilizes `lucide-react` for its icon glyphs to ensure lightweight performance and React compatibility.

## Morphing Logic
The morphing logic is handled via `framer-motion` within the `Navigation.tsx` and `Controls.tsx` components. Icons scale and glow based on interaction states specified in `theme_params.json`.

## Custom Icons
To add custom SVGs, place them here and import them as React components using the `svgr` tool or manually wrapping them in the `IconWrapper` component.
