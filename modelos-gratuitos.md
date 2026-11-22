# Modelos gratuitos · catálogo del Dream

> Lo mantiene `scripts/puente/vigia_proveedores_gratis.py`. Cada 6 h refresca el catálogo
> (`hermes model --refresh`), sondea cada modelo `:free` con una petición de un token y,
> tras **3 fallos seguidos**, lo marca `deprecated: true` para que el Dream rote al siguiente.
> Los modelos sin sufijo `:free` (apinex, NIM de pago) los vigila `renovador-pasarelas.py`.

## 1. Catálogo

- `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free` · deprecated: false
- `openrouter/nvidia/nemotron-3-super-120b-a12b:free` · deprecated: false
- `openrouter/particle-ai/particle-1:free` · deprecated: false
- `openrouter/inclusionai/ling-3.2-flash:free` · deprecated: false
- `openrouter/poolside/laguna-xs-2.1:free` · deprecated: false
- `openrouter/nvidia/nemotron-nano-9b-v2:free` · deprecated: false
- `xkiro/qwen/qwen3.7-plus:free` · deprecated: false
- `xkiro/minimax/minimax-m3:free` · deprecated: false
