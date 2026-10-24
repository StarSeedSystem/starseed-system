# A thumbnail, designed

id: design-app-ui
Best for: "AI designs my thumbnail" demos, design tool launches, layout explainers, poster and ad builds, A/B variant stories.
Mood: a bright canvas design tool with live collaborators, an AI cursor builds a thumbnail with real design moves, then the winner leaves the app as a feed card.
Reference piece: none, spec only (the original is built around real footage)
Gallery video: gallery/videos/design-app-ui.mp4

## Palette (hex)
- canvas: #EAEAE7 with a dot grid (#CFCFCA dots, 1.1 px)
- panels: #FFFFFF, hairlines #E6E6E3, shadow 0 6px 20px rgba(0,0,0,0.08)
- input fields: #F5F5F2 with a 1 px line #E8E8E4
- text: #1F1F1F (main), #6B6B67 (labels), #A3A39E (dim)
- collaborator cursors (app chrome, small): teal #2F8C83, violet #6E5FC2
- thumbnail content (inside the frame only): headline yellow #FFD43B, near black #1F1F1F
- winner ring: pen red #E5402A, used once
- accent: #D97757 clay. The ONE accent. AI cursor ring, selection boxes, handles, smart guides, measure pills, layout grid, plan ticks.

## Type
- Display: Switzer 800 caps for the thumbnail headline (the heaviest weight in the link), tracking -0.03em, line height 0.9
- Labels: Switzer 600 to 700, 13 to 16 px, dim; measure pills 13 px 700 white on clay
- Font links (paste into <head>; all fonts are free):
  <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=switzer@400,500,600,700,800&display=swap">

## Easing (numbers)
- land: expo.out, 0.7 s (floating panels stagger in)
- leave: power2.in, 0.25 s
- move: power3.inOut, 0.45 s (camera pushes, cursor moves)
- pop: back.out(2.2), 0.35 s (new layers, badge, plan ticks back.out(2.6))
- snap: power3.out, 0.25 s, with a guide flash
- stagger: 0.07 s panels, 0.06 s type letters

## Motion rules
- One clock. Our camera, the in-app canvas zoom, all three cursors, typing, drags, snaps, sliders and the hero flight are pure functions of time.
- Two cameras: our camera flies over the app (with a small tilt from its speed). The app has its own canvas zoom (60 percent down to 22 percent). The zoom label and the dot grid follow it.
- Counter-scale every overlay (selection lines, handles, guides, pills) by 1 over the canvas zoom, so they stay app-sized at any zoom.
- App opens tilted (scale 0.80, 16 deg and -13 deg) and settles wide by 1.5 s. Pushes are power3.inOut, about 0.45 s, to scale 1.6 to 2.8, then a slow linear drift hold.
- Two collaborator cursors drift slowly with name pills (28 px tall). The AI joins as a third: a clay arrow with a dark pill (#1F1F1F, 1.5 px clay ring) holding a spark and its name.
- Every hit lands on a 0.5 s beat (120 BPM).

## Signature moves
- The clay selection box: everything the AI makes gets selected with a 2 px clay box, four white handles with clay edges, and a size pill under it (for example 602 x 258).
- Real design moves: background drops in, the cut-out rises, drop shadow then outer glow are added, a slider drag blooms the glow, the headline types in huge caps.
- Snapping: a 12 column layout grid fades in, the cursor drags the headline, X snaps then Y snaps with clay guides and distance pills.
- Variants and the pick: pull back, duplicate, copies slide left and right, swap backgrounds and headline colour, a red ring is drawn round the winner, the others dim.
- The fly out: the winner hands off pixel exact to a screen copy, lifts out with a 3D tilt, and lands as a 1440x810 feed card with avatar, title and a views line that counts up. The cursor hovers, the card lifts.

## Composition
- Floating white panels: Layers left, Design properties right, AI panel far right (prompt plus a six-step plan). A tool pill floats at the bottom centre (388x52, radius 14). A slim title bar with avatars.
- The thumbnail frame sits centre canvas, 16:9, labelled "Thumbnail" in dim 13 px text above it.
- Inside the thumbnail: headline left, subject right, badge top left, an arrow pointing at the subject.
- Finish: the feed card fills the frame on light grey, neighbour cards peek in at the sides, slow push to the end.

## With media
- The person's cut-out photo (a PNG with alpha) is the subject. Their still or clip is the background.
- Variant backgrounds can be live clips, so the copies move.
- Their portrait is the channel avatar on the feed card.
- Keep the headline, badge and arrow off the face box. Check it on every held frame.
- No media? Use flat SVG art (a valley, an island at dusk) and a plain grey bust silhouette.

## Ban list
- real design tool names, logos or brand colours
- a dark theme (this look is light)
- overlays that grow or shrink with the canvas zoom
- the red used anywhere but the winner ring
- text, badge or arrow on a face
- a cursor parked on the headline at the reveal
- noisy dot grid when zoomed out (fade it as the zoom drops)
