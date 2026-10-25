# Origen

- Repositorio: https://github.com/Leonxlnx/taste-skill (Alex lo dio como `leonxlnx`; GitHub no distingue mayúsculas).
- Licencia: MIT, Copyright (c) 2026 Leonxlnx (texto completo en `LICENSE`).
- Versión copiada: v2.1.5 (etiqueta y commit `12af471` del 2026-10-25); copiada el 2026-10-25. La skill se llama
  `design-taste-frontend`; el repo la publica en `skills/taste-skill/`.
- Se copian: `SKILL.md`, `README.md` y `references/` (11 guías: app-screens, colour, copy, critique, imagery, layout,
  motion, research, scenes, tells, type).
- NO se copian (la regla de la casa es «sin ejecutables»): `scripts/` (draw, inspect, lint, assets, scenes y `lib/*`),
  `library/` (9 JSON de datos, 1,7 MB; `sites.json` pesa 0,87 MB), `assets/` (CSS y JS base, `charts.js`, el escenario
  de las escenas con scroll), `evals/`, `tests/`, `install.sh` y los manifiestos de plugin.
- Revisión de seguridad (2026-10-25, solo leyendo; no se ejecutó nada): los scripts usan el disco local y un Chrome
  local por el protocolo de depuración (127.0.0.1) con un perfil temporal que ellos mismos borran; `assets.mjs` consulta
  sin clave Openverse, Wikimedia Commons, Art Institute of Chicago, Met Museum, NASA e Internet Archive con un
  User-Agent propio; `draw.mjs` guarda su historial en `~/.taste-skill/history.json` (la variable `TASTE_SKILL_HISTORY`
  lo cambia); `TASTE_SKILL_TMP` mueve los perfiles temporales. No se encontró telemetría ni envío de datos propios.
  Piden Node 22+ y un Chrome, Edge o Chromium instalado.
- `references/imagery.md` recomienda Lorem Picsum (`picsum.photos`: fotos de Unsplash bajo su licencia, con ids que
  hay que citar) como fuente de fotografía. En StarSeed las imágenes salen de los medios de la persona o de archivos
  abiertos con su crédito en el pie; una foto de Picsum solo entra tras comprobar su licencia y poner el crédito.
- Las páginas que genera cargan GSAP ScrollTrigger y Lenis desde una CDN en las escenas con scroll y fuentes de Google
  Fonts o Fontshare por su CSS.

## Cambios de StarSeed

- `STARSEED.md` (nuevo): qué manda cuando la skill y el ADN chocan, dónde se usa y cómo encaja con las demás skills.
- `SKILL.md`: una nota al principio; el resto, como el original.
- Otra vía oficial para los agentes de código: `npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"` (manual).
- Para Claude Code con el inspector y la biblioteca completos: `/plugin marketplace add Leonxlnx/taste-skill` y
  `/plugin install taste-skill@taste-skill` (autoactualización por el mercado de GitHub).
- Se renueva entera cuando el vigía (etiquetas `v*`) avise de una versión nueva; nunca a mano.
