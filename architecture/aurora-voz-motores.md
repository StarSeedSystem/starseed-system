# 🗣️ SOP — La VOZ de Aurora: registro de motores, fusión y selección automática

> **Adenda 67 · P2** (2026-07-13). Fuente de verdad del sistema de voz.
> Amplía §10 de `centro-creacion-sync-permisos.md` (que cubría Bark · GPT-SoVITS · OmniVoice).
> Código: `src/lib/aurora/tts-oss/*`.

---

## 0. La regla de oro (no negociable)

**Aurora SIEMPRE habla.** Ningún motor es obligatorio; todos son mejoras. El suelo
garantizado es la voz del navegador (Web Speech API) con la mejor voz neural del
dispositivo elegida sola (`browser-voices.ts`): no depende de red, ni de servidores,
ni de descargas, así que **no se puede romper**. Todo lo demás se intenta *antes* y,
si falla, se cae al siguiente eslabón **en silencio**.

Corolario de diseño: **ninguna función de esta capa lanza excepciones**. Cada eslabón
va envuelto en `Promise.resolve().then(...).catch(...)`. Un motor roto degrada la
calidad de la voz, nunca la existencia de la voz.

---

## 1. Los motores (registro vivo)

`src/lib/aurora/tts-oss/engine-registry.ts` es el **registro**: sabe qué motores
existen, qué sabe hacer cada uno y cuál está disponible ahora mismo.

| Motor | Realismo | Cómo corre | Idiomas | Emoción | Clonación | Licencia |
|---|:--:|---|---|:--:|:--:|---|
| **VoxCPM** ⭐ | 5 | endpoint (GPU) | 30 | ✅ (lenguaje natural) | ✅ | Apache-2.0 |
| **Voicebox** | 4 | endpoint (app de escritorio) | 23 | ✅ (`instruct`) | ✅ | MIT |
| GPT-SoVITS | 4 | endpoint | es/en/zh/ja/ko | — | ✅ (few-shot) | MIT |
| Bark | 3 | endpoint | multi | ✅ (`[laughs]`) | — | MIT |
| OmniVoice | 3 | endpoint | multi | — | — | Apache-2.0 |
| Kokoro | 3 | **en el navegador** (~80 MB) | es/en | parcial | — | Apache-2.0 |
| Navegador | 2-4 | Web Speech API | del sistema | ✅ (rate/pitch) | — | del sistema |
| Kitten | 2 | local (beta) | en | — | — | Apache-2.0 |

⭐ **VoxCPM es el motor PRINCIPAL** en cuanto tiene endpoint: es el más realista y
el más expresivo de todos. `realism` es una valoración **editorial** honesta (basada
en arquitectura y benchmarks públicos), no una métrica medida por nosotros.

---

## 2. Selección automática (la "fusión inteligente")

`buildVoiceChain(cfg, pin)` construye la cadena. Orden de decisión:

1. **Pin de la personalidad activa** — `intelligence.motorVoz` (o
   `intelligence.porSentido.voz.fuente` si nombra un motor de voz), solo en
   `modo: "fija"`. Va **primero pero NO es exclusivo**: si ese motor falla, la
   cadena sigue → *un pin obsoleto nunca deja a Aurora sin voz* (mismo principio
   que el pin de inteligencia del router de Astraura, §22 de `astraura-inteligencia.md`).
2. **Elección explícita** del usuario (`config.engine`, si no es el navegador).
3. **AUTO** (`config.auto`, **ON por defecto**) — el mejor motor **configurado**
   por realismo: `VoxCPM → Voicebox → GPT-SoVITS → Bark → OmniVoice`.
   **Un endpoint basta**: el usuario no tiene que "cambiar de motor" a mano.
4. **Kokoro** — red de seguridad local, solo si su modelo ya está descargado o el
   usuario autorizó la descarga (nunca descarga por sorpresa).
5. **Navegador** — suelo garantizado (la cadena devuelve `false` y `engine.ts` usa
   `speechSynthesis`).

**Coste para quien no tiene servidores: CERO.** Un motor sin endpoint no entra en la
cadena (solo se leen unas claves de `localStorage`). Si la cadena queda vacía,
`speakWithConfiguredEngine()` sale al instante sin cargar ni un módulo: ni un `fetch`,
ni una espera. Esa era la trampa a evitar al encender la selección automática.

---

## 3. Contrato HTTP de VoxCPM

VoxCPM (OpenBMB, Apache-2.0) **no tiene un único servidor oficial**: se sirve de tres
formas. El cliente (`neural-tts.ts`) las cubre **todas** probando rutas en orden y
mandando los alias de las tres en el mismo JSON (cada servidor lee los suyos e ignora
el resto). Presupuesto total: **45 s** (es un modelo de 2B con difusión).

| Forma de servirlo | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| **vLLM-Omni** (oficial, producción) | `POST /v1/audio/speech` | `{model, input, voice, response_format:"wav", speed}` (OpenAI-compatible) | audio binario |
| **Nano-vLLM** (`deployment/`) | `POST /generate` | `{target_text, prompt_wav_base64, prompt_text, ref_audio_wav_base64}` | **MP3** en streaming (`audio/mpeg`) |
| Comunitarios / **Gradio** (`app.py --port 8808`) | `/tts` · `/api/tts` · `/gradio_api/call/generate` · `/run/predict` | ver abajo | binario, JSON o FileData |

### 3.1 Gradio de VoxCPM — **VERIFICADO EN VIVO** (2026-07-13)

Contra el Space oficial `openbmb-voxcpm-demo.hf.space`, con `curl`:

- `GET /gradio_api/info` → **200**. Función nombrada **`/generate`** (junto a dos
  internas `_on_toggle_instant` / `_run_asr_if_needed`). Sus **8 parámetros
  posicionales**, en este orden exacto:

  | # | parámetro | tipo | por defecto |
  |---|---|---|---|
  | 0 | `text_input` | string | — |
  | 1 | **`control_instruction`** | string | `""` |
  | 2 | `reference_wav_path_input` | Audio | `null` |
  | 3 | `use_prompt_text` | bool | `false` |
  | 4 | `prompt_text_input` | string | `""` |
  | 5 | `cfg_value_input` | number | `2.0` |
  | 6 | `do_normalize` | bool | `false` |
  | 7 | `denoise` | bool | `false` |

  Devuelve un componente **Audio** → `FileData {path, url, mime_type, …}`.
- `POST /gradio_api/call/generate` con `{"data":[…8 args…]}` → **200** +
  `{"event_id":"358bf4ef…"}`. ✅
- `GET /gradio_api/call/generate/{event_id}` → **200**, stream SSE. Emite
  `event: heartbeat` + `data: null` mientras la cola trabaja. ✅ (Nuestro parser
  ignora esas líneas y se queda con el último `data:` parseable — comprobado.)
- ❌ **No capturado:** el `data: [FileData]` final. La cola pública del Space
  (ZeroGPU, arranque en frío) tarda más que el límite de 45 s de la herramienta.
  El protocolo está verificado; el payload final se parsea con `gradioFileToBlob()`
  siguiendo el esquema `FileData` que **sí** declara `/gradio_api/info`.

**Detalle importante que descubrió esa verificación:** en el Gradio, el diseño de voz
**NO va entre paréntesis dentro del texto** — tiene su **campo propio**
(`control_instruction`, el equivalente al `--control` de su CLI). Los paréntesis son el
contrato de la **API Python**. El cliente manda cada cosa por su vía: texto limpio +
`control_instruction` al Gradio; texto con `(descripción)` a las APIs REST.
Con Gradio, además, la clonación queda fuera (subir audio exigiría el flujo
`/gradio_api/upload`): ahí VoxCPM funciona en modo **diseño de voz**, que es su
superpoder. Para clonar → vLLM-Omni o Nano-vLLM.

**Lo que hace único a VoxCPM — y cómo lo usamos:**

- **Diseño de voz con palabras.** VoxCPM **no tiene campo "emoción"**. La voz se
  describe en lenguaje natural **entre paréntesis al inicio del propio texto**:
  `"(Voz femenina joven, cálida y serena)Hola, soy Aurora."`
  Lo hace `decorateTextForVoxCPM()` a partir del **preset activo** (`voiceDesign`) o,
  si no hay, de la emoción/velocidad/energía vivas traducidas a prosa
  (`voiceDesignPrompt()` en `voice-style.ts`). Es decir: **el mismo preset que modula
  el navegador con números modula VoxCPM con palabras.** Esa es la fusión real.
- **Clonación:** `refAudio` → `reference_wav_path` (referencia aislada) y
  `prompt_wav_path` + `refText` → `prompt_text` (clonación "definitiva", por
  continuación de audio).

**Qué está verificado y qué no (honestidad):**

- ✅ **Gradio** — verificado en vivo con `curl` (§3.1): función, parámetros y protocolo.
- 📄 **vLLM-Omni** (`/v1/audio/speech`) — tomado del `curl` del **README oficial** de
  VoxCPM. No probado contra un servidor propio (hace falta GPU).
- 📄 **Nano-vLLM** (`/generate` → MP3) — tomado de su `deployment/README.md`.
- Por eso el cliente es **tolerante** (5 rutas + 3 formas de respuesta + Gradio) en vez
  de asumir una sola: si un servidor concreto difiere, se prueba la siguiente ruta y,
  si ninguna cuela, **la cadena de respaldo mantiene la voz**.

---

## 4. Contrato HTTP de Voicebox — y la parte incómoda

**Qué es realmente:** `jamiepine/voicebox` (MIT, 30k ★) **no es un servidor de TTS**:
es una **app de escritorio** (Tauri + Rust) con un backend FastAPI local. Es un
"estudio de voz" tipo ElevenLabs/WisprFlow: clona voces, dicta, tiene 7 motores TTS
dentro (Qwen3-TTS, Chatterbox, LuxTTS, Kokoro, TADA…) y un servidor MCP.

**Pero SÍ es integrable**, porque expone una API REST real en `127.0.0.1:17493`.
Lo que hubo que averiguar leyendo su backend (`backend/routes/*.py`):

- `POST /generate` y `POST /speak` **NO sirven**: son **asíncronos** (devuelven una
  fila `Generation` con `status:"generating"` y hay que sondear un SSE), y `/speak`
  además suena **en los altavoces del PC**, no en el navegador.
- ✅ **`POST /generate/stream`** es la ruta buena: devuelve **`audio/wav` en streaming**.
  Cuerpo: `{profile_id, text, language, engine, model_size, instruct, seed, normalize,
  max_chunk_chars, crossfade_ms}`.

**Dos requisitos DUROS que no se pueden fingir** (y que el motor declara en su ficha):

1. **`profile_id` obligatorio** — un perfil de voz creado en la app. Sin él, su API
   responde `404`. Por eso `neuralEngineConfigured("voicebox")` devuelve `false` si no
   hay perfil: declarar "configurado" un motor que va a dar 404 sería mentir.
   `listVoiceboxProfiles()` lee `GET /profiles` para que el usuario elija de una lista.
2. **CORS** — su allowlist por defecto solo trae `localhost:5173`, `127.0.0.1:17493` y
   los orígenes de Tauri. Para que el OS pueda llamarla desde el navegador hay que
   arrancarla con `VOICEBOX_CORS_ORIGINS=https://starseed-os.vercel.app`.

**Validación estricta:** su Pydantic valida `language` y `engine` con **regex**
(`^(zh|en|ja|ko|de|fr|ru|pt|es|it|he|ar|da|el|fi|hi|ms|nl|no|pl|sv|sw|tr)$` y
`^(qwen|qwen_custom_voice|luxtts|chatterbox|chatterbox_turbo|tada|kokoro)$`). Mandarle
`"es-ES"` = **422**. Por eso su cuerpo se construye aparte (`voiceboxLang()`), sin los
alias genéricos del resto de motores.

**Emoción:** Voicebox no toma números de pitch/velocidad — toma `instruct`, una
instrucción en lenguaje natural ("habla despacio, con calidez"). La genera
`deliveryInstruction()` desde el preset/emoción activos. Misma idea que VoxCPM.

---

## 5. Tipos de voz prediseñados

`VOICE_PRESETS` (`voice-config.ts`) — 12 presets: **Aurora orgánica** (defecto),
cálida y cercana, serena y clara, vivaz, seria y profesional, narradora, empática,
misteriosa, juguetona, alegre, grave y cálida, neutra.

Cada preset lleva tres capas para que **suene coherente en cualquier motor**:

- `style` → números (velocidad · tono · energía · emoción) → navegador, Kokoro, SoVITS…
- `voiceDesign` → descripción de la voz en español → **VoxCPM** (Voice Design).
- `instruct` → instrucción de entrega → **Voicebox** (y guía de estilo en VoxCPM).

Todo sigue siendo **ajustable** después (sliders, `ajustar_voz`, personalidades).
`applyVoicePreset()` recuerda cuál está activo (`config.presetId`) **sin pisar** lo que
el usuario haya escrito a mano en la config de un motor: lo explícito siempre gana.

---

## 6. API pública (la consume el Centro de Configuración)

Todo desde `@/lib/aurora/tts-oss`:

```ts
listVoiceEngines(cfg?)            // VoiceEngineStatus[] — SÍNCRONA, sin red. Segura en render.
                                  //   .meta (ficha) · .availability · .selected · .active · .recommended
listVoiceEnginesWithStatus(cfg?)  // Promise<VoiceEngineStatus[]> — hace ping real (caché 60 s).
listVoicePresets()                // AuroraVoicePreset[] — los 12 tipos de voz.
listEngineVoices(engineId)        // Promise<EngineVoiceOption[]> — voces REALES de un motor:
                                  //   kokoro → catálogo · bark → speakers · voicebox → GET /profiles
                                  //   voxcpm → diseños de voz · browser → voces del sistema rankeadas
testVoice(engineId, phrase?)      // Promise<VoiceTestResult> — prueba HONESTA (ver abajo).
resolveActiveVoiceEngine(cfg?)    // qué motor hablaría AHORA (para pintar "Hablando con: VoxCPM").
VOICE_ENGINE_REGISTRY             // fichas completas · PRIMARY_VOICE_ENGINE · AUTO_ENDPOINT_ORDER
// Escritura (ya existían):
setVoiceEngine(id) · setEngineSettings(id, patch) · applyVoicePreset(id) · setVoiceStyle(patch)
```

**`testVoice()` NO usa la cadena de fallback, a propósito.** Si pides probar VoxCPM y
VoxCPM no responde, te dice *que VoxCPM no responde* — no te engaña hablando con la voz
del navegador y dejándote creer que funcionó. El fallback existe para que Aurora nunca
calle en su uso normal; una **prueba** existe para diagnosticar, y ahí manda la verdad.

---

## 7. Persistencia

Todo vive **dentro de la misma clave** `starseed.aurora.voice.v1` (ya en `SYNCED_KEYS`,
viaja con la cuenta soberana): motor, voz, `auto`, `presetId`, `style` y `engines[id]`
(endpoint, voz, `voiceDesign`, `profileId`, `model`, `instruct`, `refAudio`, `refText`).
**Cero claves nuevas.** Config antigua sin `auto` → se lee como `auto: true` (solo un
`false` explícito lo apaga): las cuentas existentes reciben la mejora sin migración.

---

## 8. Pendientes honestos

- **VoxCPM**: la vía **Gradio** está verificada en vivo (§3.1). Las vías **vLLM-Omni** y
  **Nano-vLLM** están implementadas siguiendo sus READMEs oficiales, pero **no probadas
  contra un servidor propio** (no hay GPU en este entorno).
- **Voicebox**: el contrato sale de **leer su código fuente**
  (`backend/routes/generations.py`, `speak.py`, `models.py`, `app.py`) — de ahí salen los
  tres hallazgos duros: `/generate/stream` es la única ruta útil, `profile_id` es
  obligatorio y el CORS por defecto excluye al navegador. **No probado con la app
  instalada** (no está en esta máquina).
- Ninguno de los dos cambia nada para el usuario **hasta que pegue un endpoint**: sin
  servidor, la cadena ni siquiera los mira y Aurora habla exactamente igual que antes.
- El **panel de voz** (`src/components/settings/aurora/voice-oss-panel.tsx`) sigue sin
  montarse en ninguna página (pendiente **P-3**). La API de §6 está lista para que el
  **Centro de Configuración** (Adenda 67 · P1) la consuma.
