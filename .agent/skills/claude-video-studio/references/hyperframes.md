# HyperFrames: the rules that matter

HyperFrames turns an HTML page with a paused GSAP timeline into an MP4, frame by frame.
Docs: https://hyperframes.heygen.com , or in a terminal: `npx hyperframes docs gsap`,
`npx hyperframes docs compositions`, `npx hyperframes docs data-attributes`.
The scripts pin version 0.8.181 (`HF_VERSION` changes it). Needs Node 22+ and ffmpeg.

## The contract
- One root element: `<div id="root" data-composition-id="main" data-start="0" data-duration="9" data-width="1920" data-height="1080">`.
- One paused timeline registered as `window.__timelines["main"] = tl`. `STUDIO.play()` does this for you.
- Timed media gets `class="clip"` plus `data-start` and `data-duration`.
  Video: `<video class="clip" src="media/x.mp4" muted playsinline data-start="2" data-duration="4" data-media-start="0.5">`.
- Render: `npx hyperframes render <dir> -o out.mp4 -q draft` (fast) or `-q high` (final).
- Stills: `npx hyperframes snapshot <dir> --at 0,3,6 --no-end -o stills/`.
- Lint: `npx hyperframes lint <dir>`.

## Must-follow rules (or renders flicker or differ)
- Same time in, same picture out. No `Math.random` (use `STUDIO.rng(seed)`), no `Date.now`, no timers, no `requestAnimationFrame` loops.
- Text that changes over time changes inside the render function or a tween's onUpdate, never with gsap.set on innerHTML.
- Canvas: draw the whole frame from t in render(t).
- Load media from the project folder (`media/`). Keep file names simple.

## Fonts
- Use only free fonts: Google Fonts, or Fontshare fonts loaded from Fontshare's own link at render time
  (for example Switzer: `https://api.fontshare.com/v2/css?f[]=switzer@400,500,600,700,800&display=swap`).
  Never copy font files into a project. Never use paid fonts.
- Load each font with a `<link>` in `<head>`. If you add ANY font link, link EVERY font the page uses:
  HyperFrames then skips its own font loading, and an unlinked font falls back to Times.
- System font names are swapped by HyperFrames: "Helvetica Neue", "Avenir", "SF Pro" become Inter and
  "Futura" becomes Montserrat. Pick a Google Font on purpose instead (Inter, Jost, Bodoni Moda, Playfair Display...).
- Text measured in code (canvas, offsetWidth) must be measured again after fonts load
  (`document.fonts.ready.then(redraw)`). `studio.js` does this for you.
- Rendering needs internet for GSAP and fonts (both load from public CDNs).

## Formats
- 16:9 is 1920 x 1080. 9:16 is 1080 x 1920. Lay the scene out again for each; never just crop.
- Transparent overlay for editors: `--format mov` with a transparent background.
