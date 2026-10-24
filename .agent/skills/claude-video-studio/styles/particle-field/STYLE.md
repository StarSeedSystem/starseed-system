# Ten thousand points

id: particle-field
Best for: AI and data openers, abstract intros, transitions between ideas, logo builds, music visuals, tech product teasers
Mood: smoke made of light that condenses into calm, clear forms in deep night.
Reference piece: styles/particle-field/index.html (14.5 s, does not loop)
Gallery video: gallery/videos/particle-field.mp4

## Palette (hex)
- ground: #0A0F1C deep ink night (radial: #111A2C at the centre, #060912 at the edges)
- points: #F3EEE4 warm white
- grain: grey noise, overlay blend at 7%
- accent: #6FD3E8 soft cyan (the ONE accent, on exactly 5% of the points, the same 500 points all the way through)

## Type
- Display: none. The piece has no words, by design.
- Labels: none. If you must add a word, use one quiet line of Inter 300, 28 px, #F3EEE4 at 70%.
- Font links (paste into <head>; all fonts are free):
  none needed. If you add a word: <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300&display=swap">

## Easing (numbers)
- land (form to form): power2.inOut (cubic), 0.9 s per point
- slam (sheet to line): power2.in, 0.7 s
- bloom (line to rose): power3.out (quartic), 1.2 s
- settle: damped sine wobble, 3 to 4% size, decay rate 3 per second
- stagger: each point starts up to 0.5 s late (by distance from centre, or by position along the form)

## Motion rules
- Every change is a flow, never a pop. Points travel, they never appear or vanish mid-shot.
- In flight, points swirl through a noise field (70 to 150 px). They never move in straight lines.
- Light comes from density and depth only: near points are bigger and brighter, dense areas glow. No blur glow on single points.
- Each form has its own light: key plus rim on the sphere, slope light on the wave, side light on the rose.
- Trails are the same point drawn 3 more times a little earlier (1/80 s steps) at falling strength.
- A slow camera orbit gives near points parallax against far ones. A slow push-in carries the last hold.
- Pure function of time. Seeded noise and seeded random only.

## Signature moves
- The cyan thread: the same 5% of points always sit on the middle of the form (equator, crest row, line core, inner petal edge).
- Smoke to sphere: curling filaments condense centre first into a lit globe.
- The plucked string: the sheet slams into one bright line that flashes and rings in two damped modes, with a few embers hanging around it.
- The bloom: the line opens from its centre into an 8-petal rose, a cyan pulse runs round the petals, pollen drifts off the tips.

## Composition
- One form, centred, filling about 45 to 80% of the frame width.
- Lots of dark around the form. The edges stay quiet.
- The first frame already shows smoke. Never open on black.

## With media
- Points can become a photo: place each point by importance sampling (alpha x brightness^1.35) so it is dense where the photo is bright.
- Each point takes its real pixel colour, saturation lifted about 1.45x. The cyan 5% trace the outline as a rim light, so nothing covers the face.
- Then resolve the real photo under the points: blur 14 px to 0, opacity 0 to 1, while the points fade to 10%. Calm the camera orbit to zero so they line up.
- A live clip can take over with a 0.3 s crossfade, placed at the exact same rect, with the same soft feathered edge. Ease the ground colour to the clip's background.

## Ban list
- a second accent colour, rainbow points
- blur glow, lens flares, bokeh filters
- pops, cuts, or points appearing from nothing mid-shot
- straight-line travel between forms
- Math.random or anything that changes between renders
