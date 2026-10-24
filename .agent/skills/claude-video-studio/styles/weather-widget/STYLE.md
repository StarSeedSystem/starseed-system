# One widget, every sky

id: weather-widget
Best for: app and product UI promos, feature changes over time, status or dashboard stories, keynote style reveals, data that changes state.
Mood: one polished keynote widget lives through a whole day without ever cutting away.
Reference piece: styles/weather-widget/index.html (12 s, does not loop: it ends on the same square shape it opens on, but not the same frame. See references/loops.md to make it loop)
Gallery video: gallery/videos/weather-widget.mp4

## Palette (hex)
Each state has sky top, sky bottom, widget top, widget bottom:
- morning: #86BDF0, #E8F3FC, #2A78E2, #73B8F7
- cloudy: #8799AE, #CED7E1, #566D86, #8A9EB3
- rain: #334254, #5B6B7F, #1D2939, #3A4A5F
- storm: #222D3B, #3E4B5D, #121A25, #2A3748
- night: #0E1A33, #1E3263, #1A2D5A, #0B1530
- dawn: #3A5FA6, #F7E6BC, #3468C2, #C9DCF2
- text: #FFFFFF. Moon: #FFFFFF to #ECEFF6 to #C4CBDD.
- accent: #FFC94A sun yellow (core #FFF6D2 to #FFDC72 to #FFC94A). The ONE accent: sun, its bloom, dawn glow only.
- The drop shadow is tinted by the sky (for example rgba(24,78,150,0.34) in the morning).

## Type
- Display (the number): Inter 200, 300 px, tracking -0.045em, line height 0.84, tabular numbers.
- Labels: Inter 600, 70 px, tracking -0.012em, white with a soft shadow.
- Max 3 words on screen. One label per state.
- Font links (paste into <head>; all fonts are free):
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;600&display=swap">

## Easing (numbers)
- land: expo.out, 1.1 s. Widget scales 0.9 to 1 and rises 60 px.
- morph: underdamped spring over 1.25 s (damping 6.5, frequency 8.2), about 7% overshoot. Height lags width by 0.06 s, corner radius by 0.03 s.
- label in: expo.out, 0.7 s, from 46 px below and 12 px blur.
- label out: power2.in, 0.3 s, 30 px up and 8 px blur.
- move (number count, sky colour): power2.inOut, about 1 s.
- stagger: about 0.16 s between labels (the old one leaves, then the new one lands).

## Motion rules
- One object never leaves the frame. Each state change is a spring morph of the same shape.
- Shapes in order: rounded square, wide pill, tall card, wide pill, rounded square.
- Every change lands on a beat (2.5, 4.5, 7.5, 10.0 s). The sky outside changes with it.
- The number always counts. It never jumps.
- A slow float (4 px) keeps the widget alive between beats.
- Big moments get a physical reaction: the lightning jolts the widget and flashes the whole frame.

## Signature moves
- Keynote finish: a wide soft shadow plus a tight contact shadow, a lit top edge, a top sheen inside.
- Sun light spills past the widget and warms its corner.
- Three layers of hills inside the widget, rim-lit by whatever is in the sky.
- Weather has volume: clouds with lit domes and dark undersides, rain that splashes on the hills, drops on the glass.

## Composition
- The widget is the hero and fills the frame: square 880 px, pill 1680 x 620, card 720 x 940.
- Centred. The label sits top left inside, the big number bottom left.
- The sky behind is soft and out of focus. Distant clouds and rain only, no detail.
- Light lens vignette and very faint film grain (4.5%).

## With media
- Use the widget as a window: a div with the same morphing radius, overflow hidden, the clip inside with object-fit cover and a slow push.
- Put the same clip behind the widget, blurred about 42 px and darkened, drifting slowly. The world and the window match.
- If a weather clip is missing, grade another one: desaturate, darken and raise contrast for a storm. Keep coded rain, drops and lightning on top.
- Keep sun bloom, beams, lit edge and grain over the footage so it still reads as the widget.

## Ban list
- cutting away from the widget
- linear or overshoot-free morphs
- sun yellow anywhere but the sun and dawn glow
- bubble-wrap clouds made of plain circles
- white clouds sliding across a night sky
- more than 3 words at once
- macOS-only system fonts (they will not render on other machines)
