# Swiss Grid

id: swiss-grid
Reference piece: styles/swiss-grid/index.html (9 s, loops)
Gallery video: gallery/videos/swiss-grid.mp4
Best for: titles, product facts, launch cards, kinetic type.
Mood: calm, exact, loud type on white.

## Palette (hex)
- ground: #FFFFFF
- ink: #111111
- grid lines: #E6E6E6
- accent: #E4002B (one thing per shot, never two)

## Type
- Display: Inter 900, tracking -0.04em, line height 0.9
- Labels: Inter 600, 28 to 36 px, tracking -0.01em
- Size: the hero word fills 40% or more of the frame width
- Font links:
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap">

## Easing (numbers)
- land: expo.out, 0.6 s (18 frames)
- leave: power3.in, 0.35 s (10 frames)
- move: expo.inOut, 0.9 s (27 frames)
- settle: overshoot no more than 4%
- stagger: 0.06 s between lines

## Motion rules
- Text enters by a masked slide up. It never fades in from nothing.
- One hero move per shot. Everything else waits or drifts.
- Hold each finished layout at least 0.6 s.
- Things sit on the grid when they land.

## Signature moves
- A word swaps inside its row mask like a conveyor: the old word rises out, the new one follows right behind it.
- One red dot is the full stop. It hops to the end of the new word, squashes on landing and settles.
- A block of black tiles slides one tile at a time into the gap, on the grid, every second.
- Type and blocks line up: the cap top of the first line and the last baseline match the block's top and bottom.

## Composition
12 columns, 96 px margins, 24 px gutter, 8 px baseline.

## With media
- Photos and clips sit in hard-edged grid cells (no rounded corners), cropped to the column width.
- Use them black and white or as they are; the red stays for one small thing only.
- A photo can be one of the tiles: it slides into the gap like the others.

## Ban list
- gradients, shadows, glow, blur
- rounded corners
- centred everything (hang text off the left margin)
- a second accent colour
