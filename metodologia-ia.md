# Metodología de IA

## 1. Principios

- Lo mecánico va a la flota gratuita; en OpenRouter solo ids `:free`.
- Ningún modelo agota sus créditos: ante 429/402 se releva al siguiente sin insistir.
- El Dream no depende de una lista fija: el vigía la poda cuando un modelo deja de responder.

## 2. Rotación de modelos gratuitos

El Dream usa el primer modelo de esta lista que no esté `deprecated: true` en
`modelos-gratuitos.md`. El vigía (`scripts/puente/vigia_proveedores_gratis.py`) actualiza
la línea `> **Activo:**` cada 6 h y baja al siguiente en cuanto el activo se depreca.

1. `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free`
2. `openrouter/nvidia/nemotron-3-super-120b-a12b:free`
3. `openrouter/particle-ai/particle-1:free`
4. `openrouter/inclusionai/ling-3.2-flash:free`
5. `openrouter/poolside/laguna-xs-2.1:free`
6. `openrouter/nvidia/nemotron-nano-9b-v2:free`
7. `xkiro/qwen/qwen3.7-plus:free`
8. `xkiro/minimax/minimax-m3:free`

> **Activo:** `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free`
