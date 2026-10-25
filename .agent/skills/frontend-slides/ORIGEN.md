# Origen

- Repositorio: https://github.com/zarazhangrui/frontend-slides
- Licencia: MIT, Copyright (c) 2025 Zara Zhang (texto completo en `LICENSE`). Las plantillas de `bold-template-pack/`
  vienen de «beautiful-html-templates», también MIT según el propio repo; solo se copian sus fichas design.md y
  preview.md, nunca el template.html de la fuente.
- Versión copiada: etiqueta v2.1.0 (2026-05-26); último commit `9906a34` del 2026-06-23 (solo documentación). Copiada el
  2026-10-25.
- Se copian: `SKILL.md`, `STYLE_PRESETS.md` (12 estilos), `animation-patterns.md`, `html-template.md`,
  `viewport-base.css` y `bold-template-pack/` (`bold-template-pack/README.md`, `bold-template-pack/selection-index.json` y, de las 34 plantillas, su
  design.md y su preview.md). Unos 2,0 MB.
- Se quedan fuera (regla de la casa: sin ejecutables) sus scripts `extract-pptx.py` (lee un PPTX con python-pptx), `export-pdf.sh` (Playwright + Chromium) y `deploy.sh` (publica en Vercel con npx vercel), `plugins/` (manifiestos para otros agentes) y los vídeos o imágenes del README no.
- Revisión de seguridad (2026-10-25, solo leyendo; no se ejecutó nada):
  - El script deploy.sh publica en el hosting de un tercero con la cuenta de quien lo ejecute: en StarSeed **nunca** sin la
    palabra de Alex (regla del proyecto: ni `git push` ni despliegues).
  - El script export-pdf.sh descarga Chromium (~150 MB) y paquetes de Node a una carpeta temporal en cada ejecución.
  - El script extract-pptx.py procesa un archivo que trae el usuario: se ejecutaría solo en un contenedor sin red.
  - Sin telemetría ni envío de datos propios; sin claves.
  - El `SKILL.md` original pide «instalar» cosas con `pip`/`npx`: esta copia lo señala en la nota inicial y en
    `STARSEED.md` (las herramientas del OS lo sustituyen).
- Varias fichas de plantilla traen etiquetas `<link>` de fuentes chinas desde jsDelivr (`cn-fontsource-*`) y de
  `chinese-fonts-cdn.deno.dev` (un CDN de terceros): StarSeed no las usa; el exportador del OS (DSN1025D) no hace
  ninguna petición externa.
- Las presentaciones que genera cargan fuentes de Google Fonts por CSS (32 referencias en el paquete) y, en un caso,
  Fontshare. Una plantilla (`retro-windows`) pide «MS Sans Serif», que no es libre: no se usa en piezas de StarSeed.

## Cambios de StarSeed

- `SKILL.md`: una nota al principio; el resto, como el original.
- `STARSEED.md` (nuevo): qué manda cuando la skill y el ADN chocan, correspondencia de las 34 plantillas con los
  registros del ADN, dónde se usa y cómo encaja con las demás skills.
- Se renueva entera cuando el vigía (etiquetas `v*`) avise de una versión nueva; nunca a mano.
