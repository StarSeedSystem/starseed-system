# Motion craft: the numbers

Use these when the style file does not say otherwise. At 30 fps, 1 frame = 0.033 s.

## Timing
- A normal move: 8 to 18 frames (0.27 to 0.6 s). Median about 10 frames.
- A big camera move: 0.8 to 1.2 s.
- Stagger between items: 2 to 3 frames (0.05 to 0.1 s). Keep a group within 6 frames so it reads as one gesture.
- Hold a finished state at least 0.6 s. Hold words long enough to read: about 0.3 s per word, 1.2 s minimum for a line.
- Something visible should change at least every 1 s. In the first 3 s, every 0.5 to 1 s.
- Nothing should be on screen for less than 0.3 s.
- A flash (lightning, a strobe, an impact frame) is ONE onset, then holds or fades over 0.3 s or more. No flicker:
  two flashes 0.17 s apart read as a glitch, and the pacing check fails them.
- Music-ready: put the big hits on a 0.5 s grid (120 BPM).

## Easing
- Landing (things arriving): power3.out or expo.out.
- Leaving: power2.in or power3.in, and shorter than the landing.
- Moving from A to B on screen: power3.inOut or expo.inOut.
- Ambient drift: sine.inOut.
- Never `none`/linear on something the eye follows. Linear is only for the master clock.
- Overshoot: at most 4% (back.out(1.2)). No elastic unless the style asks for play.

## Composition
- Fill the frame. Big confident shapes. No small card floating in empty space.
- Safe margin: 80 to 120 px on a 1920 x 1080 frame.
- 8 px spacing grid. 32 px or more between separate things.
- At most 6 words on screen at once. Words are labels, not sentences.
- Hang text off a margin. Centre only when the style says so.

## Polish that separates good from great
- Secondary motion: follow-through, a small settle, a shadow that tightens as a thing lands.
- Parallax: near layers move faster than far ones.
- Masked reveals for text (slide up from behind an edge), not soft fades.
- Cut on motion: start the next shot while something is still moving.
- One thing at a time gets the accent colour.

## Self-review (do it every round)
Score the stills 1 to 10 on: composition, motion, type, colour, idea. Fix the worst 3 things.
Repeat until every score is 8 or more. Say the scores out loud to the person.
