# Origen

- Repositorio: https://github.com/ItsssssJack/claude-video-2
- Licencia: MIT (texto completo en LICENSE)
- Versión copiada: commit 18891e4, del 2026-10-21; copiada el 2026-10-24
- Copia hecha para el plugin privado «starseed-estudio» de StarSeed; no se publica en mercados públicos.
- Revisión de seguridad antes de copiarla (2026-10-24): scripts solo con la biblioteca estándar; la galería
  sirve en 127.0.0.1 y se apaga sola; la clave de Higgsfield solo se lee del entorno o de `.env` y nunca se
  imprime; generar exige `--yes`; dependencias externas: `npx hyperframes@0.8.181`, GSAP por jsDelivr y
  fuentes de Google Fonts y Fontshare.

## Cambios de StarSeed

- `STARSEED.md` (nuevo): cómo se usa con la marca, en la nube y en español.
- `SKILL.md`: una nota al principio que manda a `STARSEED.md`; el resto, como el original.
- `styles/starseed-trinity/` (nuevo): STYLE.md y pieza de referencia de 7 s (bucle) con la siembra, la
  entrada cardinal, el horizonte y el rótulo. Comprobada el 2026-10-24: pacing PASS, bucle PASS,
  ADN p1 21 % (aprobado), p2–p4 aprobadas, lint 0 errores.
- Copia del repo (`.agent/skills/`, para los agentes del enjambre): sin `gallery/` (sus vídeos pesan 61 MB y los
  agentes no la abren). La galería completa vive en el Claude Code de la Mac y, en vista previa, en el plugin
  «starseed-estudio». Para la interfaz del OS lo útil aquí son los STYLE.md, `references/motion-craft.md` y
  `STARSEED.md` §6 (los números de vídeo se traducen a los tokens de interfaz, nunca se copian).
