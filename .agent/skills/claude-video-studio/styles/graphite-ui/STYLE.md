# Graphite UI

id: graphite-ui
Best for: software launches, app demos, feature reveals.
Mood: calm product film. Dark graphite, crisp UI, slow precise camera.
Reference piece: styles/graphite-ui/index.html (12 s, loops)
Gallery video: gallery/videos/graphite-ui.mp4

## Palette (hex)
- ground: #0E0F12
- panel: #17181C with a 1 px border #26282E
- text: #ECEDEF
- muted: #8A8F98
- accent: #3DD68C (one green: the button, the cursor, the "done")

## Type
- Display: Inter 600, tracking -0.03em
- UI text: Inter 500, 22 to 28 px
- Numbers: Inter 600, tabular figures
- Font links (paste into <head>; all fonts are free):
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap">

## Easing (numbers)
- land: cubic-bezier(0.16, 1, 0.3, 1) or expo.out, 0.6 s
- camera move: power3.inOut, 1.2 s
- list cascade: 0.04 s stagger
- no bounce, no elastic

## Motion rules
- Text reveals from behind a clean mask edge. No soft fades.
- The camera glides over the UI at an even speed. Mechanical, not handheld.
- Hold each idea long enough to read it (1.2 s or more).
- Match the stagger to how the app itself animates.

## Signature moves
- The app sits on a 3D camera: tilted wide, then flat and close, then turned away to make room for a headline.
- One green cursor clicks one green button. The label slides out and a check draws in.
- Rows tick off in a 0.12 s cascade: box fills, check draws, a strike line runs across.
- A clean wipe edge clears the list, so the piece can loop back to its first frame.

## Composition
12 columns, 120 px margins. UI panels on a 8 px grid, 16 px radius max.
The app is big and bleeds off the frame. Headlines hang off the left margin, the app sits right.
Use skeleton bars for UI text so the screen never carries more than 6 real words.

## With media
- Put real screenshots or screen recordings inside the panel, with the 1 px border and 16 px radius.
- Keep them on the same 3D camera as the app. Never float a raw screenshot on its own.
- Grade them a touch darker so the green accent stays the brightest thing on screen.

## Ban list
- orange on black
- purple gradients, glassmorphism, glow
- spinning 3D logos
- tiny unreadable UI
