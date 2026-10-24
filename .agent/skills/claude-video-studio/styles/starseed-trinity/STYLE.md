# StarSeed Trinity

id: starseed-trinity
Best for: StarSeed OS channel intros, brand stings, section openers (Astraura, Genesis, Biblioteca, malla), launches, explainer title cards.
Mood: night-indigo liquid crystal; the symbol is sown at the centre, the Trinity arrives from the perimeter, a horizon line crowns the name.
Reference piece: styles/starseed-trinity/index.html (7 s, loops)
Gallery video: gallery/videos/starseed-trinity.mp4

This is the house style of StarSeed OS. Its brand law lives in the `starseed-estudio-audiovisual` skill
(`references/adn-y-tokens.md`): read it first. Where this style and the skill's ban list disagree, THIS style
wins (its reference piece is the proof): centred composition, four brand colours and one multi-layer glow
on the hero are brand law here.

## Palette (hex)
- ground: #0A0F1D (noche; cosmic scenes may use #001F3F vacío profundo)
- ink: #F8F9FA (nieve); muted text #AEB6C8 (bruma); raised surface #141B2E
- accents (the Trinity, one role each, never mixed in one element): zenith #007FFF (AI guide, top),
  horizonte #10B981 (creation, left), lógica #FFBF00 (control, right)
- scarce accent: anchor #DC143C (root, bottom), at most about 10 % of what the Trinity covers
- accent coverage of a held frame: 20–30 % (check `comprobar_adn.py --cuadro`)
- registers for other sections (Astraura cian #00F0FF, Genesis, malla, economía ecológica…): adn-y-tokens §6

## Type
- Display (technical, the wordmark): Rajdhani 700, tracking 0.02em, line height 1.1
- Display (editorial, manifestos): Satoshi 700–900 from its Fontshare link only (never shipped files)
- Labels and body: Inter 300/400, 32 px at 1080p, tracking 0.04em for taglines
- Video scale: body 32 px, label 56 px, title 192 px (ratio 6); never under 28 px
- Font links (paste into <head>; link EVERY font the piece uses):
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&family=Inter:wght@300;400&display=swap">
  <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@500,700,900&display=swap">

## Easing (numbers)
- land: expo.out or power3.out, 0.6–0.7 s (the OS curve cubic-bezier(0.22, 1, 0.36, 1))
- leave: power2.in, 0.45 s (always shorter than landing)
- move: power3.inOut, 0.7 s
- trace a line: power3.inOut, 0.7 s
- stagger: 0.08 s between the cardinal panels; 0.3 s title → tagline
- breathe: scale 1 → 1.03 over 3.5–6 s, whole cycles

## Motion rules
- Only transform and opacity move. Never animate width, height or margins.
- The symbol is SOWN, never popped: point → two circles (vesica piscis) → eye → diamond.
- Panels come from the perimeter to their cardinal place; content stays centred and free.
- Text rises from behind a mask; nothing fades in softly from nothing.
- During holds, light moves, not layout: one glint crosses a crystal panel per second.
- No flashes above 3 per second; no element on screen under 0.3 s.

## Signature moves
- Siembra: the symbol builds itself at the centre in about 2.4 s.
- Entrada cardinal: zenith from the top, horizonte from the left, lógica from the right, anchor last from the bottom.
- Horizonte (the rare move, ONCE per piece): a hairline traced from the edges towards the title, never touching the centre.
- Cristalización: scattered points settle into a hexagonal lattice (silica becoming crystal).

## Composition
- Centred: every element centred in its window, every window centred on screen; controls arrive from the edges.
- Golden ratio for perimeter panels (top panel 1186 px = 1920 / 1.618 wide; side panels about 0.65 of the height).
- Safe margin 96 px; 8 px spacing grid; the centre (sagrado) stays free of chrome.
- 9:16: the same beats laid out again (symbol higher, title wraps to two lines); never crop the 16:9.

## With media
- Photos and clips sit inside crystal panels (radius 24–42 px, inner light edge `inset 0 1px 0 rgba(255,255,255,.15)`), graded slightly cool so the Trinity colours still win.
- Never text over a face; never media under unreadable text (add a noche veil to keep 4.5:1).
- Higgsfield clips only after the storyboard and its credit cost get a clear yes.

## Ban list
- loose hex values outside the tokens; recolouring or deforming the symbol
- multi-layer glow anywhere but the one hero element; glow on body text
- persistent controls covering the centre; decorative noise; fake HUD rings or timecodes
- linear easing on anything the eye follows; elastic bounces
- more than 3 type families or 3 type sizes in a scene
