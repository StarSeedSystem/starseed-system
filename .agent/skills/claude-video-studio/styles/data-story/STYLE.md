# Where viewers leave

id: data-story
Best for: retention charts, growth stats, before and after results, explainer data beats, report highlights
Mood: a printed newspaper chart that comes alive, calm and exact, with one blue truth.
Reference piece: styles/data-story/index.html (12 s, does not loop)
Gallery video: gallery/videos/data-story.mp4

## Palette (hex)
- ground: #FFF1E5 (salmon news paper, with grain and fibres)
- ink: #1A1A1A (lines, title, dots)
- labels: #1A1A1A at 62 to 78% opacity
- gridlines: #E6D9CE
- shadow: warm brown, rgba(60,35,15,0.28), soft and low
- accent: #0F5499 deep blue (the ONE accent: the better line, its fill, the payoff number)

## Type
- Display: Bodoni Moda 400, tracking 0, line height 1. Title 88 px. Hero number 316 px with a 150 px "%" raised beside it
- Labels: Inter 400 for ticks (26 px), Inter 500 for series names (40 px), Inter 700 for the callout number (60 px)
- Font links (paste into <head>; all fonts are free):
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400&family=Inter:wght@400;500;700&display=swap">

## Easing (numbers)
- land: power3.out, 0.45 to 0.6 s (title words, labels, callouts)
- leave: power2.in, 0.3 to 0.4 s
- move: power3.inOut, 1.0 s (camera dive in and pull back out)
- draw: sine.inOut, 2.5 s (the ink line); expo.out, 0.7 s (gridlines and baseline)
- pop: back.out(2.2), 0.3 s (playhead dots); ring pulse power2.out, 0.7 s
- count: expo.out, 1.0 s (payoff number)
- stagger: 0.09 s between title words, 0.07 s between gridlines

## Motion rules
- The whole frame is one canvas drawn from time. Nothing is a video or an image.
- The camera moves by changing the axis range, not by scaling pixels. Ticks reflow (10 min steps become 10 s steps) and labels stay sharp.
- A playhead dot rides the line and pulses a ring on every key hit. That ring is the beat.
- Numbers count. Every readout ticks up or down with the dot.
- A tiny physical push (1 to 4%) and a slow warm light keep the page alive during holds.
- Labels follow the camera a few frames late, so they feel attached, not pasted.
- All numbers on screen agree with each other. They come from the same data.

## Signature moves
- The cliff: the ink line plunges at the left while a giant serif counter falls with it.
- The dive: the camera zooms into the first minute and the tick labels reflow.
- The unzip: a blue line peels up out of the ink line and the gap fills with blue plus a fine hatch.
- The payoff: a big blue "+N%" lands in the open sky of the chart, then a light sweep passes over the gain.

## Composition
- Plot box left 216, right 1720, top 280, bottom 920 on a 1920 x 1080 frame.
- Title top left at 120 px with a short ink bar above it.
- The hero number sits right aligned at x 1700, in the empty sky above the curve.
- Max 6 words on screen at once. No source line, no legend box. Labels sit on the lines.

## With media
- Put the clip in a framed player beside the chart (2 px ink keyline, soft neutral shadow). Show the full 16:9 frame. Never crop it.
- The player's progress bar knob IS the chart playhead. They move together.
- On the insight beat, freeze the clip on a held frame (pick one with eyes open) and lift the player with a heavier keyline.
- A dotted leader joins the dot on the curve to the same time on the progress bar.
- Do not grade or filter the footage. Never draw over a face.

## Ban list
- a second accent colour (no red, no green for "good")
- chart junk: 3D bars, legend boxes, heavy borders, drop shadows on text
- scaling the chart as a bitmap (blurry ticks)
- numbers that do not match each other
- pure white paper or pure black ink
