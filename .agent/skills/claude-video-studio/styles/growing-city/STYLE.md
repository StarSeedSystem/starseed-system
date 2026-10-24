# A city that grows

id: growing-city
Best for: growth over time, yearly recaps, milestones, "look how far we came", building something step by step.
Mood: a calm toy-town island that builds itself, soft as a pastel morning, then lights up at dusk.
Reference piece: styles/growing-city/index.html (17.5 s, does not loop)
Gallery video: gallery/videos/growing-city.mp4

## Palette (hex)
- ground (sea, day): #BFE3E0, gradient #D2EEE9 to #ACD6D6
- grass: #CDE6B8 · sand: #F3E3C3 · earth: #E6D3AE · rock: #C9B28E · roads: #F4EFE6
- buildings: #F7EFDF, #ECDDC2, #DDD3EB, #E9E1F2, #F4E8E0, #E4D8C6
- house roofs: #C9BEDB, #D8C6AE, #BFB6D3 · glass: #A8BED3
- trees: #A9D497, light #CDEBB8, dark #88BC85
- shade tint: #6F6A93 by day, #2C2F6E by night (shadow sides are cool lilac, never grey)
- label ink: #2D4B53, turns cream #FAF4E8 at dusk
- dusk sea: #F4B6A0 to #968CC4 to #505A96 · night grade: #3A2870 multiply
- window light: #FFE2A0
- accent: coral #F27D72 (about 6 tower roofs, 5 house roofs and one car; nothing else)

## Type
- Display (month): Inter 700, 156 px, tracking -0.035em, line height 1.08
- Labels (count): Inter 600, 44 px, tabular numbers; the word after it is 500 at 62% opacity
- Font links (paste into <head>; all fonts are free):
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&display=swap">

## Easing (numbers)
- land (tile drop): back.out(1.3), 0.42 s, falls 1.4 units
- floor added: back.out(1.9), 0.32 s per floor
- trees pop: back.out(2.2) with a squash wobble
- month label in: expo.out, 0.4 s, rises 44 px; old month leaves up 36 px in 0.2 s (power2.in)
- count rolls: power3.out, 0.6 s
- camera: sine.inOut; orbit -16 to +10 deg over 12 s, pull back over 8.8 s
- dusk: sine.inOut, 1.6 s · windows switch on: 0.22 s each
- stagger: tiles by distance from the centre; windows in a wave from the core

## Motion rules
- The world grows on a clock: one month every 0.75 s. Every tick gives birth to a batch of buildings.
- Tall towers add one floor at a time, and each floor lands with a small overshoot.
- Things build from the centre out: tiles, then roads, then buildings, then trees.
- Secondary life never stops: cars on finished roads, boats with wakes, sea glints, ripples.
- The camera is always moving, but slowly: a gentle orbit plus a pull back as the island grows.
- One light from the top left. Shadows are soft, blurred and fall to the bottom right.

## Signature moves
- The island lays in like tiles falling into a tray, centre first.
- The month and the count tick up together while the skyline climbs.
- Dusk turns the sea peach and lilac, then windows, lamps and car lights switch on in a wave.

## Composition
- Isometric island in the centre, filling 60 to 80% of the frame width.
- Two labels only, top left at 112 px / 88 px. Nothing else on screen.
- Start close on the first tile; end wide on the lit city.

## With media
- Freeze the coded city on one frame, then dissolve (0.5 s, sine.inOut) into a still made to match that exact frame, pixel aligned.
- During the dissolve a warm light sweep crosses the windows (screen blend, 105 deg band, capped at 0.42 opacity so the midpoint does not wash out).
- Hard cut to a matching clip on its first frame. Measure the clip's camera push (here 3.15% per second) and copy it in code, so the coded version moves the same way.
- Fade the labels out before the dissolve. Keep the same camera and seed so code and footage line up.

## Ban list
- grey shadows or black outlines
- saturated colours other than the one coral
- flat boxes with no light (every block needs three shaded faces)
- more than two labels on screen
- fast cuts or a still camera
