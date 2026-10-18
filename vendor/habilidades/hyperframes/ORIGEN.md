# Conocimiento de HyperFrames para el agente de vídeo de Astraura

- Origen: https://github.com/heygen-com/hyperframes, commit 9566f96 (2026-10-18). Licencia Apache-2.0 (ver `LICENSE`).
- Se copian `hyperframes-core/` (reglas de composición, atributos de tiempo, determinismo) y SOLO los adaptadores de
  animación sin GSAP (CSS, WAAPI, Anime.js, Lottie, Three.js, TypeGPU, HTML en canvas, texto animado).
- **Regla StarSeed:** donde estas guías mencionan GSAP, el agente del OS usa CSS o WAAPI: la licencia de GSAP prohíbe
  usarla en herramientas de animación visual (contrato `architecture/video-hyperframes.md` §2).
- Lo usa la herramienta `video.componer` (HFR1018M). El vigía (área `habilidades`) avisa de versiones nuevas.
