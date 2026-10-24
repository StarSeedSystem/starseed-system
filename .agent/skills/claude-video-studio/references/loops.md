# Making a piece loop

A loop is seamless only if the frame at the end is exactly the frame at the start.
Most reference pieces in `styles/` that say "does not loop" can be turned into a loop with this checklist.

## Checklist
1. **No entrance.** Frame 0 must be a finished, good-looking frame, not an empty page that things fly into.
   Move the build-in later, or start the clock in the middle of a hold.
2. **One clock.** Draw everything from `t` (`STUDIO.play(render, { loop: true })`). Nothing reads real time.
3. **Whole cycles.** Every wave, sway, bob, rotation or drift must finish a whole number of cycles over the length:
   `Math.sin(2 * Math.PI * n * t / D)` with a whole number `n`. Find the offenders with
   `grep -n "t \*\|Math.sin(t\|Math.cos(t" index.html`. A drift like `x = t * speed` becomes a sway or a wrap.
4. **Out and back.** Every one-off change (a colour shift, a morph, a zoom, a count) must return to its start value
   by the end. Turn one-way curves into in-and-out bumps, and snap to the exact end value when a move finishes.
5. **Wrap the noise.** Grain, flicker or particle frames that use a frame index must wrap: `frame % totalFrames`.
6. **Reset while hidden.** If something must jump back (a cloud, a counter), do it while it is off screen or covered.
7. **Keep moving at the seam.** Something big should be moving across the loop point, so it never feels like a pause.
   Run `pacing_check.py --loop`, which measures the gap across the seam too.

## Prove it
`python3 scripts/loop_check.py out/draft.mp4 --project proj`
- Test A draws the frame at 0 s and the frame at the end (with the one-clock wrap switched off) and compares pixels.
- Test B checks that the jump from the last frame back to the first is no bigger than a normal frame step.
Both must say PASS.
