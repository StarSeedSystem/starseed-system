# Edited in a pro editor

id: editor-ui
Best for: "AI edits my video" demos, tool launches, workflow explainers, intros, before and after reveals.
Mood: a calm dark video editor fills the frame, an AI cursor does a real edit, then the app flies apart and the finished video plays.
Reference piece: none, spec only (the original is built around real footage)
Gallery video: gallery/videos/editor-ui.mp4

## Palette (hex)
- desk: radial #1B1B1D at centre to #070708 at the edge
- app window: #121212, title bar #191919, hairlines #232323 and #262626
- panels: #1D1D1D, radius 8 px, 8 px gutters between them
- plan rows: #232323 with a 1 px inner line #2B2B2B, icon tiles #2D2D2D
- text: #EDEDED (active), #E2E2E2 (body), #7E7E7E (dim tabs)
- timeline clips (app colours, muted): video #4C478A edge #7C76C4, audio #234A3A edge #3C7F61, graphics #3E414B edge #646876
- warm grade wash: #FF9448 (soft light, only in the picture)
- accent: #D97757 clay. The ONE accent. Cursor, focus ring, click rings, cut flashes, the 3 px hairline on every clip the AI makes, caption word pill, lower third bar, export bar.

## Type
- Display: Switzer 800, tracking -0.03em, line height 1 (captions 72 px, white, soft shadow)
- Labels: Switzer 600 to 650, 14 px tabs, 15 px workspace tabs, 21 px plan rows, tabular numbers for timecode
- One word only: Instrument Serif italic, 92 px (the AI's name in the caption line)
- Font links (paste into <head>; all fonts are free):
  <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=switzer@400,500,600,700,800&display=swap">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@1&display=swap">

## Easing (numbers)
- land: expo.out, 0.7 s (panels rise 26 px from scale 0.975)
- leave: power2.in, 0.25 to 0.28 s
- move: power3.inOut, 0.45 s (camera pushes, focus ring, ripple close, cursor moves)
- pop: back.out(2), 0.32 to 0.35 s (clips land, caption words); plan ticks back.out(2.6), 0.4 s
- stagger: 0.07 s panels, 0.15 s caption words, 0.03 s list rows
- beat: 120 BPM, every hit on a 0.5 s mark

## Motion rules
- One clock drives everything. Camera, cursor, playhead, timecode and grade are pure functions of time.
- Camera is one keyframe track (x, y, scale, tilt) on the whole 1920x1080 app, perspective 2600 px.
- Every push in is power3.inOut over about 0.5 s to scale 1.4 to 2.1, then a slow drift hold (scale up 2 to 3 percent, linear) while the work happens.
- Add a small tilt from camera speed (0.0016 deg per px/s, max 3 deg) so moves feel like a lens, not a slide.
- The cursor never teleports. Moves are power3.inOut, 0.3 to 0.5 s, with a 0.05 s rest before each click.
- A click dips the cursor 16 percent for 0.2 s and drops a 44 px clay ring that grows to 1.7x and fades in 0.45 s.
- Counter-scale the cursor by camera scale to the power 0.35, so it stays readable when the camera is close.
- A clay focus ring (2 px, inset) slides to whichever panel the AI is working in.

## Signature moves
- The AI panel: a right column (464 px wide, full height) with a prompt bubble and a six-step plan. Each row spins while it runs, then pops a clay tick.
- Real edits you can follow: razor cuts land on flat gaps in the waveform with a clay flash, silences lift out (y -16, fade), the ripple closes, the duration counter drops. Clips get dragged from the bin onto V2 and snap. Captions land word by word with a clay pill on the live word. A slider drag warms the picture, then a before and after wipe.
- The dive: panels nudge out 26 px, then fly past the camera along the line from the centre (z +900 to +1500, turn up to 38 deg, blur 7 px, power3.in 0.95 s, stagger 0.05 s). The program panel falls back to z -900 so it stays clean. The camera (power4.in) fills the frame with the program monitor. 56 light streaks fly out from the centre (one in three clay). A clay radial flash (screen blend) on the landing beat.
- Optional mascot: a small spark drawn in code hops along the timeline. Squash before the jump, stretch in the air, a landing wobble, and a contact shadow that shrinks with height.

## Composition
- Title bar 44 px with three grey dots and centred tabs (Import, Edit, Export). Panel headers 34 px, active tab has a 2 px underline.
- Grid at 1920x1080: Source monitor top left (552x560), Program top centre (872x560), AI panel right (464x1020), Project bin bottom left, a 40 px tool strip, Timeline bottom centre (952x452).
- Timeline: ruler with timecode, tracks V3 V2 V1 A1 A2, 5 px clip radius, white playhead.
- App opens tilted (scale 0.80, 16 deg and -13 deg), settles flat and wide by 1.5 s. Then push into one panel per step.
- Finish: the finished video full frame for the last 3 s, captions and lower third build again, slow 5 percent push (power1.inOut).
- Film grain at 3.5 percent and a soft vignette over everything.

## With media
- The person's talking clip plays live inside the Program monitor (a 1920x1080 video scaled into an 840 px wide screen). The Source monitor shows another clip.
- Bin thumbnails are stills from their own clips. B-roll they supply is what gets dragged onto V2.
- The grade is a CSS filter on a wrapper over the footage (saturate 1.22, sepia 0.14, slight contrast) plus a #FF9448 soft light layer at 0.3.
- After the dive their footage is full frame. The lower third (12 px clay bar, dark plate wiping in, name and line) and captions sit low. Nothing covers the face.
- No footage? Draw a placeholder scene in code (silhouette at a mic, lamp, window) driven by the same clock.

## Ban list
- real editor names, logos or brand colours
- a second accent colour in the chrome
- text, cursor or mascot on a face
- a cursor that jumps, or clicks with no ring
- soft cross fades in place of real moves
- a light theme
- UI so small it cannot be read at the final camera scale
