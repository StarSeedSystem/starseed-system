# Example brief: "Make it move" loop

What you say to Claude:
> make me a motion graphic. 16:9, 9 seconds, swiss-grid, it loops, words "Make it move.", style defaults.

The brief Claude writes from that (hack 3: every word becomes a number):

- Format: 1920 x 1080, 9.0 s, 30 fps, loops (the frame at 9.0 s = the frame at 0 s).
- Style: swiss-grid. Ground #FFFFFF, ink #111111, grid #E6E6E6, accent #E4002B. Inter 900, tracking -0.04em.
- Easing: words land expo.out 0.6 s, leave power3.in 0.35 s, tiles move power3.inOut 0.5 s.
- Words: "Make" / "it" / "move." stacked, hung off the left margin. The last word swaps: move. -> loop. -> land.
- The one motif: the red full stop. It hops from word to word and squashes when it lands.
- Beat map:
  | time | what you see | hero move |
  |---|---|---|
  | 0.5 | 3 x 3 tile block on the right, one gap | a tile slides into the gap |
  | 1.5 | last word swaps up out of its mask, new word slides up | the red dot hops and lands |
  | 2.5, 3.5 | tiles keep sliding, the gap walks a loop | tile moves |
  | 4.5 | second word swap | dot hop |
  | 5.5, 6.5 | tiles | tile moves |
  | 7.5 | third word swap, back to "move." | dot hop |
  | 8.5 | last tile move closes the gap's loop | the frame now equals frame 0 |
- Bans: no gradients, shadows, glow, rounded corners, centred text, second accent, linear easing on moving things.
- Checks: loop_check.py (0 s vs 9 s must match), pacing_check.py (no gap over 1 s, nothing under 0.3 s).

The finished piece built from this brief is `styles/swiss-grid/index.html` (its gallery video is `gallery/videos/swiss-grid.mp4`).
