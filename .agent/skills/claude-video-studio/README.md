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

## Uso en el enjambre StarSeed

Esta skill sirve para crear piezas de vídeo de StarSeed OS (intros de canal, Shorts/Reels, lanzamientos, explicativos y loops de identidad). La guía completa está en `USO-ENJAMBRE.md` y la adaptación de marca en `STARSEED.md`.

### Flujo (3 etapas)

**A. Elegir look.** `python3 scripts/gallery.py` abre la galería (en la Mac) o un artefacto HTML con las fichas (en la nube, Cowork). Look por defecto StarSeed: `starseed-trinity`. Los otros 21 looks son registros de la identidad dinámica.

**B. Preguntas (español, un solo mensaje).** Las 5 preguntas de `questions.md` con defaults: [7 s, 16:9 y 9:16], [lo escribo desde el tema], [no], [Trinity], [ninguno]. "adelante" acepta todo.

**C. Construir** en `./video-<nombre>/`:

1. `BRIEF.md` — brief en números: tamaño, duración, fps, bucle, palabras exactas, paleta hex, fuentes con `<link>`, easings, lista de prohibiciones.
2. `storyboard.json` — shots con tiempos, acción y `asset` (`code`, `user_photo`, `user_clip`, `generate`). Si hay `generate` (Higgsfield), `python3 scripts/storyboard.py storyboard.json` muestra el coste: esperar un "sí" claro antes de gastar créditos.
3. `bash scripts/new_project.sh <dir> 16x9|9x16 <segundos> <style-id>` — crea el proyecto HyperFrames (HTML + GSAP + `studio.js`).
4. `bash scripts/stills.sh <dir> <t1>,<t2>,<t3>` — 3 fotogramas para aprobar (puntuación 1-10, todos ≥ 8). Preguntar "¿Renderizo?" antes del siguiente paso.
5. `bash scripts/render.sh <dir> <out>.mp4 draft` — render draft.
6. `python3 scripts/pacing_check.py <out>.mp4` y, si hace bucle, `python3 scripts/loop_check.py <out>.mp4 --project <dir>`.
7. `bash scripts/render.sh <dir> <out>.mp4 high` — render final y repetir checks.
8. Entrega: ruta, duración, peso, checks y puntuaciones. Si > 20 MB, `ffmpeg -v error -i final.mp4 -c:v libx264 -crf 22 -preset slow -an final-share.mp4`.

### Reglas duras del enjambre

- Nunca pedir, imprimir, loguear o commitear claves API (solo `.env` o shell).
- Nunca gastar créditos sin storyboard con coste y "sí" explícito.
- Nunca tapar una cara con texto ni gráficos.
- Nunca decir que un check pasó sin ejecutarlo, ni que un look está bien sin ver un frame.
- Un solo estilo y un solo color de acento por pieza. Lista de prohibiciones siempre activa.
- Solo fuentes gratuitas vía `<link>`, nunca copiar archivos de fuente al proyecto.
- Para piezas StarSeed: leer `STARSEED.md` antes de la etapa A.

## Ejemplo de uso: Intro canal StarSeed OS (Trinity, 7 s)

Tarea: intro de canal de 7 s, look `starseed-trinity`, registro Trinity, palabras "StarSeed OS" y "basta de ilusiones", sin medios reales.

1. `python3 scripts/gallery.py` → elegir `starseed-trinity`.
2. Mensaje a Claude: `make me a motion graphic. Intro de canal StarSeed OS, 7 segundos, 16:9 y 9:16, look starseed-trinity, registro Trinity, palabras "StarSeed OS" y "basta de ilusiones", sin medios reales.`
3. `BRIEF.md` (ver `examples/trinity-intro-brief.md`): 1920×1080 y 1080×1920, 7.0 s, 30 fps, fondo #0A0A0A, acento Oro #FFD700 (20-30 % del frame en espera), easings ADN, máx 6 palabras en pantalla.
4. `storyboard.json` (ver `examples/trinity-intro-storyboard.json`): 7 shots, todos `asset.kind: code`.
5. `bash scripts/new_project.sh video-intro-trinity 16x9 7 starseed-trinity`.
6. `bash scripts/stills.sh video-intro-trinity 0.8,2.0,5.5` → puntuar cada frame ≥ 8 → "¿Renderizo?".
7. `bash scripts/render.sh video-intro-trinity video-intro-trinity/out/draft.mp4 draft`.
8. `python3 scripts/pacing_check.py video-intro-trinity/out/draft.mp4`.
9. `bash scripts/render.sh video-intro-trinity video-intro-trinity/out/final.mp4 high`.
10. Entrega: `video-intro-trinity/out/final.mp4`, 7 s, checks y puntuaciones en `claude/intro-trinity-2026-11-22.md`.
