---
name: claude-video-studio
description: Claude Video 2.0. Make studio-quality motion graphics with Claude Code, free. It opens a gallery of 21 looks playing as real videos so the person picks one, asks 5 short questions, then builds the piece in code (HTML + GSAP, rendered to MP4 with HyperFrames). Pure graphics, or with the person's own photos and clips, or with AI clips from Higgsfield behind a storyboard and credit check that waits for "yes". Every piece is checked from real frames: 3 stills to approve, a pacing check, and a pixel loop check. Use when someone says "make me a motion graphic", "make a video intro", "animate this", "make a loop", "make a title card", "motion graphics with my photos", "turn my photo into a clip", "Claude Video", or "/claude-video-studio".
---

# Claude Video 2.0

> **StarSeed:** si la pieza es de StarSeed OS (o de una sección, mundo, cuenta, grupo o página de la red), lee
> `$SKILL/STARSEED.md` antes de la etapa A: la marca manda, el look por defecto es `starseed-trinity` y las
> preguntas van en español.

Three stages: **A. pick a look** (gallery) -> **B. five questions** -> **C. build** (storyboard, stills, render, checks).
Every step follows the 5 hacks in `references/hacks.md`: one style, real references, a brief in numbers,
one loop clock, and checking frames, not code.

`$SKILL` below means this skill's folder (usually `~/.claude/skills/claude-video-studio`).
Make a new work folder for each piece (for example `./video-<short-name>/`). Never build inside `$SKILL`.

## Before you start

Run `bash $SKILL/scripts/doctor.sh` once. If something is missing, give the person the one fix command and stop.

## Stage A: pick a look

1. Start the gallery in the background (use your background-run option; it serves on 127.0.0.1 and
   stops by itself after 90 minutes):
   `python3 $SKILL/scripts/gallery.py`
   It opens in their browser and prints the address. Give them the address too, in case it did not open
   (add `--no-open` if you only want the address). Stop it once they have picked, or leave it: it stops by itself.
2. Say, in one short message:
   "Your style gallery is open: <address>. Every tile is a real video made from code. Flip a tile to
   'With media' to see it with real photos and footage. Press 'Use this style' on the one you like and
   paste it here. Or paste 1 to 3 links or images of your own reference."
3. When they answer:
   - A style id (like `paper-world`): read `$SKILL/styles/<id>/STYLE.md`. That spec is now law for this piece.
   - Their own references: look at each one (open links, read images). Write a new spec in the work folder,
     `STYLE.md`, in the format of `$SKILL/references/style-format.md`. Describe HOW each reference was made
     (masked text, slow camera, long holds), with hex colours and easing numbers. Show it in 5 lines.
   - "You pick": choose the best look for their topic and say why in one line.

## Stage B: the questions

Read `$SKILL/questions.md`. Send the block between its two `---` lines as ONE message, word for word.
Skip anything they already told you. Accept "go" as yes to every default. Use its follow-ups only when needed.

## Stage C: build

1. **Brief in numbers** (hack 3). Write `BRIEF.md` in the work folder: size (1920 x 1080 for 16:9,
   1080 x 1920 for 9:16), length, 30 fps, loop or not, the exact words, palette in hex (brand colours replace the
   style's, its rules stay), fonts with their links, easing numbers, and the always-on ban list:
   no hue-shifting gradients, no glow, bloom or lens flares, no linear easing on anything the eye follows,
   no centred-everything, nothing scaling up from zero, at most 6 words on screen, one accent colour, no fake chrome.
   Where the chosen style's own signature conflicts with this list (a sun's glow, a centred widget), the style wins:
   its gallery video is the proof. Everything else on the list still applies.
2. **Storyboard.** Write `storyboard.json` (shots with times, what the graphic does, and the asset for each:
   `code`, `user_photo`, `user_clip` or `generate`; see `$SKILL/examples/storyboard.json`). Run
   `python3 $SKILL/scripts/storyboard.py storyboard.json` and show the table.
   - If any shot is `generate` (a Higgsfield AI clip), the table shows the credit estimate. STOP and wait for a
     clear "yes" before spending anything. Then make each clip with
     `python3 $SKILL/scripts/higgsfield.py generate ... --out media/shotN.mp4 --yes`, one at a time, and look at
     3 frames of each before using it. See `$SKILL/references/media.md`.
   - With no AI clips, show the table and go on unless they object.
3. **Build.** `bash $SKILL/scripts/new_project.sh <work>/proj 16x9|9x16 <seconds> <style id>`.
   If the style has a reference piece, the project starts as a copy of it: change the words, colours, timing and
   size to the brief (the script warns when the size or length differs; then lay it out again, never crop).
   Otherwise build from the template. If it must loop and the reference does not, follow `$SKILL/references/loops.md`.
   Rules that matter:
   - One clock for all motion (hack 4): `STUDIO.play(t => render(t), { loop })` from `studio.js`, or one paused
     GSAP timeline. Same time in, same picture out: no Math.random (use `STUDIO.rng`), no Date.now, no timers.
   - Fonts: only free ones, each loaded with a `<link>`; if any font has a link, link every font
     (see `$SKILL/references/hyperframes.md`).
   - Media goes inside the design (masks, cards, shapes), never under unreadable text, never over a face.
   - Copy their photos and clips into `<work>/proj/media/`. Never move or change their originals.
4. **3 stills to approve** (hack 5). `bash $SKILL/scripts/stills.sh <work>/proj <t1>,<t2>,<t3>`, each about 0.6 s after
   a shot change, once things have landed (look at more for your own review if you like). Read `stills/peek.jpg`. Score composition, motion, type, colour and idea from 1 to 10 like a harsh senior
   motion designer. Fix the worst 3 things; repeat until all are 8 or more. Then show the person the 3 stills and the
   scores and ask: "Good to render?" Wait for a yes (any notes: fix, new stills, ask again).
5. **Render.** `bash $SKILL/scripts/render.sh <work>/proj <work>/out/draft.mp4 draft`.
6. **Checks.** `python3 $SKILL/scripts/pacing_check.py <work>/out/draft.mp4` (add `--loop` if it loops; no dead gap over 1 s, nothing on
   screen under 0.3 s) and, if it loops, `python3 $SKILL/scripts/loop_check.py <work>/out/draft.mp4 --project <work>/proj`
   (frame at 0 s must equal the frame at the end). Read the contact sheet. Fix and re-render until both pass.
7. **Final.** `bash $SKILL/scripts/render.sh <work>/proj <work>/out/final.mp4 high`, run the checks again on it.
8. **Hand over.** Give the path, length, frame size, file size, check results, the scores, and one line on what you
   would try next. If the file is over 20 MB, also make a smaller copy for sharing:
   `ffmpeg -v error -i final.mp4 -c:v libx264 -crf 22 -preset slow -an final-share.mp4`.
   Then read `$SKILL/config.json`. If `link` is not empty, end with one line:
   "More styles and help: <link_label or link> <link>". If it is empty, say nothing about it.

## Hard rules

- Never ask for, print, log or commit an API key. Keys live in the shell or a `.env` file only.
- Never spend credits without showing the storyboard with its cost and getting a clear "yes" for that plan.
- Never cover a face with text or graphics.
- Never say a check passed without running it. Never say a look is right without looking at a frame.
- One style per piece. One accent colour. The ban list always applies.
- Only free fonts. Never copy font files into a project.

## Files

- `gallery/` the gallery page and its videos. `scripts/gallery.py` serves it.
- `styles/<id>/` 21 looks: `STYLE.md` (palette, type, easing, motion rules, signature moves, media, ban list),
  plus `index.html`, a full working reference piece, for most of them.
- `questions.md` the Stage B questions (edit freely). `config.json` the optional closing link.
- `references/` the 5 hacks with sources, motion numbers, HyperFrames rules, making a loop, Media mode and Higgsfield, style format.
- `templates/motion/` the blank starter and `studio.js` (the one loop clock).
- `scripts/` doctor, gallery, new_project, stills, render, pacing_check, loop_check, storyboard, higgsfield.
- `examples/` a small brief and a storyboard.
