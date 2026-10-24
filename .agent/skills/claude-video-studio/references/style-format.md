# How a style is written

Every look in the gallery is a folder in `styles/<id>/`:

- `STYLE.md` the spec (always). The format is below. Keep it under about 80 lines.
- `index.html` a full working piece in this look (when there is one). Copy it as a starting point.
- `studio.js` only if that piece uses the one-clock helper.

A new style made from someone's references uses the same format. Save it as `styles/<new-id>/STYLE.md`.

## STYLE.md format

```
# <Display name>

id: <id>
Best for: <3 to 6 kinds of video>
Mood: <one sentence>
Reference piece: styles/<id>/index.html (<length> s, <loops or not>)   or   none, spec only
Gallery video: gallery/videos/<id>.mp4

## Palette (hex)
- ground: #......
- ink: #......
- ... (name every colour; mark the ONE accent)

## Type
- Display: <font> <weight>, tracking <em>, line height <n>
- Labels: <font> <weight>, <px>
- Font links (paste into <head>; all fonts are free):
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=...&display=swap">

## Easing (numbers)
- land: <ease>, <s>
- leave: <ease>, <s>
- move: <ease>, <s>
- stagger: <s>

## Motion rules
- <4 to 8 rules that make the motion feel like this look>

## Signature moves
- <the 2 to 4 moves that make it recognisable>

## Composition
- <grid, margins, where the hero sits, how full the frame is>

## With media
- <how real photos or clips sit in this look: masks, grading, framing>

## Ban list
- <things that break this look>
```

## Font rules (all styles)
- Only free fonts: Google Fonts, or Fontshare loaded from its own link at render time.
- If you add any font `<link>`, link EVERY font the piece uses (HyperFrames then skips its own font loading).
- Never ship font files. Never use paid fonts.
