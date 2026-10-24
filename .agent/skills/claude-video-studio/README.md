# Claude Video 2.0

A free skill for Claude Code that makes motion graphics that look like a studio made them.

- **Pick a look** from a gallery of 21 styles, each one playing as a real video.
- **Answer 5 short questions.**
- **Get your video.** Claude builds it in code, shows you 3 stills to approve, renders an MP4,
  and checks its own work from the real frames.

Pure graphics, or with your own photos and clips, or with AI clips from Higgsfield (it shows you the
plan and the credit cost first, and waits for your "yes"). Works on the normal Claude Pro plan.

## Install in 3 steps

1. Copy this folder to `~/.claude/skills/`, so you have `~/.claude/skills/claude-video-studio/SKILL.md`.
2. Only for AI clips: get a key at https://console.higgsfield.ai and add one line to a file called `.env`
   in your project folder: `HIGGSFIELD_API_KEY=your_key_id:your_key_secret`. Never paste a key into the chat.
3. Open Claude Code and say: **make me a motion graphic**

You also need Node 22 or newer (https://nodejs.org) and ffmpeg (`brew install ffmpeg`).
Claude checks for you and tells you the one command to fix anything missing.

## How it works

**A. Pick a look.** A gallery opens in your browser. Every tile is a real video. Flip a studio piece to
"With media" to see the same design with real footage inside it. Press **Use this style** and paste
the name into Claude Code. Or paste links or images of your own reference.

**B. Five questions**, in one message, each with a default:

1. What is it for? (YouTube intro, Short, launch, explainer, ad) and how long? [12 s, 16:9]
2. What should it say? (the words on screen) [I'll write it from your topic]
3. Does it loop? [no]
4. Your brand: colours, fonts, logo? [use the style's]
5. Real media? Your photos or clips, AI clips from Higgsfield, or none (pure graphics) [none]

The questions live in `questions.md`, so you can change them.

**C. Build.** A storyboard (shots, timings, assets, and the credit cost if there are AI clips),
3 stills for you to approve, the render, then a pacing check and, for loops, a pixel loop check.

## The 21 looks

Studio pieces: `paper-world`, `ink-line`, `weather-widget`, `data-story`, `swiss-kinetic`,
`particle-field`, `growing-city`, `explainer-diagram`, `time-travel`, `editor-ui`, `motion-app-ui`,
`design-app-ui`, `audio-app-ui`.

Code styles: `swiss-grid`, `editorial-paper`, `midnight-grid`, `paper-cut`, `risograph`, `blueprint`,
`graphite-ui`, `poster-pop`.

Each one is a folder in `styles/` with a `STYLE.md` (colours, fonts, easing numbers, motion rules, a ban list)
and, for most, a full working piece to start from. To see the gallery any time:
`python3 ~/.claude/skills/claude-video-studio/scripts/gallery.py`

## Why it looks good: the 5 hacks

1. Pick one style first and stick to it.
2. Real references beat adjectives.
3. Write the brief in numbers.
4. Loops: one clock, and the last frame must equal the first.
5. Check frames, not code.

`references/hacks.md` explains each one and where it comes from.

## What is inside

- `SKILL.md` the steps Claude follows
- `gallery/` the style gallery and its videos
- `styles/` the 21 looks
- `questions.md` the questions (edit freely) and `config.json` (an optional link Claude mentions at the end)
- `references/` the 5 hacks, motion numbers, engine rules, Media mode, how to write a style
- `templates/` the starter page and the one-clock helper
- `scripts/` gallery, render, stills, pacing check, loop check, storyboard, Higgsfield
- `examples/` a small brief and a storyboard

Made with [HyperFrames](https://hyperframes.heygen.com) and [GSAP](https://gsap.com). All fonts are free
(Google Fonts, and Switzer loaded from Fontshare at render time). MIT licence.
