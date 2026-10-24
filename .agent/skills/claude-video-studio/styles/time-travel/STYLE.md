# 30,000 years in 15 seconds

id: time-travel
Best for: history of an idea, "then vs now", evolution stories, timelines, origin stories.
Mood: epic and warm; one camera travels one endless timeline through every era, each drawn in its own period style.
Reference piece: styles/time-travel/index.html (17 s, does not loop)
Gallery video: gallery/videos/time-travel.mp4

## Palette (hex)
- ground: ink #15120F
- type and timeline: ivory #F3EEE4 (the one thing that never changes; it holds every era together)
- cave: ochre #C86E3C on warm rock
- vase: terracotta #B95F35, highlight #D88B5C, black glaze #17110E
- zoetrope: brass #C9A15A on cream paper
- film: silver #C8C8C4
- TV: walnut #4A2B18, phosphor #78C8F0
- 8-bit: night #0E0B24, #2A1D5C, grass #5BBF5A, brick #B4532A, gold #F2C14E
- each era has its own palette; ivory is the only colour shared by all

## Type
- Year labels: each in its era's face, 38 to 44 px, tracking 2 to 6 px
  - 30,000 BC: Libre Baskerville · 500 BC: Tenor Sans · 1834: Bodoni Moda
  - 1895: Playfair Display italic · 1951: Jost 500 · 1980: a pixel font drawn in code · 2026: JetBrains Mono
- Code line: JetBrains Mono 400, 58 px
- Max two words on screen: the year, and in the last era the code line.
- Font links (paste into <head>; all fonts are free):
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:wght@400&family=JetBrains+Mono:wght@400&family=Jost:wght@500&family=Libre+Baskerville&family=Playfair+Display:ital,wght@1,400&family=Tenor+Sans&display=swap">

## Easing (numbers)
- era travel: power4.inOut, 0.5 s per cut (0.24 s before the beat to 0.26 s after)
- push in before a cut: power3.in, about 0.55 s
- reveals and turns: power3.inOut, 0.3 to 0.45 s
- line-up land: expo.out, 0.4 s, stagger 0.035 s
- run cycle: 1.5 strides per second, one clock for every era
- exposure punch on every cut: 0.35 s fade, 7% warm white

## Motion rules
- One runner is the hero of every era: same skeleton, same phase clock. Only how it is drawn changes.
- Each era turns into the next on the move, matched on shape (vase becomes drum, slits become sprockets, screen becomes TV).
- Every cut lands on a 0.5 s beat.
- The year label rides the timeline and smears with ghost copies when the camera travels fast.
- Texture everywhere: grain, vignette, firelight flicker, dust in light beams.
- The camera never stops; it pushes into a detail, then cuts on that motion.

## Signature moves
- The match cut chain: cave bison to vase to zoetrope to film to TV to pixels to code.
- `draw(frame + 1)` types, then the code draws the runner as one ivory line.
- The finale: all seven runners line up on a tilted timeline, running in step.

## Composition
- Full frame, one era at a time, hero centred.
- The ivory timeline sits low at y 996 with ticks every 24 px; the year sits just above it on the left.
- In the finale the timeline tilts up to the right; the past is small and far, the present big and near.

## With media
- Canvas cannot draw video frames in the renderer, so build layers: background canvas, then video elements placed every frame with CSS (position, transform, clip-path, filter), then an overlay canvas for grain, scratches, scanlines, labels and the timeline.
- Grade each clip to its era. 1895 film: grayscale, sepia 0.28, contrast 1.38, blur 0.6 px, flicker, gate weave, scratches, dust. 1951 TV: grayscale, sepia 0.32, hue-rotate 168 deg, saturate 0.55, contrast 1.3, bowed scanlines, round corners, glass highlight.
- The present day can be a real person running full frame, who then shrinks into a rounded card as the seventh runner. Never draw graphics over a face.

## Ban list
- one font for every era
- clean flat vector look with no texture
- hard cuts that are not matched on shape or motion
- more than two words on screen
- colour that breaks the era (no neon in the cave, no sepia in 8-bit)
