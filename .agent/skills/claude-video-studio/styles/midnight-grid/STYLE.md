# Midnight Grid

id: midnight-grid
Best for: tech explainers, AI and software topics, diagrams, flows.
Mood: deep navy, quiet dot grid, one clean blue doing the talking.
Reference piece: styles/midnight-grid/index.html (12 s, loops)
Gallery video: gallery/videos/midnight-grid.mp4

## Palette (hex)
- ground: #0B1220
- dots: #1E2A44 (2 px dots on a 40 px grid)
- panels: #111A2E with a 2 px border #22304D (wires 3 px)
- text: #E8EDF7
- muted text: #8C98B3
- accent: #3D8BFF (one blue, used on the active thing only)

## Type
- Display: Inter 700, tracking -0.03em
- Labels: Inter 500, 28 px
- Code or numbers: JetBrains Mono 500
- Font links (paste into <head>; all fonts are free):
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500&display=swap">
  (the reference piece uses Inter only, so it links Inter only)

## Easing (numbers)
- land: power3.out, 0.5 s (15 frames)
- move: power3.inOut, 0.8 s
- connect a line: power2.inOut, 0.6 s
- leave: power2.in, 0.3 s
- stagger: 0.05 s

## Motion rules
- Diagrams build node by node. A line draws, then the next node lands.
- The active node gets the blue. Old nodes go back to muted.
- The camera pans across the grid like a calm slide, never a whip.

## Signature moves
- One blue pulse rides the tip of each wire as it draws, then hands the blue to the node it reaches.
- Nodes land with a wipe from their input side and a short slide; the label rises through a mask 0.1 s later.
- The camera rests one node pitch at a time; the dot grid lags a little mid-pan and lands back on the grid.
- The flow rewinds at the end: nodes leave in reverse and wires pull back into their source.

## Grid
Dot grid at 40 px. Snap every box to it. 96 px safe margin.

## With media
- Put screenshots or clips inside a node panel: same #111A2E fill, 1 px #22304D border, 16 px radius, snapped to the grid.
- Keep media calm and slightly dark so the blue accent still wins. No colour grades that add purple or cyan.
- The active media panel gets the blue border. Others stay muted.
- Reveal media with the same wipe as a node. Never float it in a glass card.

## Ban list
- glow, bloom, lens flares, neon edges
- purple-to-blue gradients
- glass cards with blur
- fake HUD rings, fake timecodes, corner labels
