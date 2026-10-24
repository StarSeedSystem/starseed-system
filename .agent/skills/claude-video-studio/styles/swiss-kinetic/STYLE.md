# Swiss kinetic type

id: swiss-kinetic
Best for: kinetic type, music promos, title sequences, slogans, event openers, brand stings
Mood: a printed Swiss poster that dances on the beat, with one red dot that never leaves.
Reference piece: styles/swiss-kinetic/index.html (14 s, does not loop)
Gallery video: gallery/videos/swiss-kinetic.mp4

## Palette (hex)
- ground: #F1EEE6 (warm off-white stock, with grain and fibres)
- ink: #111111
- grid hairlines: #111111 at 34% opacity
- tiles: #1D1C1A to #0C0C0C (soft top-to-bottom ink gradient)
- panel: #DDD7CD, floor #CBC4B8
- accent: #E63022 Swiss red (the ONE accent: the dot, the rules, the bars). #B3241A is only its shadow side.

## Type
- Display: Inter Tight 700, tracking 0, line height 1. Words are sized to fit grid cells exactly (x height = one row, or the word fills the full width)
- Labels: none. Every word is display size.
- Font links (paste into <head>; all fonts are free):
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@700&display=swap">

## Easing (numbers)
- land: expo.out, 0.36 s (slams), with motion blur 34 px falling to 0 in 0.24 s
- leave: power4.in, 0.3 s (bands shear out with 70 px blur)
- move: power4.inOut, 0.46 s (rotate, slide, grow)
- settle: elastic.out(1, 0.45), 0.4 s; overshoot 1.5 degrees on the rotate
- notes: back.out(1.25), 0.3 s (letters stepping rows)
- stagger: 0.03 s between letters, 0.035 s between grid lines

## Motion rules
- Every hit lands on the 0.5 s beat (120 BPM). Hold a beat after each big move.
- Words never fade. They rise out of a mask, slide in, or stamp down.
- Fast moves get directional motion blur. It clears the moment the move ends.
- The grid pulses (opacity 1 back to 0.6) on every hit.
- Cut on motion: the exit of one idea is the entrance of the next.
- Things that land squash: the dot squashes and springs back, tiles shrink to 98.5% then settle.

## Signature moves
- The one red dot: big circle, then a full stop, then the dot of an i, then the empty slot of the puzzle, then the big circle again in the same place.
- The slam and slice: the hero word rises with a red mis-registered ghost, is cut into 3 bands that shear, then snaps back.
- The melody: letters jump between grid rows like notes on a staff.
- The sliding puzzle: black tiles slide one cell per beat and the dot swaps places with each tile.

## Composition
- 6 x 4 modular grid: columns 260 px, gutter 40, rows 152 px, gutter 96, margins 80 left and right, 92 top and bottom.
- The grid is visible and draws itself in first. Every word, bar and tile snaps to it.
- Hang text off the left margin. The circle lives top right.
- The frame is full: one giant word, or a full poster, never a small thing in the middle.

## With media
- Letters become windows. Use an SVG clipPath built from the word's glyphs, set on the clip's wrapper with CSS clip-path.
- Grade the clip inside the letters to duotone with an SVG feColorMatrix: background goes to ink, the subject keeps the red.
- Zoom in about 2x on the subject while it is in the letters.
- To show the clip clean, open one letter stem into a full grid panel (cols 4 to 6) and crossfade a lightly warmed, ungraded layer in 0.4 s.
- Red EQ bars on the beat sit beside the panel, never on top of it.

## Ban list
- a second accent colour
- fades from nothing, soft dissolves
- centred layouts, words off the grid
- rounded corners, glows, gradients on type
- more than one idea moving at once
