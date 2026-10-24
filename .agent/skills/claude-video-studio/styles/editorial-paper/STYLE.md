# Editorial Paper

id: editorial-paper
Best for: data, charts, explainers, "what the numbers say".
Mood: a newspaper graphic come to life. Warm paper, black ink, one blue.
Reference piece: styles/editorial-paper/index.html (10 s, loops)
Gallery video: gallery/videos/editorial-paper.mp4

## Palette (hex)
- ground: #FFF1E5 (salmon paper)
- ink: #1A1A1A
- rules and gridlines: #E3D3C3
- muted text: #6B5E55
- accent: #0F5499 (the one line, bar or number that matters)

## Type
- Headline: Playfair Display 700, tracking -0.02em
- Numbers: Playfair Display 900, tabular figures
- Labels: Inter 500, 26 to 32 px
- Font links (paste into <head>; all fonts are free):
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@700;900&display=swap">

## Easing (numbers)
- land: power3.out, 0.7 s (21 frames)
- draw a line: power2.inOut, 1.2 to 2.0 s
- count a number: power2.out, same length as the line it rides with
- leave: power2.in, 0.4 s

## Motion rules
- Lines draw on, left to right. Numbers count up in step with them.
- The camera may zoom the chart (change the axis), never shake it.
- Fine paper grain is fine. Keep it static or very slow.

## Signature moves
- One bar turns blue, then grows past the rest. Its number counts in step.
- The axis zooms out to fit the leader. Gridlines slide, a new one enters.
- A smooth re-rank: the blue row climbs, the others step down just behind it.
- Focus: the other bars fade to the rule colour so the blue one stands alone.
- Headlines swap word by word through a mask under a short ink bar.

## Grid
12 columns, 120 px margins, 32 px gutter. Charts sit on a clear baseline.

## With media
- Photos sit in a hard rectangle on the grid, no rounded corners, no shadow.
- Grade them warm and a little flat so they sit on the paper. Never pure black.
- A thin ink hairline above, a caption label below in Inter 500, muted.
- Keep the chart or number as the hero. A photo is support, at most half the frame.

## Ban list
- 3D charts, pie charts with more than 3 slices
- neon, glow, gradients on bars
- a source line or tiny footnotes on screen
- more than one accent colour
