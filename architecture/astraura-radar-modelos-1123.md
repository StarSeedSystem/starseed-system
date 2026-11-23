# Radar Universal de Modelos Astraura (`AST1123` · 2026-11-23)

> Extiende `modelos-recomendados.md` y `vigia-modelos.md` para dotar a **todos los agentes y bots** de StarSeed OS de un radar continuo que investiga modelos en internet (Ollama, Hugging Face GGUF/MLX/ONNX, Epoch AI, OpenRouter `:free`, NVIDIA NIM y proveedores personalizados), los compara en pie de igualdad con las capacidades reales instaladas en cada neurona y autoenruta cada turno a través de capas de conciencia y antenas.

## 1. Principios e invariantes

1. **Encaje físico antes que preferencia:** Un modelo preferente (como `Inkling-2-Mini`, en Ollama o Hugging Face GGUF `IQ2_XXS` / `Q4_K_M`) sube al primer puesto **solo** en neuronas cuyo hardware y runtime lo soportan; en dispositivos limitados sigue mandando la capa ligera 1.58-bit/Needle o el salto cifrado por la malla (`neurona-malla`).
2. **Privacidad y separación público/privado:** Las variantes sin filtros (`clase: "abliterated"`, incluidas las builds comunitarias verificadas en Ollama o `hf.co/AtomicChat/Inkling-2-Mini-Uncensored-GGUF:IQ2_M`) nunca entran en selección automática ni en agentes/bots compartidos, capas públicas o malla ajena.
3. **Autoenrutamiento y autorreparación (`circuit-breaker`):** Si falla el motor local, degrada de forma determinista hacia par en malla → servidor propio → proveedor externo permitido según privacidad y latencia por antena.
4. **Configuración ilimitada por perfil, agente, bot y neurona:** Perfiles extensibles en JSON para proveedores personalizados, modelos `hf.co/...` y políticas por capa de conciencia (pública vs. privada) y señales de red.

## 2. Descomposición de módulos (`cola-astraura-modelos-1123.json`)

| ID | Módulo | Responsabilidad |
|---|---|---|
| `AST1123A` | `src/lib/astraura/modelos/radar-internet.ts` | Comparador unificado internet + local (ECI, latencia, VRAM/RAM, preferentes, licencia, herramientas/visión). |
| `AST1123B` | `src/lib/astraura/modelos/selector-contextual.ts` | Selección por agente/bot, capa de conciencia pública/privada y señales/antenas disponibles. |
| `AST1123C` | `src/ai/astraura/auto-reparacion-ruta.ts` | Enrutador autorreparable con enfriamiento temporal y respaldo multicapa sin puntos únicos de fallo. |
| `AST1123D` | `src/lib/astraura/modelos/perfiles-personalizados.ts` | Perfiles ilimitados de configuración por agente/bot/neurona (import/export JSON validado, sin `any`). |
| `AST1123E` | `scripts/puente/vigia_radar_modelos.py` | Vigía Python diario que cruza Epoch, Ollama, Hugging Face GGUF en tendencia y APIs gratuitas. |
| `AST1123F` | `src/components/astraura/panel-radar-modelos.tsx` | Panel estético e intuitivo para explorar hallazgos, fijar preferentes, añadir repos `hf.co/` y ajustar capas. |
