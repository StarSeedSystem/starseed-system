# 🧠 Astraura · Inteligencia gratis-primero, sentidos y neuronas

> **Ola 2026-07-04.** Cómo Aurora elige inteligencia, ve, habla, usa cada
> dispositivo como servidor y se mejora a sí misma — gratis y local primero.
> Fuente de verdad de la capa de inteligencia del OS (y su adaptación a Nexus/Café).

---

## 1. Principio rector

Aurora **siempre funciona** y **es lo más gratuita posible desde el inicio**
para cualquier usuario (Comunismo de Abundancia, §3 CLAUDE.md). No exige
configurar nada: detecta lo disponible, elige la mejor opción gratuita para
cada tarea, lo dice con transparencia, y si algo se agota pasa sola a la
siguiente alternativa local/gratuita. Todo es soberano y configurable.

---

## 2. Piezas (todas en `src/ai/astraura/`)

| Módulo | Rol |
|---|---|
| `free-catalog.ts` | Catálogo declarativo de TODAS las fuentes (instant / free-key / local / paid) con modelos, fortalezas por tarea, límites, `why` y peso (privacidad/soberanía puntúan). |
| `availability.ts` | Detecta qué tiene cada usuario/contexto: claves configuradas, Ollama/LM Studio corriendo (sonda), WebGPU, Prompt API del navegador. |
| `builtin-engines.ts` | Motores sin HTTP: Chrome AI (Gemini Nano), WebLLM (CDN), **Transformers.js** (SmolLM3-3B-ONNX, WebGPU). |
| `router.ts` | **Corazón.** Clasifica la tarea, rankea candidatos (gratis primero, servicios del usuario prioritarios), ejecuta con **failover en cadena**, registra la ruta y anuncia con transparencia. `astrauraChat()`. |
| `usage.ts` | Uso por fuente (peticiones/tokens/día), límites gratis conocidos, y **cooldown** al agotar (429/quota) para que el router la salte. |
| `autonomy.ts` | Auto-mejora: re-sondeo, **sugerencias** contextuales (gratis primero), y **señales** de preferencia (búsquedas/instalaciones) para personalizar la Biblioteca. |
| `vision.ts` | Percepción visual local con **SmolVLM2** (Transformers.js): imagen, pantalla, cámara, vídeo (multi-frame). |

Voz OSS: `src/lib/aurora/tts-oss/` (Kokoro español local, Kitten beta).
Neuronas: `src/lib/neurons/neurons.ts`. Visor universal: `src/components/aurora/universal-viewer.tsx`.

---

## 3. Flujo de una respuesta (`astrauraChat`)

1. **Modo.** `manual` → `chat()` clásico (proveedor activo). `auto` (predeterminado) → sigue.
2. **Clasifica** la tarea: chat / fast / code / reasoning / vision / long / creative / translate / summary (+ si necesita visión).
3. **Detecta** disponibilidad y **rankea** candidatos: `calidad + bonus por fortaleza + peso de fuente + (servicio del usuario ⇒ +2.5) − (freeFirst penaliza pago)`. Override por tarea = +100.
4. **Failover**: prueba hasta 5 candidatos saltando los que están en **cooldown**. El primero que responde gana.
5. **Registra** la ruta (`starseed.astraura.routes.v1`, evento `starseed:astraura-route`) con alternativas gratis y sugerencias de pago, y suma **uso**.
6. **Transparencia**: `announceLine()` hace que Aurora diga qué usó y sus alternativas (según `announce`: al cambiar / siempre / nunca).
7. Si TODO falla, error claro en es-ES (nunca silencio).

Enganche: `src/lib/aurora/engine.ts` → `runCommand` llama `astrauraChat` en vez de `chat`.

---

## 4. Catálogo gratis-primero (resumen, jul-2026)

- **Local (soberanía):** Ollama (`qwen3:8b`, `alibayram/smollm3`, `gemma3:4b`, `deepseek-r1:8b`), LM Studio.
- **Navegador OSS (sin clave, WebGPU):** **SmolLM3-3B-ONNX** (texto), **SmolVLM2 256M/500M** (visión), Sipp (GGUF beta), WebLLM, Chrome AI (Gemini Nano).
- **Free-key (clave gratuita):** Groq (rápido, voz), Cerebras (1M tok/día), OpenRouter `:free`, Gemini (1M ctx, multimodal), Mistral Experiment, NVIDIA NIM, GitHub Models.
- **Instant sin clave:** Pollinations (red de seguridad universal).
- **Paid (solo sugerencias):** Anthropic, OpenAI — nunca se activan solas.

Añadir una fuente = una entrada en `FREE_CATALOG`. El router, la UI y la Biblioteca la recogen solas.

---

## 5. Uso, costes y "nunca deja de funcionar"

`usage.ts` cuenta peticiones/tokens por fuente y día, con los límites gratis
conocidos (`FREE_DAILY_LIMITS`). Al recibir 429/quota/insufficient, el router
llama `markCooldown(sourceId, 60min)`; mientras dure, esa fuente se **salta** y
Aurora usa la siguiente mejor (local/gratuita). El panel de Ajustes →
Inteligencia muestra uso, % del límite, y cooldowns con botón "Reactivar".
Resultado: se acaben los créditos o caiga un servidor, Aurora sigue.

---

## 6. Sentidos multiagénticos

- **Visión** (`vision.ts` + `src/lib/aurora/senses/vision-sense.ts`): SmolVLM2 en
  el navegador (Apache-2.0, ~250 MB la 1ª vez). `auroraSee("screen"|"camera"|"image")`
  y `maybeHandleVisionCommand(text)` ("¿qué ves?", "describe la pantalla",
  "mira la cámara"), enganchado en `runCommand` antes del fallback. Panel:
  `settings/aurora/vision-panel.tsx` (opt-in `starseed.aurora.vision.v1`).
- **Voz** (`tts-oss/`): motor elegible en `starseed.aurora.voice.v1` — Navegador
  (siempre), **Kokoro** (`onnx-community/Kokoro-82M-v1.0-ONNX`, mejor español,
  local), Kitten (beta, inglés). `speak()` delega en OSS y cae al navegador si falla.

---

## 7. Neuronas — cada dispositivo es cerebro y servidor

`src/lib/neurons/neurons.ts` + tabla Supabase `neuron_devices` (RLS por owner,
heartbeat en `last_seen_at`). Todo dispositivo con la cuenta se registra como
**neurona**: capacidades (plataforma, WebGPU, Chrome AI, cores, memoria,
almacenamiento, batería, Ollama/LM Studio, PWA) y **permisos** (compute,
storage, sync, agent, senses, wake) — **todo activo por defecto**, ajustable en
Ajustes → Astraura → Neuronas (`neurons-panel.tsx`). Registro + latido en el
`AuroraProvider`. Sincroniza vía la cuenta soberana; las neuronas online se ven
entre sí (base para pedir archivos/contexto entre dispositivos como neuronas de
los mismos cerebros).

---

## 8. Autonomía y Biblioteca-Cydia

`autonomy.ts` late cada 30 min (arranca en `AuroraProvider`): recalcula
sugerencias (conectar una gratis potente, añadir IA local, dar visión, avisar de
cuota, opción premium) y emite `starseed:astraura-suggestions`. Aprende de
**señales** (`recordSignal`) para reordenar recomendaciones de la Biblioteca por
usuario/contexto.

La **Biblioteca** (`src/lib/library/packages.ts`, repos `starseed-core` +
`starseed-labs`) es la tienda instalable estilo Cydia: apps, widgets, páginas,
pizarras, investigaciones, proyectos, diseños/temas, animaciones, funciones,
**fuentes de IA** y **repos**. Acciones: instalar (efecto real), abrir,
**guardar enlace**, **descargar**, **replicar** (fork editable local) y
**publicar como rama**. Paquetes de esta ola: SmolLM3 (navegador/Ollama), Visión
SmolVLM2, Voz Kokoro, KittenTTS, TabFM (servicio), Sipp, AgentOS (patrones).

---

## 9. Sincronización a la cuenta (OS · Nexus · Café)

`settings-sync.ts::SYNCED_KEYS` lleva a `user_settings.prefs` (cuenta soberana):
inteligencia, defaults por función, voz, neuronas, instalados de Biblioteca,
mine/published. **Las claves API NO viajan** (`starseed.ai.providers` es local
por diseño; sensibles). Nexus y Café cargan `astraura-core.js` (núcleo vanilla
con la MISMA cadena gratis-primero + failover + transparencia) y leen esa misma
config. ⚠️ **Nexus usa su propio proyecto Supabase `nxstilnyidvkqeosofuh`** (no
el `dzkjapinnewkxzjltadv` del OS/Café): su `astraura-core.js` usa el cliente del
portal (`window.STARSEED.client()`), no un proyecto hardcodeado.

---

## 10. Repos externas integradas (jul-2026)

| Repo | Cómo se integró |
|---|---|
| HuggingFaceTB/SmolLM3 | Fuente de texto navegador (`SmolLM3-3B-ONNX`, Transformers.js) + tag Ollama `alibayram/smollm3`. |
| HuggingFaceTB/SmolVLM2 | Sentido de visión local de Aurora (256M/500M, image-text-to-text). |
| KittenML/KittenTTS + Kokoro | Motores de voz OSS (Kokoro español activo; Kitten beta). |
| google-research/tabfm | Paquete de Biblioteca "análisis tabular" (servicio Python; enlace + honesto). |
| noumena-labs/Sipp | Fuente beta GGUF en navegador (`sipp-local`) + paquete. |
| rivet-dev/agentos | Patrones de orquestación (ACP transcript, bindings, permisos deny-by-default) como referencia + paquete. |

Todo prioriza **gratis + local + código abierto**; los de pago solo se sugieren.
