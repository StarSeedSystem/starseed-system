# One ink line

id: ink-line
Best for: brand stings, calm intros, "one idea turns into the next" stories, wellness and craft pieces, logo reveals.
Mood: one sumi brush line that never lifts, quietly turning into the next thing.
Reference piece: styles/ink-line/index.html (13.8 s, does not loop)
Gallery video: gallery/videos/ink-line.mp4

## Palette (hex)
- ground (washi paper): #F4EFE6
- ink: #1C1C1C
- ink tones (dry to wet): #101010, #171716, #1F1E1D, #292726, #353230, #43403C
- inner wash tone: #7A7068 (lighter belly inside thick strokes)
- paper fibres and shade: #8C704A at low alpha, light falloff #E8DCC6
- accent: #D23C2A vermilion seal. The ONE accent, used once, at the end.

## Type
- Display: none. No words. The only glyph is the seal character.
- Seal glyph: Noto Serif JP 600, 92 px, cut out of a 138 px red square with a thin inner border.
- Font links (paste into <head>; all fonts are free):
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@600&display=swap">

## Easing (numbers)
- draw-on: sine.inOut, 1.5 s for the whole bird. The pen slows on tight curves and speeds on long ones.
- land (bloom zoom): expo.out, 0.9 s, camera scale 1.08 to 1.42.
- land (petals): back.out(1.7), 0.8 s each. Leaf unfurls with power3.out, 0.85 s.
- leave: power2.inOut, 1.15 s (stem pulled down into the water). Camera pulls back power2.inOut.
- move (ripples close into the circle): power3.inOut, 0.75 s per step. Ripples spread with expo.out, 1.7 s.
- stamp: power2.in, 0.2 s, from scale 1.22 to 1, then a tiny damped paper bump.
- stagger: 0.07 s between petals.

## Motion rules
- The line never breaks. Every shape is the same stroke, pulled, coiled and redrawn.
- Draw on twos (15 fps). Re-roll the line boil every 2 frames, about 1.7 px of wobble.
- Width follows pressure. Fast parts of the path dry out into bristle streaks.
- A wet bead of ink sits at the pen tip while it draws.
- The camera always drifts a little. It makes only one hard move: the zoom on the bloom.
- Hold beats are real holds. The bird hovers, the line keeps boiling.

## Signature moves
- Real sumi ink: six ink tones, a two-level bleed halo, feathered fibre edges, a lighter mottled core.
- Dry brush "flying white" and ink spatter on the heavy start of the final circle (ensō).
- A pale ink wash fills petals and leaf, then melts into the water.
- Ripples stand up off the water and unwind into one ensō. A red seal stamps down last.

## Composition
- Lots of empty paper. The line is the only thing in the frame.
- The hero sits near centre. The final circle is about 720 px wide, centred, with the seal low right.
- Paper grain and light are locked to the camera, so the sheet moves with the zoom.
- Soft window light from the top left. Warm shade to the bottom right.

## With media
- Trace the ink drawing from a real frame of the clip. Place the clip in world space so the real subject sits inside the ink outline.
- Fade the footage up while the line is still drawing. Hold a short beat, then fade it out and let the ink move on.
- Use the ensō as a window: a circular mask opens from the centre with expo.out and shows the clip inside the ring.
- Grade the footage to the paper: lift exposure, pull highlights down, and desaturate the background hue so it reads as washi. Keep the subject's own colours.
- Put paper grain and light over the footage with multiply, so both share one surface.

## Ban list
- more than one red mark, or any other colour in the design
- clean vector lines with even width
- the line lifting or cutting to a new stroke
- thick bars cutting across the circle when shapes rejoin
- smooth 30 fps drawing (keep it on twos)
- blotchy, dirty paper or brown corners
- words on screen
