# How an AI makes a video

id: explainer-diagram
Best for: how something works, pipelines, systems, product flows, "what happens when you click send".
Mood: a crisp, living system diagram where every step is a little blue packet arriving somewhere.
Reference piece: styles/explainer-diagram/index.html (14 s, does not loop)
Gallery video: gallery/videos/explainer-diagram.mp4

## Palette (hex)
- ground: #FFFFFF with a dot grid rgb(226,226,232), 38 px
- ink: #14213D (navy; also the dark editor, film strip and player)
- greys: #5B6478, #8A93A8, #C9CED9, #E4E7EE, #F4F6FA
- card border: #E3E6ED · wire track: #CDD2DC
- tint: #EAF2FE (chips after a pulse)
- mark: #D97757 (the small AI asterisk only)
- accent: blue #2B7EF9 (packets, lit wires, rings, the send and play buttons)

## Type
- Display: Switzer 800, 50 px card labels, tracking -0.035em, line height 1
- Body: Switzer 700, tracking -0.03em
- One word per card. No sentences anywhere.
- Font links (paste into <head>; all fonts are free):
  <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=switzer@400,500,600,700,800&display=swap">

## Easing (numbers)
- card land: power3.out, 0.55 s, from 60 px down at scale 0.9
- label + chip: power3.out, 0.45 s, stagger 0.07 s
- pulse: scale 1.025 in 0.1 s, then back.out(3), 0.5 s; ring fades over 0.7 s (power2.out)
- wire draw: power2.inOut, 0.2 to 0.95 s (stroke-dashoffset)
- packet: power2.inOut, 0.45 to 0.9 s, with a 220 px comet trail
- camera: power3.inOut between cards, expo.inOut for the big pull out and the final fly in
- typing: steps(6 to 9)

## Motion rules
- Everything that happens is a packet leaving one card and arriving at the next.
- Each card pulses on arrival, on a 0.5 s beat.
- Wires draw themselves first, then carry packets. Elbows are rounded (40 to 72 px).
- The camera flies so the active card fills the frame, then pulls out to show the whole machine.
- The diagram plane tilts in 3D: it lands at 20 deg, tips back during the pull out, and leans with camera speed.
- A soft blue light pool follows the active card. Card shadows flash blue on each pulse.

## Signature moves
- The loop: a "Fix" note rides a wire back from the end to an earlier step.
- One planted mistake (frame 4) that the viewer sees, then sees fixed.
- A light sweep runs the whole circuit at the end and small packets keep flowing.

## Composition
- World is 3200 x 1800, two rows of cards: top row stepped heights, bottom row in a line.
- Cards: 36 px corners, white with a soft layered shadow, 68 px icon chip and one word.
- Tiny hand-drawn line icons (2.6 px stroke, round caps).
- Close shots fill the frame with one card; the wide shot shows every card at once.

## With media
- Real clips sit inside the cards (the browser window and the video player), clipped to the card and object-fit cover.
- The film strip frames are real stills taken from the clip at each capture moment.
- The broken frame is the real still made wrong on purpose: desaturated, blurred, RGB split, three slices shifted sideways.
- At the end the camera flies into the Video card so the footage fills about 85% of the frame. Drop the tilt there so the footage stays square to camera.

## Ban list
- a second accent colour, or orange app tiles
- sentences or paragraphs on cards
- sharp corners or straight-elbow wires
- hard drop shadows
- cuts between cards (the camera always travels)
