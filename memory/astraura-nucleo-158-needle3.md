# Núcleo de IA de Astraura: BitNet 1.58 + Needle 3 + Jev (regla permanente · 2026-09-20)

Léelo antes de tocar Astraura, el enrutador de IA del OS o el enjambre «1.58». Repo del
núcleo: `/Users/alex/Documents/IA 1.58 bit` (backend FastAPI en :8000, proxy del OS en
`/api/ai/astraura-158/[...path]`, cliente en `src/lib/astraura/astraura-158-client.ts`).

## Tres motores, tres papeles (no son intercambiables)

| Motor | Qué es | Para qué | Coste | Medido |
|---|---|---|---|---|
| **BitNet b1.58 2B-4T** (Microsoft, ternario, `llama-server` del submódulo BitNet, :8790, 2 hilos, ctx 2048, 1 slot) | modelo **generativo** de 2B | chat, redacción, razonamiento largo, personalidades | gratis, pero ~1,2 GB de RAM y CPU | ~9 tok/s en la Mac cuando tiene RAM; hoy está **paginado a disco** (swap 10 GB de 11) y no responde |
| **Needle 3** (Cactus, 121M parámetros, CQ2 a 2,125 bits/peso, `needle3.cact` 35 MB, Apache-2.0, paquete `cactus-needle` 3.0.2) | modelo de **decisión con herramientas**: texto → llamada JSON válida por gramática + confianza calibrada; también `extract` y `embed` | qué herramienta llamar y con qué argumentos, extracción estructurada, intención del usuario, enrutado de acciones del OS | gratis; 22–127 MB de RAM por proceso | **0,12 s por decisión en la Mac, 0,2–0,3 s en la nube (2 CPU)**; prefill 1.759 tok/s, decode 637 tok/s; español bien; confianza 0,46–0,72 |
| **Jev** (TypeSafe por OpenRouter, ver `orquestacion-economica.md` §9) | decisiones tipadas **con conocimiento del mundo** y probabilidad | veredictos, moderación, clasificación de errores, lo que Needle no sabe | $0,00002 por decisión, techo 0,05 $/día | 0,56 s |

**Needle 2** (45M) sigue vivo en `backend/app/core/needle_engine.py` con su motor C99 propio
(`nd_dump`, `needle_src/`): es el que corre en el **ESP32-S3**. Needle 3 cambia de arquitectura
(Laddered SAN) y ese motor no lo entiende; no se toca hasta que exista port.

## Needle 3 en Astraura (hecho el 2026-09-20, commit 5ca0f1cf del repo IA 1.58 bit)

- `backend/app/core/needle3_engine.py`: esquemas JSON → herramientas que Needle lee; `decidir()`
  devuelve `{llamadas: [{nombre, argumentos}], confianza, razonamiento, ms, ram_pico_mb}` **sin
  ejecutar nada** (ejecuta el OS). Sesión limpia por decisión (`reset()`: el historial se colaba
  entre turnos). Sin `weights=` explícito (el paquete los trata como ajustados y la confianza sale
  None); los pesos oficiales viven en `~/.cache/cactus-needle/v3/<versión>/`.
- Rutas: `POST /api/needle/decidir` {consulta, herramientas, sistema?, max_pasos?} ·
  `GET /api/needle/status` (bloque `needle3`).
- **Renovación automática**: `scripts/renovar-needle.sh` por launchd `com.starseed.needle.renovar`
  cada 6 h: PyPI → `pip -U`; sha de `Cactus-Compute/needle3` en Hugging Face → descarga a carpeta
  de prueba → **humo** (decisión real en español con confianza) → sustituye con `.bak` → reinicia
  el backend. Si aparece `needle4`, solo AVISA: cambiar de versión mayor lo decide Alex. Estado en
  `~/.starseed/needle-estado.json`, registro en `~/.starseed/needle-renovacion.log`.
- Telemetría de Cactus apagada (`NEEDLE_TELEMETRY=0`).

## Cuántos agentes caben (medido, no supuesto)

- Needle es **CPU-bound**, no RAM-bound: ~3–8 decisiones/s por núcleo. 4 procesos × 3 turnos en
  la nube (2 CPU) = 8,4 s → ~0,7 s por turno bajo contención. Mac (8 CPU): ~10–25 decisiones/s en
  total cuando no está paginando. RAM: 22 MB por agente en reposo (mmap), 100–130 MB en pico.
  «Agentes» = decisiones por segundo, no procesos residentes: un agente Needle es un evento.
- BitNet 2B: **1 instancia por máquina**, 1 slot, ~9 tok/s. Con el enjambre de código encendido
  (3 × opencode ≈ 1,8 GB + tsc), la Mac de 8 GB **no puede** tener a BitNet en RAM: hoy tenía
  4 llama-server huérfanos en :8790 paginados a 0 MB. Quien quiera BitNet vivo 24/7 necesita un
  medio dedicado (el contenedor de nube: 7 GB, 2 CPU → ~5 tok/s; o un VPS pequeño).
- **El enjambre 1.58 real** es: Needle en cada medio (Mac, nube, y **en el navegador de cada
  usuario por WASM** — engine `wasm/` publicado por Cactus) decidiendo y extrayendo; Jev cuando
  hace falta mundo; BitNet (o un LLM gratuito por el enrutador económico) solo para generar.

## Regla de decisión híbrida (para todo el desarrollo y el OS)

Needle 3 primero (gratis, local) → si confianza < 0,6 o sin llamada → Jev → si sigue en duda → LLM.
Umbrales explícitos y visibles en el Mando; ninguna capa ejecuta por sí misma. Las tareas del
OS están en la cola 345 (NE3-1 cliente, NE3-2 decisión híbrida, NE3-3 panel «Núcleo Astraura»,
NE3-4 Needle en WASM).
