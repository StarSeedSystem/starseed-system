# Animated in a motion app

id: motion-app-ui
Best for: "AI animates my shot" demos, title and motion tool launches, keyframe and easing explainers, tracking demos.
Mood: a dark motion app fills the frame, an AI cursor sets keyframes and bends the curve, then the app peels away and the finished shot plays.
Reference piece: none, spec only (the original is built around real footage)
Gallery video: gallery/videos/motion-app-ui.mp4

## Palette (hex)
- desk: #0A0A0B to #0B0B0C, app window #121212
- panels: #1D1D1D, radius 8 px; timeline rows #1F1F1F, property rows #1A1A1A, selected row #2B2B2B
- text: #EDEDED (active), #9A9A9A (row numbers), #7A7A7A (dim labels)
- layer label chips (app colours, muted): #4E7380, #5F7A55, #6D6A55, #7A6F9E, #86796A
- graph curve: #F2F2F2, 3 px; analysed track keys #CFCFCF
- accent: #D97757 clay. The ONE accent. Cursor, focus ring, keyframes the AI sets, bezier handles, tracker box and trail dots, cache bar, the one serif word.

## Type
- Display: Switzer 800, tracking -0.03em, line height 0.95 (the title inside the comp, 148 px, white)
- Labels: Switzer 600 to 700, 13 to 16 px in the timeline, tabular numbers for live values and time
- One word only: Instrument Serif italic in clay, with a thin stroke for weight (for example the "2.0" in a title)
- Font links (paste into <head>; all fonts are free):
  <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=switzer@400,500,600,700,800&display=swap">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@1&display=swap">

## Easing (numbers)
- land: expo.out, 0.7 s (panels stagger in)
- leave: power2.in, 0.25 s
- move: power3.inOut, 0.45 s (camera pushes, cursor moves)
- pop: back.out(2.2), 0.4 s (keyframe diamonds, tracker box back.out(2) over 0.3 s)
- peel: power2.in, 0.55 s; blur power3.in, 0.5 s
- stagger: 0.07 s panels, 0.02 to 0.05 s per panel in the peel
- beat: 120 BPM, every hit on a 0.5 s mark

## Motion rules
- One clock. Camera, cursor, comp time, timeline, graph, tracker and title are all pure functions of time.
- Two clocks agree: the comp clock (the playhead inside the app) is one table. The picture, title, callout and tracker always show that comp time.
- The camera is a keyframe track (x, y, scale, tilt). App opens tilted (scale 0.80, 16 deg and -13 deg) and settles wide by 1.5 s. Each push is power3.inOut, about 0.45 s, to scale 1.5 to 2.7, then a slow linear drift hold.
- The cursor never teleports. Every click gets a clay ring that grows and fades. The label badge reads "AI name · step" and stays on screen.
- The title move, the motion path dots and the graph curve all use ONE cubic bezier. When the AI drags a handle, all three change together.
- Draw the timeline on one canvas at high pixel ratio (2.4). Rows slide in as they appear (30 px tall).

## Signature moves
- Linear becomes ease: first a preview with evenly spaced white dots along the motion path. Then the camera dives into the graph editor, the AI drags both bezier handles, an "Influence 80%" tag shows, the keys turn into hourglass shapes. Second preview: the dots bunch at both ends.
- Keyframes being set: twirl open Position, Scale, Opacity, click three stopwatches, three clay diamonds pop. Values count live next to them.
- The tracker: a 3 px clay inner box, a dashed white outer box, a white crosshair, a "Track Point 1" tag, and a trail of clay dots every 2 frames. A callout gets pinned to the track.
- The peel finish: panels hinge on their outer edges (turn 55 to 62 deg, z +800 to +1100, blur to 14 px, fade at +0.42 s). The desk dims to 0.35. The camera speeds into the viewer (power3.in). A clay flash on the beat: up to 0.8 in 0.06 s, out in 0.5 s.

## Composition
- Title bar with workspace tabs (Animate, Track, Render), a tool strip with a Text tool, Project bin, Effects and Presets, the comp viewer top centre, the AI panel right, the timeline across the bottom.
- Timeline: layer outline on the left (eye, colour chip, number, name), keyframe area on the right, a 6 px clay cache bar that sweeps across over 0.85 s before playback.
- Graph editor: dim value grid with numbers on the right, a dashed straight "before" line, the white eased curve, clay handles with round ends.
- In the finished shot: title top left, tracked callout to the upper right of the tracked point, lower third bottom left. About 6 words on screen.
- Finish: the finished shot full frame for the last 3 s, slow 5 percent push (power1.inOut).

## With media
- The person's clip plays inside the comp viewer. When the playhead is parked, show a still of that exact frame, so the picture never lies about the time.
- Track a real point (a shoulder, a product edge, never the face). Measure it with template tracking, smooth it, then drive the tracker and callout from that data.
- Bin thumbnails are stills from their own clips.
- No footage? Draw a placeholder scene in code (for example a golden-hour street with a backlit runner) driven by the same comp clock.

## Ban list
- real motion app names, logos or brand colours
- a second accent colour in the chrome
- tracker, callout or title on a face
- keyframes that appear with no click
- a curve change that does not change the motion path
- a light theme
- tiny UI that cannot be read at the final camera scale
