# Skills de Matt Pocock (copia para la IA de Astraura)

- Origen: https://github.com/mattpocock/skills, commit 49dd158 (2026-10-09). Licencia MIT (ver `LICENSE`).
- Se copian solo `engineering/` y `productivity/` (las estables). `misc/`, `in-progress/` y `deprecated/` no.
- Para qué: `src/ai/astraura/habilidades/ingenieria-a.ts` convierte las de `engineering/` en capacidades de Astraura con tres tamaños
  (tarjeta para Needle y BitNet, resumen para Bonsai pequeño, completa para razón, profunda y nube) y Laya elige
  cuál aplica en cada contexto (contrato `architecture/laya-y-habilidades.md`). Las de `productivity/` las convierte
  `src/ai/astraura/habilidades/productividad.ts`.
- Claude las tiene instaladas aparte como plugin «Skills For Real Engineers» del directorio de Anthropic.
- Se actualiza solo: el vigía (área `habilidades`) avisa de commits nuevos; esta copia se renueva entera, nunca a mano.
