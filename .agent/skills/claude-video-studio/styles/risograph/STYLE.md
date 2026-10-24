# Risograph

id: risograph
Best for: playful promos, events, music, culture, bold announcements.
Mood: two-ink print. Grainy, a little off-register, full of energy.
Reference piece: styles/risograph/index.html (12 s, loops)
Gallery video: gallery/videos/risograph.mp4

## Palette (hex)
- paper: #F5F0E6
- ink one: #FF48B0 (fluorescent pink, the main ink)
- ink two: #0078BF (blue, used where the two inks overprint)
- overprint: multiply blend, so pink over blue makes a dark purple by itself
- knockout: #FFFFFF inside an ink layer (white multiplies to nothing, so the paper shows)

## Type
- Display: Archivo Black, tracking -0.02em, all caps
- Small text: Space Mono 700, 24 to 28 px
- Font links (paste into <head>; all fonts are free):
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Space+Mono:wght@700&display=swap">

## Easing (numbers)
- stamp: power4.out, 0.25 s (hard landing, no fade)
- slide: expo.out, 0.5 s
- jitter: 1 to 2 px register shift on beats only

## Motion rules
- Shapes stamp in hard, like a print pass. No opacity fades.
- The blue layer sits 3 to 6 px off the pink layer (misregistration).
- Grain is a fixed seeded texture, so every frame is the same paper.
- Cut on the beat (every 0.5 s at 120 BPM).
- Build each ink as its own full frame layer with mix-blend-mode multiply. Move the blue layer, never the paper.
- Repeating patterns (stripes, rings) step by 1.5 periods, not whole ones, so the step reads as a move.

## Signature moves
- The stamp: scale 1.12 to 1 with a 1 to 2 degree rotate settle, and the blue plate thumps 4 to 7 px off and settles.
- The second plate: a halftone copy of the word lands far off register, then snaps to 18 px off.
- The roller wipe: blue bars plus one pink bar sweep across and clip the old sheet away under them.
- Halftone dots that grow toward the bottom of a shape, and swell a step on each beat.

## Grid
Big shapes, 80 px margins, chunky blocks. Overlap on purpose.

## Composition
- One poster per 4 s: a giant word, one big shape, one band of stripes or dots, one small label.
- Words hang off the left margin. Shapes bleed off the edge.
- Put the overlap where it matters: the purple belongs on the hero word or the hero shape.

## With media
- Turn photos into one ink: grayscale, high contrast, then a halftone or a flat fill in pink or blue.
- Put the photo in an ink layer so it multiplies with the other ink. Keep the paper grain on top.
- Crop photos into circles or hard rectangles. No soft edges.

## Ban list
- clean digital gradients
- more than two inks
- drop shadows
- thin hairline type
