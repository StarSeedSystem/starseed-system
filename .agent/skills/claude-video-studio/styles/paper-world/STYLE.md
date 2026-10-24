# Cut-paper world

id: paper-world
Best for: story openers, travel and place pieces, calm brand films, "a day in" pieces, book or kids promos.
Mood: a pop-up book builds itself, then the day slowly turns to dusk.
Reference piece: styles/paper-world/index.html (14 s, does not loop)
Gallery video: gallery/videos/paper-world.mp4

## Palette (hex)
- ground (paper): #F2E8D5 cream
- sand: #E3CBA8
- sage: #9CB49A
- deep sage: #5E7F6A
- teal (water, near banks): #2F5D62
- ink (shadows, birds, mast): #2B2B2B
- accent: #D98C7A dusk rose (sun at dusk, rim light, the boat's flag). The ONE accent.
- Every sheet has three light keys (morning, golden, dusk) mixed only from these tones.

## Type
- Display: none. This look has no words on screen. The picture tells it.
- Labels: none.
- Font links: none needed.

## Easing (numbers)
- land (big sheet): back.out(0.7), 0.55 s, slides up from 820 px below. Tilt settles with back.out(1.4), 0.75 s.
- land (small cutouts, trees, bushes): back.out(1.5), 0.42 s. Flag back.out(2.2), stars back.out(2.4), 0.5 s.
- clouds slide in: power3.out, 0.75 s.
- leave: power2.in, 0.9 s (front grass slides out of frame).
- move (camera push): power2.inOut, 6.4 s. Light change: sine.inOut, 4.4 s.
- stagger: 0.045 s between trees, plus a small seeded jitter (up to 0.04 s).

## Motion rules
- One sheet lands per beat (every 0.5 s), back to front.
- A sheet still in the air throws a wide, soft shadow. It tightens as the sheet lands.
- The camera pushes in with real parallax. Near sheets move more than far ones.
- Light changes slowly and never stops. Shadows grow longer to the left as the sun sets.
- Depth of field grows with the push: far hills and near banks blur a little.
- Small things keep moving: water strips flow, birds flap, the boat bobs, reeds sway.
- Everything is seeded. Same time, same frame.

## Signature moves
- Hand-cut edges: every outline is cut into 6 to 13 px facets and nudged by seeded noise.
- Paper finish on every sheet: a 2.4 px sun-lit rim on the top edge, grain plus fibres, a soft shadow plus a tight contact shadow.
- A river cut right through the meadow sheet, with a teal water sheet showing underneath.
- One small hero (the paper boat) sails the whole time. The last beat lands on it with a rose flag and ripple rings.

## Composition
- Full frame, 1920x1080. Sky takes the top third. Ridge lines stack from y 440 to y 800.
- The hero sits in the lower third, a little right of centre (about x 1015, y 793 at the end).
- Keep sky and sunset in frame at the end. Do not let one flat sheet fill the frame.
- Fill most of the frame with layers, but leave the sky calm.

## With media
- Put the real clip under the paper canvas. Keep it hidden until the hand-off.
- Sample the clip's colours band by band (sky top, horizon, hills, ground, water). Make them the dusk key of the paper world. Then the cut is seamless.
- Reveal by running the build in reverse: the sky sheet lifts away, then hills and meadows sink one by one on the beat. The real scene shows through layer by layer.
- Track one real object by hand. Move the paper hero onto it, match its size, then dissolve.
- Move the glow and vignette to CSS blend layers (soft-light and multiply) so they grade paper and footage the same way. Fade grain from 0.62 to 0.22 over the footage.

## Ban list
- words or numbers on screen
- clean vector edges (every edge must look cut)
- blotchy, dirty grain or heavy dark vignettes
- a second accent colour
- bright saturated greens or blues
- a flat dark meadow filling most of the end frame
- Math.random or Date.now
