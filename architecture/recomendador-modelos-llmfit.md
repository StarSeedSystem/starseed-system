# Recomendador de modelos por hardware — llmfit portado a TypeScript (Adenda 138)

> Motor CUANTITATIVO de encaje hardware↔modelo (memoria exacta, mejor cuantización, tokens/
> segundo estimados) y el recomendador que lo usa para comparar el catálogo de Astraura/
> OmniVoice contra cada neurona: qué tan bien encaja cada opción y cuánto mejora (o no) lo
> que el usuario ya tiene en uso. Fórmulas y constantes de calibración **portadas de
> [llmfit](https://github.com/AlexsJones/llmfit) (licencia MIT)**.

---

## 1. Objetivo

Cuando el usuario pregunta "¿qué modelo de IA me conviene en este equipo?", el OS debe
responder con **características, mejoras, requisitos y diferencias** frente a lo que ya usa
— con cifras (GB de RAM/VRAM, tokens/segundo estimados), no solo una etiqueta cualitativa.
Esta ola añade esa capa de precisión:

- **Recomendación por neurona**: compara el hardware real de cada dispositivo contra el
  catálogo de Astraura (LLM) y OmniVoice (voz).
- **Benchmarks estimados**: velocidad aproximada (tokens/segundo) por roofline de ancho de
  banda de memoria, no solo "cabe o no cabe".
- **"Lo usado vs lo recomendado"**: si hay algo mejor que lo activo, lo dice con un delta
  legible ("+35% velocidad estimada", "mejor ajuste").
- **Honestidad radical**: cuando falta un dato (parámetros reales, arquitectura, VRAM exacta)
  se usa la mejor aproximación disponible y se documenta como tal.

## 2. Arquitectura: dos módulos, una responsabilidad cada uno

| Módulo | Tipo | Responsabilidad |
|---|---|---|
| `src/ai/astraura/model-fit.ts` | Puro (sin React, sin `window`) | La CALCULADORA: bytes-por-parámetro, caché KV, memoria total, mejor cuantización para un presupuesto, veredicto de encaje (`perfecto/bueno/justo/no-cabe`), ancho de banda de GPU y tokens/segundo. Fórmulas y constantes **portadas literalmente de llmfit** (§4). |
| `src/ai/astraura/model-scout.ts` | Cliente (`"use client"`) | EL RECOMENDADOR: toma `NeuronCapabilities` + el catálogo de `model-requirements.ts`, llama a `model-fit.ts` por opción y produce `ModelRecommendation[]` con delta frente a lo usado. Expone la **firma de novedades** para la ventana de actualizaciones (§8). |

Separación deliberada: `model-fit.ts` no sabe nada de Astraura/neuronas/catálogos — es
matemática pura, reutilizable para cualquier modelo con parámetros+cuantización conocidos
(Hugging Bay, Ollama, un GGUF concreto). `model-scout.ts` es quien conoce "qué hay en el
catálogo de StarSeed" y "qué tiene esta neurona", y traduce eso al lenguaje del primero.

## 3. Relación con lo ya existente (nada se ha modificado)

Esta ola **no toca** ningún archivo existente. Conviven tres piezas con precisión distinta:

| Pieza | Escala | Responde | Usado hoy por |
|---|---|---|---|
| `model-requirements.ts::fitFor` (Adenda 109) | Cualitativa: `ideal/suficiente/justo/insuficiente` | Mínimos a mano de las ~20 opciones del catálogo curado. | `model-recommend.ts`, `NeuronModelsPanel` |
| `model-recommend.ts::recommendModels` (Adenda 109) | Cualitativa | "¿Cuál es LA mejor opción (local/servidor) para esta neurona?" — un ganador por tipo. | `NeuronModelsPanel` |
| `model-fit.ts` + `model-scout.ts` (Adenda 138, esta ola) | Cuantitativa: `perfecto/bueno/justo/no-cabe` + GB + tok/s | "¿Cómo encaja CADA opción, y cuánto mejora lo que ya uso?" — lista completa con deltas. | Nada aún — ver §9 |

`model-scout.ts` importa `fitFor`/`classifyDeviceTier` de `model-requirements.ts` para
heredar los bloqueos DUROS de plataforma (sin WebGPU/Chrome AI, ningún cálculo de memoria lo
arregla) y los combina con el veredicto cuantitativo de `model-fit.ts`. Detalle de la capa
cualitativa en `architecture/neuronas-capacidades-modelos.md`.

## 4. Fórmulas portadas de llmfit

**Fuente:** [github.com/AlexsJones/llmfit](https://github.com/AlexsJones/llmfit), MIT.
Constantes calibradas por su equipo contra el tamaño REAL de archivo GGUF de cientos de
modelos publicados — se portan tal cual, sin recalibrar.

### 4.1 Bytes por parámetro (`QUANT_BPP`, `quantBpp(q)`)

| Cuantización | bpp | Cuantización | bpp |
|---|---|---|---|
| `F32` | 4.0 | `Q4_K_M` / `Q4_0` | 0.58 |
| `F16` / `BF16` | 2.0 | `Q3_K_M` | 0.48 |
| `Q8_0` | 1.05 | `Q2_K` | 0.37 |
| `Q6_K` | 0.80 | `AWQ-4bit` / `GPTQ-Int4` | 0.5 |
| `Q5_K_M` | 0.68 | `AWQ-8bit` / `GPTQ-Int8` | 1.0 |
| `mlx-4bit` | 0.55 | `mlx-8bit` | 1.0 |

Desconocida ⇒ `0.58` por defecto (mismo valor que `Q4_K_M`/`Q4_0`, el término medio real).

### 4.2 Jerarquía y penalización de calidad

`QUANT_HIERARCHY = [Q8_0, Q6_K, Q5_K_M, Q4_K_M, Q3_K_M, Q2_K]` (mejor→peor).
`quantQualityPenalty` (perplejidad relativa, 0 = sin pérdida perceptible):
`Q8_0:0 · Q6_K:-1 · Q5_K_M:-2 · Q4_K_M:-5 · Q3_K_M:-8 · Q2_K:-12`. Explica en la UI el
compromiso calidad/tamaño cuando el scout baja de cuantización para que un modelo quepa.

### 4.3 Caché KV (`kvCacheGb`)

- **Arquitectura real conocida** (`nLayers`+`headDim`): exacta —
  `2 · nKvHeads · headDim · ctx · bytesPorElemento · nLayers / 2^30` (`2` = K+V; `nKvHeads`
  por defecto 8 si falta). `kvBytesPerElement`: `fp16:2 · fp8:1 · q8_0:1 · q4_0:0.5`.
- **Solo "cuántos B de parámetros"** (caso habitual del catálogo curado): fallback
  `0.000008 · paramsB · ctx · factor(kv)`, `factor`: `fp16:1 · fp8/q8_0:0.5 · q4_0:0.25`.

### 4.4 Memoria total estimada (`estimateMemoryGb`)

```
memoriaGb = paramsB × bpp(cuantización) + kvCacheGb(...) + 0.5 GB (margen fijo de runtime)
```

El contexto SIEMPRE se recorta a `DEFAULT_ESTIMATION_CTX = 8192` (`min(ctx pedido, 8192)`):
los modelos anuncian ventanas de 128K/1M que casi nadie usa a tope; estimar siempre al máximo
sobreestimaría el requisito real de la mayoría de sesiones.

### 4.5 Mixture-of-Experts (`moeActiveVramGb`, `moeOffloadRamGb`)

`moeActiveVramGb(activeParamsB, quant)` = VRAM de los expertos ACTIVOS
(`max(0.5, activeParamsB × bpp × 1.1)`, `×1.1` margen router/activaciones).
`moeOffloadRamGb(totalB, activeB, quant)` = RAM para offloadear el resto
(`(total − activos) × bpp`). Listas para cuando el catálogo incorpore un MoE real (hoy
ninguna entrada de `model-requirements.ts` lo es — §12).

### 4.6 Mejor cuantización para un presupuesto (`bestQuantForBudget`)

Recorre `QUANT_HIERARCHY` de mejor a peor y devuelve la primera que cabe en el presupuesto al
contexto pedido. Si ninguna cabe, reintenta con la mitad del contexto (mientras siga ≥ 1024).
Si aun así nada cabe, `null`: honesto, ninguna cuantización razonable sirve.

### 4.7 Veredicto de encaje (`scoreFit`)

```
requerido > disponible                     ⇒ no-cabe (siempre, sin excepción)

GPU / tensor-parallel:
  recomendadoGb ≤ disponible                ⇒ perfecto
  disponible ≥ requerido × 1.2               ⇒ bueno         · si no ⇒ justo

MoE-offload / CPU-offload / CPU-only (nunca "perfecto" — siempre hay compromiso):
  disponible ≥ requerido × 1.2               ⇒ bueno         · si no ⇒ justo
```

Margen de seguridad universal de llmfit: **×1.2** (`FIT_SAFETY_MARGIN`) — por debajo, "justo"
aunque técnicamente quepa.

### 4.8 Ancho de banda de GPU y tokens/segundo

`GPU_BANDWIDTH_GBPS`: ~40 GPUs habituales (Apple M1–M4 y variantes Pro/Max/Ultra, NVIDIA
GeForce RTX 30/40/50, NVIDIA datacenter A100/H100/L40/L4/V100, AMD RX 6000/7000) con su ancho
de banda real (GB/s). `gpuBandwidthGbps(gpuRenderer)` empareja por SUBSTRING
(case-insensitive, coincidencia más larga gana — "RTX 3060 Ti" gana a "RTX 3060") sobre la
cadena que ya detecta `neurons.ts` vía `WEBGL_debug_renderer_info`.

`estimateTps` aplica un **roofline de memoria**:

```
CON ancho de banda:  (bandwidthGbps / tamañoModeloGb) × 0.55 × factor(runMode)
SIN ancho de banda:  constante por backend — cuda 220 · metal 250 · rocm 180 ·
                      vulkan 150 · cpu-x86 70 · cpu-arm 90   (tokens/s)
```

`factor(runMode)`: `gpu:1 · tensor-parallel:0.9 · moe-offload:0.8 · cpu-offload:0.5 ·
cpu-only:0.3`. El `0.55` es la eficiencia real del roofline frente al pico teórico (llmfit).

## 5. Cómo se detecta el hardware

Se reutiliza `detectCapabilities()` de `src/lib/neurons/neurons.ts` (Adenda 109):
`platform`, `browser`, `webgpu`, `webgl2`, `gpuRenderer`/`gpuVendor` (vía
`WEBGL_debug_renderer_info`), `cores` (`hardwareConcurrency`), `memoryGb`
(`navigator.deviceMemory` — Firefox/Safari no lo exponen, de ahí el fallback de 4 GB en
`model-scout.ts`), `chromeAi`, `ollama`/`lmstudio`, `installedApp` (PWA). `model-scout.ts` no
toca `navigator`/`window`: recibe `caps` ya detectado por el llamador, igual que
`model-recommend.ts`/`NeuronModelsPanel`.

De ahí se derivan dos presupuestos:

- **RAM** — `caps.memoryGb` directo (o 4 GB de fallback).
- **VRAM estimada** — heurística propia por substring sobre `caps.gpuRenderer` (tabla interna
  `GPU_VRAM_GB` en `model-scout.ts`, DISTINTA de `GPU_BANDWIDTH_GBPS`: esa mide GB/s, esta GB
  de capacidad). En Apple Silicon no hay entrada — la GPU comparte RAM unificada, el
  presupuesto usa `caps.memoryGb` directamente.

## 6. El recomendador (`scoutModels`): flujo paso a paso

`scoutModels(caps, { kind?, usedModelIds?, limit? }) → ScoutResult`

1. **Catálogo**: `kind:"llm"` → `ALL_LLM_SPECS`; `"voz"` → `ALL_VOICE_SPECS`; sin `kind` →
   ambos combinados.
2. **Por cada `ModelSpec`**: servidor (`spec.access !== "local"`) ⇒ siempre `"perfecto"`,
   `requiredGb:0` (misma política que `runsRemotely`). Local: `fitFor(caps, spec)` primero
   (bloqueos duros); si falta WebGPU/Chrome AI, veredicto forzado a `"no-cabe"` sin mirar
   memoria. Si no hay bloqueo: `paramsB` = proxy honesto de `spec.req.approxSizeGb` (§12) →
   presupuesto+`runMode` según GPU (§5) → `bestQuantForBudget(paramsB, budgetGb, 8192)` →
   `recommendedGb` a `Q6_K`/contexto completo (listón de "cómodo") →
   `scoreFit(...)` → veredicto final → `estimateTps(...)`.
3. **`best`**: opciones que SÍ caben (`verdict !== "no-cabe"`), ordenadas por veredicto
   (`perfecto>bueno>justo`) y, a igual veredicto, por tamaño del modelo que sí cabe (proxy de
   capacidad). Recortado a `limit` (por defecto 6).
4. **`current`**: recomendaciones de los `ModelSpec.id` presentes en `usedModelIds`.
5. **`hasBetter`**: `true` solo con `usedModelIds` provisto Y algo en `best` con verdict
   `perfecto`/`bueno` estrictamente mejor que lo mejor ya usado.
6. **`summary`**: frase en español lista para la UI, con cascada de degradación (sin `best` →
   "no se encontró nada"; sin `current` → "tu equipo puede con X"; con `hasBetter` → "puede
   con X; ahora usas Y — X rinde mejor \[delta\]"; si no → "ya usa la mejor opción").

## 7. Cómo se compara "lo usado vs recomendado"

Cada entrada de `best` recibe `deltaVsCurrent` (contra la mejor entrada de `current`), con
hasta dos observaciones unidas por `·`:

- **Veredicto**: `"mejor ajuste (perfecto vs justo)"` / `"ajuste más justo (justo vs bueno)"`
  cuando cambia el nivel de encaje.
- **Velocidad**: `"+35% velocidad estimada"` cuando la diferencia de `estTps` supera el 5%
  (evita reportar ruido de estimación como mejora real).

Sin diferencia relevante en ningún eje, `deltaVsCurrent` queda `undefined` — nunca se inventa
un delta.

## 8. Firma de novedades (patrón `startup-updates.ts`)

`model-scout.ts` expone el mismo patrón firma+visto de `src/lib/astraura/startup-updates.ts`
(Adenda 111, ver `architecture/ventana-inicio-actualizaciones.md`), para que esa ventana
pueda anunciar hallazgos del scout ("hay algo que rinde MEJOR para TU hardware"), no solo
"hay modelos nuevos en el catálogo":

- `SCOUT_SIGNATURE_KEY = "starseed.astraura.scout.sig.v1"` (vía `safeGet`/`safeSet` de
  `@/lib/safe-storage` — nunca lanza aunque la cuota esté llena).
- `scoutSignature(caps, catalogLen)` — hash djb2 (mismo algoritmo que
  `startup-updates.ts::hash`) sobre plataforma+GPU+RAM+núcleos+WebGPU+tamaño de catálogo.
  Barata: no requiere ejecutar `scoutModels` completo.
- `hasNewScoutFindings(sig)` — compara contra la última firma vista.
- `markScoutSeen(sig)` — marca la firma actual como vista.

**Estado: la lógica está lista pero NO cableada todavía.** Ni `catalogSignature()` ni
`startup-updates-modal.tsx` llaman a estas funciones — siguen basándose solo en IDs de
catálogo (Adenda 111). Cablearlo implica sumar `scoutSignature(caps, catalogLen)` a la firma
combinada de la ventana (o mostrarla como sección aparte del modal). Ver §14.

## 9. Superficies donde se mostraría

Ninguna superficie de UI se ha tocado en esta ola. Este apartado documenta DÓNDE encajaría
cada pieza al cablearse, reutilizando superficies ya existentes:

| Superficie | Archivo real | Qué añadiría el scout |
|---|---|---|
| Ventana de inicio/actualizaciones | `startup-updates-modal.tsx` | Sección "esto rendiría mejor" cuando `hasNewScoutFindings` sea `true`, con `summary` + top de `best`. |
| Pestaña Neuronas (`/agent`, Cerebro→Neuronas) | `neuron-models-panel.tsx` | Hoy usa `model-recommend.ts` (un ganador). El scout sumaría GB/tok-s por opción y delta — complementa, no sustituye. |
| Ajustes Astraura/OmniVoice (drawer) | `astraura-omnivoice-config.tsx` vía `astraura-config-drawer.tsx` | Sección "Modelos recomendados para este dispositivo" con `scoutModels(caps, {usedModelIds})`. |
| Notificaciones por dispositivo | `model-download-notifier.tsx` (patrón: evento → `toast` de `sonner`) | Notificador análogo para "Aurora encontró algo mejor para este equipo". |
| Biblioteca (Cydia-like) | `src/lib/library/packages.ts` + navegador | Fichas de modelos instalables con veredicto de encaje para la neurona actual, igual que Hugging Bay muestra `fitScore` (`astraura-inteligencia.md` §14). |

## 10. El actualizador multi-proveedor de catálogos (patrón `openrouter-live-catalog.ts`)

`src/ai/astraura/openrouter-live-catalog.ts` (Adenda 67) resuelve un problema hermano:
catálogo VIVO combinando una fuente ESTÁTICA curada con datos reales de una API pública,
caché+`fetchedAt`, refresco periódico, enganche a `starseed:library`, fallback silencioso al
estático si falla la red.

Es el camino natural para que el scout deje de depender solo del proxy `approxSizeGb` (§12):

1. Una fuente viva (Hugging Bay `huggingbay.ts`, o el registro de OpenRouter/Ollama)
   expondría `paramsB` real y cuantizaciones disponibles por modelo.
2. Un módulo `model-catalog-live.ts` (esqueleto de `openrouter-live-catalog.ts`) cachearía
   esos metadatos con la misma disciplina de caducidad/fallback.
3. `model-scout.ts` llamaría `estimateMemoryGb`/`bestQuantForBudget` con datos REALES en vez
   del proxy, para cualquier modelo del catálogo vivo — no solo los ~20 curados.

No construido en esta ola (no hay fuente viva con `paramsB` real conectada) — se documenta
como el próximo paso natural.

## 11. Ejemplo de uso

```ts
import { detectCapabilities } from "@/lib/neurons/neurons";
import { scoutModels, hasNewScoutFindings, scoutSignature, markScoutSeen } from "@/ai/astraura/model-scout";

const caps = await detectCapabilities();
const result = scoutModels(caps, { kind: "llm", usedModelIds: ["ollama-small"], limit: 5 });

console.log(result.summary);
// "Tu equipo (gama alta) puede con «Ollama · 13–14B»; ahora usas «Ollama · 3B (Llama/Phi/Qwen)»
//  — «Ollama · 13–14B» rinde mejor (mejor ajuste (perfecto vs bueno))."

const sig = scoutSignature(caps, result.best.length + result.current.length);
if (hasNewScoutFindings(sig)) {
  // mostrar aviso …
  markScoutSeen(sig);
}
```

## 12. Límites honestos y aproximaciones deliberadas

- **`approxSizeGb` como proxy de `paramsB`**: `ModelSpec` no lleva recuento real de
  parámetros, solo un tamaño de descarga orientativo, usado tal cual. Con datos reales
  (Hugging Bay, GGUF concreto), llamar a `estimateMemoryGb`/`bestQuantForBudget`
  DIRECTAMENTE, saltando el proxy.
- **Sin arquitectura real** (`nLayers`/`headDim`): el catálogo curado no la declara, así que
  `kvCacheGb` usa siempre el fallback aproximado (§4.3) — la fórmula exacta ya está lista para
  cuando haya una ficha completa.
- **VRAM por heurística de nombre de GPU**: `GPU_VRAM_GB` (en `model-scout.ts`, no viene de
  llmfit) es aproximada; renderers genéricos ("Apple GPU" en Safari/iOS por protección de
  huella digital, GPUs no listadas) no producen estimación y el presupuesto cae a RAM.
- **`estTps` es una ESTIMACIÓN de roofline**, no un benchmark medido: asume que el cuello de
  botella es el ancho de banda de memoria; no modela contención térmica ni arquitecturas de
  atención específicas.
- **MoE sin catálogo real todavía**: `moeActiveVramGb`/`moeOffloadRamGb` están listas pero
  ningún `ModelSpec` actual es MoE.

## 13. Verificación

No hay script de test todavía (a diferencia de `scripts/test-model-recommend.ts` o
`scripts/test-startup-updates.ts`). Pendiente natural antes de cablear la UI: cubrir
`quantBpp`/`scoreFit` (las cuatro combinaciones de veredicto), `bestQuantForBudget` (caso
"nada cabe ni recortando contexto"), `gpuBandwidthGbps` (coincidencia más larga: "RTX 3060
Ti" no debe caer en "RTX 3060"), y `scoutModels` end-to-end con `caps` fijos de gama
alta/media/baja (determinista, sin `detectCapabilities()` real).

## 14. Pendiente / próximos pasos

1. **Cablear la firma de novedades** (§8) en `startup-updates.ts`/`startup-updates-modal.tsx`.
2. **Sumar cifras a `NeuronModelsPanel`** (§9): GB/tok-s junto al badge cualitativo actual.
3. **Notificador dedicado** (§9), espejo de `model-download-notifier.tsx`.
4. **Catálogo vivo con parámetros reales** (§10): Hugging Bay/OpenRouter/Ollama.
5. **Script de verificación** (§13).
6. **`usedModelIds` real**: hoy responsabilidad del llamador (p. ej. desde
   `installed-models.ts::listInstalledModels()` + `model-preferences.ts`/`voice-config.ts`) —
   documentar o dar un helper que lo derive por neurona.

---

*Fuente de fórmulas/constantes de `model-fit.ts`: [llmfit](https://github.com/AlexsJones/llmfit)
(Alex Jones, MIT). Puertos a TypeScript con el mismo criterio defensivo ("nunca lanza") del
resto de StarSeed OS — detalle símbolo a símbolo en la cabecera del propio archivo.*

*Relacionado: `architecture/neuronas-capacidades-modelos.md` (109 — capa cualitativa y
`NeuronModelsPanel`), `architecture/ventana-inicio-actualizaciones.md` (111 — patrón de
firma+visto reutilizado por `scoutSignature`), `architecture/astraura-inteligencia.md` §14
(Hugging Bay — mismo espíritu de `fitScore`), `src/ai/astraura/openrouter-live-catalog.ts`
(67 — patrón de catálogo vivo citado en §10).*
