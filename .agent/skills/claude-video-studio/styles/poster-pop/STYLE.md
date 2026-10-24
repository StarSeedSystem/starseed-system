# Poster Pop

id: poster-pop
Best for: hooks, Shorts, big claims, countdowns, "3 things" lists.
Mood: a loud gig poster. Huge condensed type, flat colour, hard cuts.
Reference piece: styles/poster-pop/index.html (12 s, loops)
Gallery video: gallery/videos/poster-pop.mp4

## Palette (hex)
- ground: #FFD400 (yellow)
- ink: #111111
- paper: #FFFFFF (for cards and knockout text)
- accent: #111111 on yellow is the accent. No other colour.

## Type
- Display: League Gothic, all caps, tracking 0.01em, line height 0.85
- Hero word: 50% to 90% of the frame height
- Support: Archivo Black, 40 px or more
- Font links (paste into <head>; all fonts are free):
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=League+Gothic&family=Archivo+Black&display=swap">

## Easing (numbers)
- slam: power4.out, 0.2 s
- scale punch: 1.0 to 1.06 to 1.0 on the beat. Up in 0.05 s, back over 0.4 s (sine.inOut). A faster return reads as a flash.
- leave: power3.in, 0.2 s
- cut every 0.5 to 1.0 s

## Motion rules
- One word or number per beat. Cut on the beat.
- Words slam in from off frame and stop dead.
- Use the whole frame. Crop letters off the edge on purpose.

## Signature moves
- The word too big for the poster: hero words and numerals at 80% to 150% of the frame height, cropped off two edges.
- Letter slam: letters arrive one by one, 0.033 s apart, and stop dead. The zip version sends odd letters from the top and even letters from the bottom.
- Field flip: a hard cut swaps yellow ground and ink, so the type turns yellow on ink.
- Paper card: a white card slams across the giant numeral, and its Archivo Black word rises up inside the card edge 2 frames later.
- Land jolt: the whole poster drops 18 px when a word hits and settles in 0.15 s.

## Grid
No margins for the hero word. 64 px margins for support text.

## With media
- Photos and clips sit inside a paper card or a hard rectangle mask. No rounded corners.
- Grade them to high contrast black and white so the yellow stays the only colour.
- Cut media on the beat like a word. Never fade it in.

## Ban list
- gradients, shadows, glow
- small text
- more than 3 words on screen
- soft slow fades
