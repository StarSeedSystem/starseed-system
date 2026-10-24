# The 5 hacks

These five habits are why the output looks made by a studio and not by one lazy prompt.
The skill does all five for you. Here is what each one is, and where it comes from.

## 1. Pick one style first, and stick to it

Before any code, pick ONE style from `styles/` (or build one from the person's references).
A style is a short spec: colours in hex, fonts, easing numbers, motion rules and a ban list.
Every shot in the piece uses that one spec. No mixing.

Why: when you leave the look open, every model falls back to the same default look
(dark background, glow, purple gradient). A fixed spec stops the drift between shots.

How the skill does it: Stage A shows the gallery and the person picks one look. Its STYLE.md is pasted into the brief,
and its colours become CSS tokens at the top of the file. No colour is typed anywhere else.

Sources:
- Motion Lab says to ban the default AI look up front: https://github.com/NovusEdge/motion-lab
- "Lock design tokens" in one shared place: https://aiartimind.com/how-to-make-motion-graphics-with-claude-opus-5-5/

## 2. Real references beat adjectives

"Make it sleek and modern" means nothing. A real frame from a real film means a lot.
Ask for 1 to 3 references, then describe HOW they were made (masked text, slow camera,
long holds), not just how they feel.

Where to find good ones:
- https://savee.com (moodboards of design and motion stills)
- https://godly.website (the best motion on real websites)
- https://mobbin.com (real app screens, great for product demos)
- Launch films from Linear, Apple and Cursor (search "<company> launch video")

Sources:
- A frame-by-frame look at the Linear Agent launch film (masked reveals, long holds, fast-start easing):
  https://impractical.ai/launch-videos/linear-agent
- "Find a reference, then describe its production method in words":
  https://aiartimind.com/how-to-make-motion-graphics-with-claude-opus-5-5/

## 3. Write the brief in numbers

Turn every word into a number before building:
- length in seconds, and format (1920 x 1080 or 1080 x 1920)
- colours in hex
- easing as names and seconds (expo.out over 0.6 s), never "smooth"
- one hero move per shot, with its start time
- a ban list

The default ban list (always on):
- no hue-shifting gradients
- no glow, bloom or lens flares
- no linear easing on anything the eye tracks
- no centred-everything layouts
- no more than one accent colour
- nothing scales up from zero (start at 0.6 to 0.9 with opacity)

Sources:
- Motion Lab's numeric brief: timing, hex palette, easing and spring values, a shot list, one hero move per shot:
  https://github.com/NovusEdge/motion-lab
- Bans for shifting gradients, glow and linear easing: https://aiartimind.com/how-to-make-motion-graphics-with-claude-opus-5-5/

## 4. Loops: one clock, last frame = first frame

A loop only looks seamless if the end really is the start. So:
- Drive ALL motion from one clock (`STUDIO.play(render)` in `templates/motion/studio.js`).
  render(t) draws the whole frame from t alone.
- Every repeating move uses whole-number cycles over the length (`STUDIO.wave(t, 2)`),
  and every one-off move finishes back where it began.
- Turning a piece that does not loop into one: follow the checklist in `references/loops.md`.
- Prove it: `scripts/loop_check.py` renders the frame at 0 s and the frame at the end and diffs
  the pixels. It fails if they differ. It also checks that the jump from the last frame back
  to the first is no bigger than a normal frame step.

Sources:
- Loop-phase helpers so first and last frames match: https://github.com/NovusEdge/motion-lab
- HyperFrames renders a paused timeline frame by frame, so the same time always gives the same picture:
  https://hyperframes.heygen.com (or run `npx hyperframes docs gsap`)

## 5. Check frames, not code

Code that looks right can still look wrong. So look at pictures, at the moments that matter:
1. Before the full render, grab 3 or 4 stills, each about 0.6 s after a shot change, once things have landed (`scripts/stills.sh`).
   Look at each one. Fix what is off. Get a thumbs up.
2. After the render, run the pacing check (`scripts/pacing_check.py`):
   no dead gap longer than 1 s, and nothing on screen for less than 0.3 s.
3. Look at the contact sheet it writes (one frame per second).

Sources:
- "Check boundary frames before watching the full video": https://aiartimind.com/how-to-make-motion-graphics-with-claude-opus-5-5/
- Stills at shot boundaries, numbered contact sheets, frame diffs: https://github.com/NovusEdge/motion-lab
- HyperFrames `snapshot` grabs exact frames from a composition: https://hyperframes.heygen.com
