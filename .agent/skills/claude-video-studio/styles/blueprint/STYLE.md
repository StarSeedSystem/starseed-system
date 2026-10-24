# Blueprint

id: blueprint
Reference piece: styles/blueprint/index.html (12 s, loops)
Gallery video: gallery/videos/blueprint.mp4
Best for: how things work, product parts, engineering, step by step.
Mood: a technical drawing that builds itself, line by line.

## Palette (hex)
- ground: #0E3A66
- lines: #CFE3F7 (2 px strokes)
- faint grid: #1C4D80
- text: #EAF3FC
- accent: #FFD23F (one highlight: the part that matters)

## Type
- Labels: IBM Plex Mono 500, 26 to 32 px, all caps, tracking 0.06em
- Big numbers: IBM Plex Mono 700
- Font links:
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;700&display=swap">

## Easing (numbers)
- draw a stroke: power1.inOut, 0.6 to 1.2 s (stroke-dashoffset)
- dimension arrows: expo.out, 0.5 s
- camera: power2.inOut, 1.0 s pans

## Motion rules
- Everything is drawn as strokes first, then filled (if ever).
- Labels arrive with a leader line that draws from the part to the label.
- Only the accent part fills with yellow.

## Signature moves
- Construction lines shoot across the sheet first, the real strokes trace over them, then the construction lines fade.
- Exploded view: parts slide apart along one axis with a small stagger and a damped settle. Inner parts lag behind.
- Hidden lines: a part inside another is dashed, and turns solid the moment it is uncovered.
- Dimension lines grow out from their number, with the arrowheads riding the tips.
- The key part fills yellow with a bottom up wipe, its label turns yellow, and the camera pushes in on it.

## Grid
Fine grid at 24 px, heavy grid at 120 px. 96 px margins.
A thin sheet border 48 px in, with corner marks, a scale bar and an empty title block.
The grid moves at 30% of the camera for parallax.

## With media
- Keep photos out of the drawing itself.
- A photo can sit beside the drawing in a sharp edged frame drawn with the same 2 px line, graded to a cool blue duotone.
- Or trace the object from a photo, then cut from the photo to the drawing on a stroke.

## Ban list
- photos inside the drawing
- soft shadows, glow
- rounded friendly type
- more than one highlight at a time
