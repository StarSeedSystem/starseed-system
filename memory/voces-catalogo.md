# Catálogo de Voces del Sistema StarSeed OS

> Documentación técnica del sistema de voz. Fuente de verdad para cualquier agente que necesite entender, modificar o extender la capa de síntesis de voz del OS. Última actualización: 2026-09-05 (Ola 243, R8 · Estudio de Voces Ola 240 + Ola 232 M5 + daemon Astraura 4444).

---

## 0. Reglas del área (cláusulas pétreas)

Antes de leer el mapa, las cuatro invariantes que rigen toda la capa:

1. **Motor único «Voz StarSeed»** desde la Ola 228: un solo punto de entrada (`hablarStarSeed()` en `src/lib/aurora/voz-starseed/motor.ts`). El **timbre** (identidad de voz) NO cambia al cambiar de nivel; el **nivel** (estudio / alta / ligera / mínima) decide solo QUÉ backend sintetiza, con más o menos precisión según el hardware. Si un nivel falla, se baja al siguiente CON EL MISMO TIMBRE y se avisa por `alDegradar`. Nunca se lanza una excepción a la interfaz.
2. **El rito guarda su estado en `onboarding_state`** (`skipped` + `skipped_at`). «Saltar por ahora» no es completar: se guarda como pospuesto para que el rito no se reabra en bucle pero pueda relanzarse a mano. La columna real en BD es `skipped_at` (snake_case); el estado la expone como `skippedAt` (`src/lib/onboarding/onboarding.ts:113-124`).
3. **Gratis primero, relevo automático ante 429/402** y ningún proveedor debe agotarse. La regla de oro: «Aurora SIEMPRE habla» — la cadena de fallback termina en la voz del navegador, que nunca falla. Ninguna función de esta capa lanza excepciones; cada eslabón va envuelto en `Promise.resolve().then(...).catch(...)` (`architecture/aurora-voz-motores.md §0`).
4. **Contenido = entidad única**: al compartir se referencia, no se duplica. En concreto, los 12 timbres viven una sola vez en `src/lib/aurora/timbres.ts:74-92`; las ediciones del usuario viven en `localStorage` (`starseed.voces.v1`) por encima; el Estudio de Voces (Ola 240) añade una capa de **versiones** y **vínculos** sin tocar la base.

---

## 1. Mapa del sistema de voz (quién decide el motor, en qué orden)

Hay dos decisiones ortogonales:

- **A) La IDENTIDAD** (el timbre): quién soy cuando hablo. Decide la receta (voz neuronal + velocidad + `instruct` + `expr.arco/vivacidad/calidez`). Es el **mismo** en todos los niveles y en todas las superficies. Lo decide `timbres.ts` + `voces-catalogo.ts` (ediciones) y, en modo autónomo, el **agente de entonación** (`agente-entonacion.ts`).
- **B) La VÍA** (el nivel + el motor concreto): con qué pieza técnica lo sintetizo. Lo decide el **registro de motores** (`engine-registry.ts`) y la **cadena de fallback** (`buildVoiceChain` + `speakWithConfiguredEngine`).

Ambas convergen en el **motor único** `hablarStarSeed()`: el timbre viaja como parámetro, el nivel se resuelve una sola vez, y la degradación es grácil.

### 1.1 El motor único (entrada única del OS)

```
                  ┌──────────────────────────────┐
                  │ voz-rito.ts / motor-voz.ts   │  ← ventanas del OS (rito, chat, guía, narración, sistemas)
                  │      ┌──────────────────┐    │
                  │      │ hablarStarSeed() │    │  ← Ola 228 · src/lib/aurora/voz-starseed/motor.ts:196
                  │      └────────┬─────────┘    │
                  │               │              │
                  │   ┌───────────┴────────────┐ │
                  │   │ resolverNivel()         │ │  ← hardware caps + preferencia del usuario
                  │   └───────────┬────────────┘ │
                  │               │              │
                  │   ┌───────────┴────────────┐ │
                  │   │ sintetizar(nivel,…)     │ │  ← cadena de degradación (mismo timbre)
                  │   └───────────┬────────────┘ │
                  │               │              │
                  │  ┌────┬───────┴────┬────────┐│
                  │  ▼    ▼            ▼        ▼│
                  │ estud. alta      ligera   mínima│
                  │  ↓     ↓           ↓        ↓ │
                  │ OmniVoice (daemon 127.0.0.1:4500 o 4444) │
                  │  ↓     ↓           ↓        ↓ │
                  │ Kokoro (navegador WASM)  │ web speechSynthesis │
                  └──────────────────────────────┘
```

- `voz-rito.ts:242` (`hablarRito`) — el rito y todas las ventanas lo invocan. Pasa el `timbreEfectivo(texto, "rito")` y delega.
- `motor-voz.ts:31-46` reexporta el motor único para los importadores antiguos (`hablarStarSeed`, `nivelActual`, `nivelPreferido`, `fijarNivel`…).
- `streaming-voice.ts` trocea el texto del LLM token a token y emite cláusulas en cuanto se cierran (fin de frase, o coma con ≥6 palabras, o tope de 14) — una capa POR ENCIMA del motor único que no decide el motor, solo cuándo hablar.

### 1.2 Quién decide el motor en cada contexto

| Contexto | Quién decide el motor | Quién decide el timbre | Archivo principal |
|---|---|---|---|
| **Rito** (bienvenida + asistente de perfil) | `hablarStarSeed()` (motor único → nivel) | `timbreEfectivo(texto, "rito")` (modo actual o autónomo) | `src/lib/aurora/voz-rito.ts:120-162, 242-282` |
| **Chat / conversación** (LLM streaming) | `speakWithConfiguredEngine()` (cadena OSS) | `voice-identity.ts` congela el timbre al empezar el mensaje | `src/lib/aurora/tts-oss/speak-router.ts:497` + `src/lib/aurora/streaming-voice.ts` |
| **Aviso** (toast, notificación) | Mismo motor único → cae a `minima` | `timbreActual(genero)` | `src/lib/aurora/voz-starseed/motor.ts:113` |
| **Lectura** (ventana de sistemas que narra lo que ves) | Mismo motor único (nivel `minima` si no hay daemon) | Mismo timbre del rito | `src/lib/aurora/narracion-ventana.ts:52-68` (usa `auroraBridge` → `hablarStarSeed` indirectamente) |
| **Imaginación Intuitiva** (página `/imaginacion`) | Motor único (nivel `estudio`/`alta` si está) | El de la personalidad activa (Adenda 158) | Sección propia del Studio 1.58 |
| **Por personalidad** (cuando una personalidad tiene motor propio) | `engine-registry.ts::buildVoiceChain` (pin de personalidad) | `voiceStyle.engine` + timbre de `timbres.ts` | `src/lib/aurora/tts-oss/engine-registry.ts:739` |

#### 1.2.1 Orden de decisión en `buildVoiceChain` (Adenda 67 · P2-3)

`buildVoiceChain(cfg, pinOverride)` (`src/lib/aurora/tts-oss/engine-registry.ts:739-853`) construye la cadena ordenada. Resumido:

1. **Pin de la personalidad activa** — `intelligence.motorVoz` o `intelligence.porSentido.voz.fuente` en `modo: "fija"`, o el `voiceStyle.engine` preferido, o el override por neurona×personalidad (`starseed.astraura.neuron-persona.v1`, Adenda 149). Primero, pero **NO exclusivo**: si el motor fijado no responde, la cadena sigue.
2. **Elección explícita** del usuario (`config.engine`), si no es el navegador. Si además `config.symbiotic: true` y eligió `bark`/`gpt-sovits`, entra el modo simbiótico (`gpt-sovits → bark`).
3. **AUTO** (por defecto ON) — el mejor motor **configurado** por realismo, en este orden: `voice158 → vibevoice → voxcpm → voicebox → gpt-sovits → bark → omnivoice → openvoice2` (`AUTO_ENDPOINT_ORDER`, `engine-registry.ts:400-416`). Si la memoria de salud de OpenVoice está «lista» o «nueva» en las últimas 24 h, OpenVoice **asciende** justo delante de OmniVoice (Adenda 79). El sesgo por clase de acceso (`local`/`starseed`/…) reordena sin cambiar el failover.
4. **Kokoro** — red de seguridad local; solo entra si la cadena ya trae algo (quien eligió el navegador + sin servidores no paga ni un import de Kokoro).
5. **Navegador** — no va en la cadena: es el suelo garantizado del llamador. `speakWithConfiguredEngine` devuelve `false` y el engine de Aurora usa `speechSynthesis` con la mejor voz neural rankeada del dispositivo (`browser-voices.ts`).

#### 1.2.2 Orden de decisión del **nivel** (`resolverNivel`)

`resolverNivel(explicito?)` (`src/lib/aurora/voz-starseed/motor.ts:73-79`) combina tres fuentes en orden:

1. Nivel explícito pasado por el llamador (`opciones.nivel`).
2. Preferencia del usuario guardada en `localStorage` bajo la clave `starseed.voz.nivel` (`"auto" | "estudio" | "alta" | "ligera" | "minima"`).
3. Mejor nivel que el hardware puede sostener ahora mismo, calculado por `nivelPara(capacidades)` (`src/lib/aurora/voz-starseed/niveles.ts:78-83`):
   - Demonio local + ≥8 GB RAM → `estudio`
   - Demonio local (sin requisito de RAM) → `alta`
   - Escritorio con WebGPU o WASM SIMD → `ligera`
   - Cualquier otro caso → `minima`

El sondeo del daemon se cachea 5 minutos (`capacidades.ts:43-89`) y tiene marca «ausente 3 min» para no martillear (`motor-local.ts:78-103`).

### 1.3 Capas que NO son un motor

- **`voice-identity.ts`** (`src/lib/aurora/tts-oss/voice-identity.ts`) — congela POR MENSAJE todo lo que define el timbre (motor, ajustes, estilo, playbackMod, ánimo, personalidad, semilla, referencia, `fingerprint`). Contrato de la **Invariante #1**: misma voz dentro del mismo mensaje. También guarda la **caché LRU de síntesis** (16 entradas, `synthCacheKey = fingerprint + hash(texto)`) para que el primer trozo no se sintetice 2-3 veces.
- **`voice-style.ts`** — estilo emocional: traduce el mismo estado («dulce», «entusiasta»…) a parámetros DISTINTOS según el motor (navegador/Kokoro → rate/pitch/volume; Bark → `[laughs]/[sighs]`; VoxCPM/Voicebox → `instruct` en lenguaje natural). Las 8 emociones viven en `VOICE_EMOTIONS` (`src/lib/aurora/tts-oss/voice-style.ts:68-77`).
- **`omnivoice-mixer.ts`** — **salida de audio única** del sistema de voz: crossfade equal-power 160 ms entre locuciones, cola PCM16 continua (streaming xAI), ganancia por neurona/personalidad. Si WebAudio no está, `mixerPlayBlob` devuelve `false` y el llamador usa su camino clásico (`HTMLAudio`). `MIXER_DEFAULT_CROSSFADE_MS = 160` (`omnivoice-mixer.ts:49`).
- **`speak-router.ts`** — punto único al que el engine de Aurora (`engine.ts`) delega el habla. Construye la cadena, aplica el orden de prioridad por el usuario (`applyVoiceChainPriority`), autodetecta idioma hablado (`detectSpokenLang`) y emite `starseed:voice-processing` para el `VoiceProcessingIndicator` del chat.

### 1.4 Cómo influye un cambio de voz en cada ventana

- **Rito** (`voz-rito.ts`): al cambiar el timbre en `/voces`, la siguiente frase del rito ya sale con la nueva voz (mismo `Timbre` que lee `timbreActual`/`timbreEfectivo`). El modo autónomo recalcula el timbre por el agente de entonación en cada turno.
- **Chat** (`streaming-voice.ts` + `speak-router.ts`): el timbre activo se congela al empezar el mensaje (`setVoiceIdentity`); cambiarlo en `/voces` no rompe el mensaje en curso (la identidad congelada manda hasta `clearVoiceIdentity`).
- **Guía del Escritorio** (`narracion-ventana.ts`): al cambiar de pestaña o cerrar la ventana, `useNarracionVentana` corta la locución anterior (`cortarVoz()`); la nueva pestaña narra con el timbre activo. La marca de sesión `starseed.voz.rito` (en `sessionStorage`, no `localStorage`) decide si la guía narra o no.
- **Sistemas / ventanas de configuración** (Ajustes → Voz, `/voces`, panel de voz de la neurona): usan el motor único → mismo timbre. Cuando previsualizan un motor concreto (p. ej. «probar Kokoro»), llaman directamente a `kokoroSpeak`/`xaiSpeakOnce`/etc.; no afectan al timbre global.

---

## 2. Tabla de motores (el «cómo» del habla)

| # | Motor / Nivel | id interno | Local o nube | Modelo / tamaño | Latencia típica | Calidad | Cómo lo llama el OS | Requisitos | Límites | Cómo instalarlo / activarlo |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Estudio** (motor único) | `estudio` | Local | OmniVoice GGUF Q8_0 sobre llama.cpp (~1000 MB) | Baja (local); frases **anticipadas** suenan al instante | Máxima, grado de estudio | `hablarStarSeed → hablarPorLocal → motor-local.ts:140` | Demonio local vivo + ≥8 GB RAM | Apple Silicon usa Metal; resto CPU. Si el demonio no está, cae a `alta` (mismo daemon) → `ligera` → `minima` | `apt install omnivoice` o script del **Instalador Universal** del Studio 1.58; descarga `omnivoice-base-Q8_0.gguf` + `omnivoice-tokenizer-Q8_0.gguf` |
| 2 | **Alta** (motor único) | `alta` | Local | OmniVoice GGUF Q4_K_M (~600 MB) | Baja (local) | Alta, casi estudio | Mismo camino que Estudio; el daemon carga el Q4_K_M | Demonio local vivo | Idéntico recorrido, modelo más ligero | Mismo binario, modelo `omnivoice-base-Q4_K_M.gguf` |
| 3 | **Ligera** (motor único) | `ligera` | Local (navegador) | Kokoro 82M ONNX/WebAssembly cuantizado (~120 MB) | Media (primera descarga del modelo) | Buena y estable; misma en todos los equipos | `hablarStarSeed → hablarPorKokoro → tts-oss/kokoro.ts:147` | Equipo de escritorio con WebGPU o WASM SIMD | Una voz a la vez (`currentAudio` en `kokoro.ts:123`); autoDownload solo si el usuario lo autorizó | Botón «Traer voz local» en `/voces` o `kokoroPreload()` con `onProgress` |
| 4 | **Mínima** (motor único) | `minima` | Local (navegador) | `speechSynthesis` del navegador (voces del SO) | Inmediata | Variable: suena distinta en cada navegador y cada equipo | `hablarStarSeed → hablarPorSistema → motor.ts:163` | Ninguno: funciona en cualquier equipo | Suena a caricatura si el sistema tiene voces de personaje (Apple: 16 de 18 voces en español). `vozDelTimbre()` las filtra (`timbres.ts:67, 196-205`) | Siempre activo; el navegador decide |
| 5 | **VoiceMorphic (Astraura 1.58-bit)** | `astraura-158` | Local (daemon Astraura 4444) | `omnivoice.cpp` corriendo en `native/astraura-voice/daemon.mjs` con pool de tts-server en 4501+ | Baja (local) | Idéntica a Estudio (mismo modelo) | `motorPreferido() → estadoMotorLocal() → ml.estadoMotorLocal()` (`motor-voz.ts:140-152`) | Daemon Astraura vivo (4444) | `hay158()` mira `starseed.astraura.intelligence.v1`; el daemon duerme solo a los 10 min y se re-activa con `POST /warm` | Instalación del daemon Astraura (launchd `com.starseed.astraura-voice`) |
| 6 | **OpenVoice V2 (web, gratis)** | `openvoice2` | Nube (HF Space) | MyShell OpenVoiceV2 (Gradio 3.48.0, 24 kHz) | ~3-8 s (cold start hasta 120 s; cola) | Muy buena, con clonación desde semilla sintética | `speakWithConfiguredEngine → runLink('openvoice2') → omnivoice-web-router.ts → openvoice2.ts:4-7` | Ninguno (sin endpoint, sin descargas) | Estilos EXACTOS: `en_default · en_us · en_br · en_au · en_in · es_default · fr_default · jp_default · zh_default · kr_default` (`openvoice2.ts:84-95`). Referencia OBLIGATORIA: sin ref el Space responde `success=false`; el OS sube una semilla sintética cacheada | Siempre activo; la cadena lo prueba cuando la memoria de salud está «lista» o «nueva» |
| 7 | **OmniVoice k2-fsa (motor)** | `omnivoice` | Nube (HF Space) + daemon local opcional | k2-fsa/OmniVoice (Apache-2.0) sobre llama.cpp | ~1-2 s (nube) | Buena, multilingüe | `speakWithConfiguredEngine → runLink('omnivoice') → omnivoice-hybrid.ts:343-1056` | El híbrido ya está integrado (cero config): local si el daemon está vivo, si no Space | Cold start del Space en frío: hasta 120 s (presupuesto `openvoice2: 120_000`) | Activado por defecto en la cadena; modo `local_only` lo acota al daemon local |
| 8 | **VoxCPM2** | `voxcpm` | Endpoint del usuario (neurona/CasaOS) | VoxCPM (OpenBMB, Apache-2.0, 30 idiomas, 48 kHz, tokenizer-free) | ~1-3 s (GPU) | Máxima (realism 5): diseño de voz por palabras, clonación controlable | `speakWithConfiguredEngine → runLink('voxcpm') → neural-tts.ts::neuralSpeak` | Servidor VoxCPM con GPU (vLLM-Omni / Nano-vLLM / Gradio) y URL configurada en Ajustes → Voz | `voxcpm` y `voicebox` con timeout 45 s (`ENGINE_TIMEOUT_MS:140`); el diseño de voz viaja **entre paréntesis al inicio del texto** (`decorateTextForVoxCPM`, `voice-style.ts:281-292`) | Pegar endpoint en Ajustes → Voz (la cadena AUTO lo asciende a la cabeza) |
| 9 | **Voicebox** | `voicebox` | Endpoint del usuario (app local Tauri) | jamiepine/voicebox (MIT, 30k ★, 7 motores internos: Qwen3-TTS, Chatterbox, LuxTTS, Kokoro, TADA…) | ~1-4 s | Alta (realism 4): clonación por perfiles | `speakWithConfiguredEngine → runLink('voicebox') → voicebox-engine.ts::OpenVoiceHybridRouter` | App Voicebox abierta (`127.0.0.1:17493`) + `profile_id` creado + `VOICEBOX_CORS_ORIGINS=https://starseed-os.vercel.app` (allowlist por defecto solo trae localhost/Tauri) | Sin profile_id, su API responde 404 → `neuralEngineConfigured('voicebox')` devuelve `false`. Su Pydantic valida `language` con regex (2 letras: `es`, `en`…) | Instalar Voicebox, crear un perfil, exponer CORS, pegar `profile_id` en Ajustes |
| 10 | **GPT-SoVITS** | `gpt-sovits` | Endpoint del usuario | RVC-Boss/GPT-SoVITS (MIT) | ~1-3 s | Alta (realism 4): clonación few-shot con ~5 s de muestra | `speakWithConfiguredEngine → runLink('gpt-sovits') → neural-tts.ts::neuralSpeak` | Servidor GPT-SoVITS + URL + audio de referencia (`refAudio`/`refText`) | Passthrough de `speed_factor`; sin emoción nativa | Configurar endpoint + subir muestra |
| 11 | **Bark** | `bark` | Endpoint del usuario | suno-ai/Bark (MIT) | ~3-10 s (lento) | Buena (realism 3): expresiva con `[laughs]/[sighs]` | `speakWithConfiguredEngine → runLink('bark') → neural-tts.ts::neuralSpeak` | Servidor Bark + URL | `decorateTextForBark` mete etiquetas con moderación (máx. 1 por frase, >40 chars, `[laughs]` solo si hay `!`/`jaja`) | Configurar endpoint; elegir preset `v2/es_speaker_*` |
| 12 | **VibeVoice** | `vibevoice` | Endpoint del usuario (GPU) | VibeVoice-community (MIT) — 1.5B / 7B larga duración + 0.5B streaming | ~30-90 s (1.5B/7B) / tiempo real (0.5B) | Máxima (realism 5): multi-locutor hasta 4 speakers | `speakWithConfiguredEngine → runLink('vibevoice') → neural-tts.ts::neuralSpeak` | Servidor VibeVoice con GPU (VRAM) + URL. Para clonar: 30 s de audio por speaker. En/es/zh cross-lingual | Multi-locutor; un guion `Speaker N:` por turno | Pegar endpoint; mapeo de speakers por personalidad |
| 13 | **xAI Voice Agent** | `xai` | Nube (WebSocket realtime) | grok-voice (xAI, 5 voces built-in: `eve/ara/rex/sal/leo`) | ~0.5-1.5 s (tiempo real) | Máxima (realism 5) — conversacional, NO one-shot | `xaiSpeakOnce()` (`xai-voice-agent.ts:518`) desde el speak-router SOLO por pin de personalidad o elección explícita | `XAI_API_KEY` en el servidor del OS (el cliente NUNCA ve la clave); micrófono para el modo conversacional | NUNCA entra por AUTO (gratis-primero manda); declina limpio si no hay token | Por defecto usa la API de StarSeed server-side; el usuario puede pegar su propia clave en Ajustes → Voz |
| 14 | **Voz 1.58-bit (Astraura, CPU)** | `voice158` | Endpoint del usuario (backend Astraura) | Piper/Kokoro + voice pack 1.58-bit del micelio simbiótico | Tiempo real (~0.05 RTF en CPU) | Buena (realism 3): sin GPU, multi-personalidad vía el micelio | `speakWithConfiguredEngine → runLink('voice158') → neural-tts.ts::neuralSpeak` | Backend Astraura local con el puente de voz habilitado | CPU pura en cualquier dispositivo; los voice packs 1.58-bit se entrenan en segundo plano (auto-mejora) | Activar backend Astraura + puente de voz |
| 15 | **Kitten TTS** | `kitten` | Local (navegador) — **STUB** | KittenTTS (Apache-2.0, ~25 MB, inglés) | n/a | n/a | `speakWithConfiguredEngine → runLink('kitten')` | Ninguno (la función existe pero…) | `kittenAvailable()` devuelve `false`; `kittenSpeak()` resuelve `null` | **No se ofrece como opción real**; la UI lo muestra marcado «beta · inglés · próximamente» |

### 2.1 El daemon (las dos puertas)

`/api/voz/salud` y `/api/voz/hablar` del servidor del OS son el camino que usa el `motor-local.ts` y, por extensión, los niveles `estudio` y `alta` del motor único. El cliente (`daemon.ts`) tiene **dos puertas** (`src/lib/aurora/voz-starseed/daemon.ts:20-35`):

1. **Puerta A** — `tts-server` crudo en `127.0.0.1:4500` (el que la documentación oficial de OmniVoice muestra: `tts-server --model omnivoice-base-Q8_0.gguf --codec omnivoice-tokenizer-Q8_0.gguf --host 127.0.0.1 --port 4500 --lang Spanish`).
2. **Puerta B** — `daemon.mjs` de Astraura en `127.0.0.1:4444` (`GET /status`, `POST /tts`), con un pool de tts-server residentes en 4501+ que se levantan al hablar y duermen a los 10 min. Esta es la **recomendada**: antes hacían falta dos copias del modelo (~1,8 GB) en una Mac de 8 GB; ahora basta con el demonio.

Las dos puertas NUNCA aceptan una URL del exterior: solo hablan con `127.0.0.1`. Las rutas del OS no exponen rutas absolutas del disco.

### 2.2 Endpoints y rutas (cliente HTTP tolerante)

`neural-tts.ts:174-196` declara la lista de rutas candidatas por motor (probar el orden hasta que una responda):

| Motor | Rutas candidatas | Presupuesto |
|---|---|---|
| `voxcpm` | `/v1/audio/speech` · `/tts` · `/generate` · `/api/tts` · `/synthesize` | 45 s |
| `voicebox` | `/generate/stream` (la única que devuelve audio al navegador; las demás son async o suenan en el PC) | 45 s |
| `bark` | `/generate` · `/tts` · `/api/tts` | 20 s |
| `gpt-sovits` | `/tts` · `/` · `/api/tts` (envía alias v1 + v2 a la vez) | 20 s |
| `omnivoice` | `/tts` · `/generate` · `/api/tts` (k2-fsa: `{text, sid, speed}` + alias) | 20 s |
| `vibevoice` | `/api/vibevoice/synthesize` · `/api/predict` · `/tts` | 120 s |
| `openvoice2` | cola del Space (Gradio 3.x, no HTTP TTS directo) | 120 s |
| `xai` | WebSocket realtime (no HTTP TTS) | 30 s |
| `voice158` | `/api/voice/synthesize` | 30 s |

El cliente acepta audio binario directo, JSON con base64, JSON con URL del archivo, o estilo Gradio `data: [FileData, …]` (incluye el 2-pasos moderno `/gradio_api/call/{fn}` con POST → `{event_id}` → GET SSE).

---

## 3. Las 12 voces predeterminadas (timbres)

### 3.1 Tabla por personalidad / timbre

`src/lib/aurora/timbres.ts:74-92` define los 12 timbres como **receta fija** (no un ranking que se recalcula en cada pulsación). El motor neuronal es lo que manda; el respaldo del sistema solo existe para no quedarse mudo mientras el modelo local no esté instalado.

| id | Nombre | Género | Voz neuronal | Speed | `instruct` (estilo) | `expr` (arco / vivacidad / calidez) | Descripción |
|---|---|---|---|---|---|---|---|
| `fem-aurora` | Aurora | femenina | `ef_dora` | 1.00 | `female, young adult, moderate pitch` | 0.16 / 0.10 / 0.14 | Cálida, cercana y natural |
| `fem-luna` | Luna | femenina | `ef_dora` | 1.14 | `female, young adult, high pitch` | 0.22 / 0.20 / 0.10 | Luminosa y expresiva |
| `fem-vega` | Vega | femenina | `ef_dora` | 0.86 | `female, middle-aged, low pitch` | 0.10 / 0.05 / 0.06 | Profunda y envolvente |
| `fem-iris` | Iris | femenina | `ef_dora` | 1.28 | `female, teenager, very high pitch` | 0.26 / 0.28 / 0.12 | Ágil, viva y despierta |
| `masc-orion` | Orión | masculina | `em_alex` | 0.94 | `male, middle-aged, low pitch` | 0.13 / 0.08 / 0.08 | Grave y sereno |
| `masc-atlas` | Atlas | masculina | `em_santa` | 0.86 | `male, elderly, very low pitch` | 0.08 / 0.04 / 0.04 | Rotundo y solemne |
| `masc-hermes` | Hermes | masculina | `em_alex` | 1.18 | `male, young adult, moderate pitch` | 0.24 / 0.26 / 0.16 | Cercano y conversacional |
| `masc-kepler` | Kepler | masculina | `em_santa` | 1.02 | `male, middle-aged, moderate pitch` | 0.11 / 0.06 / 0.10 | Suave y reflexivo |
| `neu-zenit` | Zenit | neutra | `em_alex` | 1.06 | `young adult, moderate pitch` | 0.15 / 0.14 / 0.10 | Equilibrado y claro |
| `neu-eco` | Eco | neutra | `ef_dora` | 0.92 | `middle-aged, low pitch, whisper` | 0.10 / 0.07 / 0.07 | Sereno, sin marca |
| `neu-nova` | Nova | neutra | `em_alex` | 1.22 | `teenager, high pitch` | 0.23 / 0.24 / 0.13 | Brillante y despierto |
| `neu-solis` | Solis | neutra | `em_santa` | 1.10 | `elderly, very low pitch` | 0.12 / 0.06 / 0.09 | Amplio y calmado |

#### Notas sobre los instruct

- El daemon OmniVoice sanitiza `instruct` contra un whitelist en inglés (`VALID_INSTRUCT_TOKENS` del backend). Texto libre en español es rechazado por `sanitizeInstruct` y los timbres caen al default — todos sonaban igual (regresión Ola 222 que se arregló limitando a tokens de género/edad/tono, `timbres.ts:77`).
- `ef_dora` (fem), `em_alex` y `em_santa` (masc) son las únicas voces neuronales que Kokoro y OmniVoice comparten; garantiza coherencia entre `estudio/alta` (OmniVoice) y `ligera` (Kokoro).
- Las voces de personaje de Apple (`eddy`, `flo`, `grandma`, `grandpa`, `reed`, `rocko`, `sandy`, `shelley`, `bells`, `boing`, `bubbles`, `jester`, `organ`, `superstar`, `trinoids`, `whisper`, `wobble`, `zarvox`) **nunca** se eligen como respaldo: `vozDelTimbre()` las filtra (`timbres.ts:67, 187-205`).

### 3.2 Predeterminados por género y base autónoma

- `TIMBRE_PREDETERMINADO` (`timbres.ts:94-98`): `femenina → fem-aurora`, `masculina → masc-orion`, `neutra → neu-zenit`.
- `TIMBRE_AUTONOMO_BASE = "neu-zenit"` (`timbres.ts:105`): la voz autónoma parte de la neutra, la base más libre de marca sobre la que modular (Adenda 213).
- `TIMBRE_AUTONOMO_BASE` es el que `voz-rito.ts:120-162` usa cuando `getModoVoz() === "autonoma"` y el texto no es vacío: delega en el **agente de entonación** (`agente-entonacion.ts`) que mira texto, hora, personalidad y memoria de tono y devuelve `{ timbreId, instruct, speed, pitch }`.

### 3.3 Expresividad (Adenda 215)

Cada timbre lleva tres números en `expr` que convierten una voz plana en un personaje:

- **arco** — cuánto CAE el tono del principio al final de la frase (declinación entonativa). Sin ella suena a lista de la compra.
- **vivacidad** — cuánto varía la velocidad entre cláusulas. Alto = ágil y conversacional; bajo = pausado y solemne.
- **calidez** — cuánto se abre el tono en las cláusulas de apertura (cercanía percibida).

Estos valores los aplica `partirEnClausulas()` + el bucle de entrega expresiva en `voz-rito.ts:321-357` cuando habla por la vía del sistema. El motor neuronal (OmniVoice/Kokoro) recibe la `instruct` que aproxima este carácter.

### 3.4 Persistencia: dónde se edita y cómo se guarda

| Capa | Archivo / clave | Función |
|---|---|---|
| **Fuente de verdad en código** | `src/lib/aurora/timbres.ts` (array `TIMBRES`, líneas 74-92) | Cambios aquí afectan a todos los usuarios que no hayan personalizado. Tras commit + push → deploy en Vercel. |
| **Ediciones del usuario** (nivel superficie) | `localStorage` clave `starseed.voces.v1` → `VozEditable[]` con `{id, nombre, genero, desc, local, sistema, expr, origen, base?, archivoCodigo, notas?}` | Vista editable en `src/lib/aurora/voces-catalogo.ts` (no `src/lib/voces/*` — son módulos distintos: ver §3.5) |
| **Timbres propios** (nivel identidad soberana) | `localStorage` clave `starseed.voz.timbres-propios.v1` → `Timbre[]` (cualquier id, hasta 6 últimos) | `timbresPropios()`, `guardarTimbrePropio()`, `buscarTimbre()` (`timbres.ts:114-135`) |
| **Timbre activo del sistema** | `localStorage` clave `starseed.voz.timbre.v1` → id del timbre fijado | `fijarTimbre()`, `timbreActual(genero)` |
| **Versiones (Estudio de Voces · Ola 240)** | `localStorage` clave `starseed.voces.versiones.v1` → `VersionVoz[]` | `cargarVersiones()`, `crearVersion()`, `actualizarVersion()`, `fusionarVersiones(a, b, peso)`, `aplicarVersionATimbre()` (`src/lib/voces/versiones.ts`) |
| **Vínculos versión→timbre/rito (Ola 240)** | `localStorage` clave `starseed.voces.vinculos.v1` → `Vinculos { porTimbre, rito, configuracion }` | `cargarVinculos()`, `promoverVersion(versionId, destino)` (`src/lib/voces/vinculos.ts`) |
| **Preferencia de nivel (motor único)** | `localStorage` clave `starseed.voz.nivel` → `auto \| estudio \| alta \| ligera \| minima` | `nivelPreferido()`, `fijarNivel()` (`voz-starseed/motor.ts:35-59`) |
| **Marca de sesión del rito** | `sessionStorage` clave `starseed.voz.rito` → `"1"` | `marcarVozDelRito()`, `vozDelRitoActiva()` (`narracion-ventana.ts:29-41`) |
| **Modo de voz elegido** | (incluido en `personalities.ts` + `voz-inicial.ts`) | `getModoVoz()` |

### 3.5 Estudio de Voces (Ola 240) — Versiones + Vínculos + Lector del motor local

Desde la Ola 240, el Estudio de Voces (`/voces` → `src/app/(app)/voces/page.tsx` → `src/components/voces/estudio-voces.tsx`) es la superficie de edición avanzada. Vive en `src/lib/voces/` (no `src/lib/aurora/voces-catalogo.ts`):

- **`src/lib/voces/motores.ts`** (Ola 240 · VZ2) — módulo SOLO SERVIDOR. Lee el estado del demonio local (`/health` en 4500 o `/status` en 4444), enumera los modelos GGUF en `~/.starseed/astraura-voice/omnivoice.cpp/models/` y permite **reiniciar el demonio con otro tamaño** (Q4_K_M ↔ Q8_0) sin matar el pool del demonio Astraura. Dos caminos:
  - A) Si el demonio Astraura (4444) está vivo: reescribe `config.json` con `modelFile`/`codecFile`/`variant.quant`, para SOLO el tts-server del pool (puertos 4501-4510) y hace `POST /warm`.
  - B) Si no hay demonio: para SOLO el proceso en 4500 y lanza un tts-server crudo con el tamaño pedido.
  - Lista blanca `TAMANOS_VALIDOS = ["Q4_K_M", "Q8_0"]`; nunca expone rutas absolutas del disco.
- **`src/lib/voces/versiones.ts`** (Ola 240 · VZ1) — `VersionVoz { id, nombre, timbreBase, motor, tamano, params, notas, valoracion, padres, creadaEn, modificadaEn, promovidaA[] }`. Persistencia: `starseed.voces.versiones.v1`. Operaciones: `versionDesdeTimbre()`, `crearVersion()`, `actualizarVersion()`, `borrarVersion()`, `duplicarVersion()`, `fusionarVersiones(a, b, peso)` (interpola números, concatena `instruct` por `·` sin duplicar frases), `exportarVersiones()`, `importarVersiones(json)` (devuelve `{ok, errores, versiones}` — nunca lanza), `aplicarVersionATimbre()`.
- **`src/lib/voces/vinculos.ts`** (Ola 240 · VZ5) — `Vinculos { porTimbre, rito, configuracion }`. Persistencia: `starseed.voces.vinculos.v1`. `promoverVersion(versionId, destino)` materializa la versión como `Timbre` propio, la guarda en `starseed.voz.timbres-propios.v1`, apunta el vínculo y —si el destino es `rito` o `configuracion`— fija el timbre activo del sistema. Idempotente: repetir la misma promoción no duplica nada; anota el destino en `promovidaA` de la versión.

### 3.6 Capas que NO hay que confundir

- `src/lib/aurora/voces-catalogo.ts` — vista editable de las 12 voces predeterminadas (`VozEditable` con `origen: "defecto" | "editada" | "clon"`); clave `starseed.voces.v1`. Es la capa de **superficie** del catálogo de timbres.
- `src/lib/aurora/timbres.ts` — la **receta dura** de cada timbre (la única que el motor lee).
- `src/lib/voces/*` — el **Estudio de Voces** de la Ola 240: versiones, vínculos, lector del motor local. Convive con el catálogo editable sin pisarlo (las versiones se promueven a timbres propios, no reemplazan la receta base).

---

## 4. Cómo añadir o clonar una voz

### 4.1 A. Editar → Probar → Guardar (lo que hace `/voces`)

1. Abrir `/voces` (o la sección VoiceStudio del Studio 1.58).
2. Seleccionar una voz existente. Modificar `speed`, `instruct`, `expr.arco/vivacidad/calidez`, `sistema.pitch/rate`.
3. Pulsar «Probar» → llama a `hablarStarSeed()` con el timbre modificado pero **sin guardar** (el motor lee la receta directamente; no se persiste nada).
4. Si gusta, «Guardar» → `guardarVoz()` persiste en `starseed.voces.v1` con `origen: "editada"`.
5. Si no, «Restablecer» → `restablecerVoz()` borra la edición y vuelve al valor de `TIMBRES`.

### 4.2 B. Clonar → Crear variante propia (superficie)

1. En `/voces`, seleccionar una voz base y pulsar «Clonar».
2. `clonarVoz(id, nombre)` (`voces-catalogo.ts:99-118`) crea una copia con id `clon-<base>-<n>` y `origen: "clon"`.
3. Editar la copia libremente. La original queda intacta.
4. Los clones aparecen en `cargarVoces()` filtrados por `origen === "clon"`.

### 4.3 C. Crear una versión (Estudio de Voces, Ola 240 · VZ1)

Útil cuando quieres probar una receta **aislada** (con su motor, tamaño y params propios) antes de promoverla:

1. `versionDesdeTimbre(t, nombre?)` crea una versión con `motor: "alta"`, `tamano: "auto"` y los params copiados.
2. Edita `params.voz/speed/instruct/ref/expr` desde la UI del Estudio.
3. «Probar» llama a `hablarStarSeed` con el timbre derivado (`aplicarVersionATimbre(v)`).
4. «Fusionar con…» (`fusionarVersiones(a, b, peso)`) interpola los números y concatena `instruct` por `·`.
5. «Promover» (`promoverVersion(vId, destino)`) la materializa como `Timbre` propio y la enlaza a la personalidad / rito / ventana de configuración.

### 4.4 D. Generar un timbre único al azar (sólo para ti)

`generarTimbreUnico(genero)` (`timbres.ts:157-185`) crea un `Timbre` con id `propio-<timestamp>`, voz y velocidad aleatorias dentro de rangos seguros (que siempre suenan bien — nada de extremos que conviertan la voz en chirrido o gruñido), y lo guarda en `starseed.voz.timbres-propios.v1` (último de 6).

### 4.5 E. Subir cambios a los valores por defecto (para todos los usuarios)

Las ediciones en `localStorage` son **por usuario y por dispositivo**. Para cambiar los valores por defecto de TODOS los usuarios:

1. Editar directamente `src/lib/aurora/timbres.ts` (array `TIMBRES`, líneas 74-92).
2. Validar que los tokens de `instruct` están en `VALID_INSTRUCT_TOKENS` del daemon (solo tokens de género/edad/tono; texto libre en español es rechazado por `sanitizeInstruct`).
3. `tsc --noEmit` + `vitest` + `next build` (los tests del Estudio de Voces y de los motores son sensibles a las formas del catálogo).
4. Commit + push → deploy automático en Vercel.
5. Los usuarios que no hayan personalizado esa voz recibirán el nuevo valor en la siguiente carga. Los que sí la editaron mantienen su versión (su edición tiene precedencia sobre el código).

### 4.6 F. Añadir una voz nueva al catálogo base

1. Añadir una entrada a `TIMBRES` en `timbres.ts:74-92` con id único, voz neuronal válida (`ef_dora`, `em_alex` o `em_santa`), speed, instruct y expr dentro de rangos seguros.
2. Si es de un género nuevo o necesita una voz neuronal distinta, añadirla primero al modelo OmniVoice.
3. Actualizar `TIMBRE_PREDETERMINADO` si la nueva voz debe ser la predeterminada de su género.
4. Documentar en la tabla §3.1 y en el changelog de la ola correspondiente.

---

## 5. La voz autónoma (cómo decide el sistema quién habla)

La **voz autónoma** es el modo en el que Aurora decide el timbre y el estilo de cada turno por sí misma, sin que el usuario haya fijado uno. Se activa con `setModoVoz("autonoma")` (o cuando la personalidad activa lo declara en su `voiceStyle.modo`).

### 5.1 Piezas que intervienen

1. **`timbres.ts`** — fuente de los 12 timbres. La base autónoma es **`neu-zenit`** (la neutra, la más libre de marca sobre la que modular).
2. **`agente-entonacion.ts`** — el «agente» propiamente dicho. Mira el texto, la hora, la personalidad y una memoria de tono (qué timbres funcionan bien en qué contextos) y devuelve `{ timbreId, instruct, speed, pitch }`. Es heurístico y local: instantáneo. La política la afina en segundo plano el router económico.
3. **`voz-rito.ts:120-162`** (`timbreEfectivo`) — resuelve el timbre AHORA:
   - Si el modo es **autónomo** y hay texto: `decidirEntonacion(texto, ctx)` → busca el timbre → le aplica la modulación.
   - Si el modo es **autónomo** sin texto: parte de `neu-zenit` y aplica `modulacionAutonoma(traits)` sobre `speed` (local) y `pitch`/`rate` (sistema).
   - Si el modo es **fijo**: `timbreActual(generoEfectivo(modo))` — el elegido por el usuario.
4. **`voces-catalogo.ts`** (capas de edición del usuario) — entra en juego al final: la receta efectiva es la edición guardada (si existe) sobre el `TIMBRES` base.
5. **`voz-initial.ts`** — expone `getModoVoz()`, `setModoVoz()`, `generoEfectivo()`, `modulacionAutonoma(traits)`.

### 5.2 Cómo influye un cambio de voz en cada ventana

- **Cambiar el timbre en `/voces`** (superficie): persiste en `starseed.voces.v1` y/o `starseed.voz.timbre.v1`. La siguiente frase del rito (`voz-rito.ts`), la narración de la ventana activa (`narracion-ventana.ts`) y los siguientes mensajes del chat (`voice-identity.ts` + `speak-router.ts`) salen con la nueva voz. La congelación por mensaje (`FrozenVoiceIdentity`) garantiza que un mensaje en curso no se parte a mitad.
- **Cambiar el modo (autónoma ↔ fija)**: `setModoVoz()` actualiza la elección; `timbreEfectivo` lo lee en cada turno. Sin reinicio de la pestaña.
- **Cambiar el nivel** (`estudio/alta/ligera/minima` o `auto`): `fijarNivel(n)` → `starseed.voz.nivel`. `resolverNivel()` lo relee en cada `hablarStarSeed` (con caché de 5 min en `capacidades.ts`).
- **Cambiar la voz neuronal en sí** (Q4_K_M ↔ Q8_0, Kokoro ↔ OmniVoice, etc.): se hace desde el lector del motor local en el Estudio de Voces (`/voces` → Estudio de Voces → Lector del motor → `reiniciarConModelo('Q4_K_M' | 'Q8_0')` en `src/lib/voces/motores.ts:215`). El cambio no afecta a la sesión: el daemon se reinicia, el rito lo siguiente que diga ya sale con el modelo nuevo.

### 5.3 Voz autónoma y personalidad activa

La personalidad activa puede **fijar** un motor (`intelligence.motorVoz` o `intelligence.porSentido.voz.fuente` en `modo: "fija"`, o el `voiceStyle.engine` preferido). En ese caso:

- `engine-registry.ts::buildVoiceChain` coloca el motor fijado como **primer eslabón**, pero NO exclusivo: si ese motor falla, la cadena sigue (Aurora SIEMPRE habla). El pin obsoleto nunca deja muda a Aurora.
- Adenda 149 — la ventana «Sistemas de Astraura en esta neurona» (pestaña LLM) puede fijar el motor **por neurona×personalidad** (`starseed.astraura.neuron-persona.v1`). Ese override va **antes** que el pin de la personalidad, porque describe el hardware/preferencia de ESTE dispositivo. Mismo principio de no-exclusividad.

### 5.4 Estilo emocional vivo (8 emociones)

`voice-style.ts` define las 8 emociones canónicas (`VOICE_EMOTIONS:68-77`): `alegre · serena · dulce · seria · entusiasta · empatica · misteriosa · juguetona`. Cada una lleva deltas de `rate/pitch`, una energía base y una etiqueta Bark opcional.

- **Cómo se actualiza el estilo**: tres vías
  1. El evento GLOBAL `starseed:aurora-voice-style` (lo emite el sistema de Personalidades u otra pieza; detail `{tone?, emotion?, rate?, pitch?, energy?, persona?}`). El consumidor (`installVoiceStyleListener`, `voice-style.ts:323-343`) lo aplica a `starseed.aurora.voice.v1` (la misma clave de la config unificada).
  2. La herramienta de Aurora `ajustar_voz` («habla más dulce»).
  3. Los sliders del panel de Voz.
- **Cómo se traduce por motor**: `resolveVoiceParams()` (`voice-style.ts:110-141`) devuelve `{rate, pitch, volume, energy, emotion?}`. La decoración del texto depende del motor: Bark recibe `[laughs]/[sighs]` (con moderación), VoxCPM recibe `(Voz dulce y suave, muy cercana)` entre paréntesis al inicio del texto, Voicebox recibe `instruct` en lenguaje natural, el navegador y Kokoro reciben números.

### 5.5 El gesto en el mismo instante (Ola 232 · M5)

`hablarStarSeed()` (`motor.ts:196-242`) **dispara el gesto del avatar en el mismo instante** en que empieza a hablar: importa `gestoDesdeTexto()` + `emitirGestoVoz()` de `@/lib/avatares/movimiento/sincronia-voz`, deriva el gesto del texto, la emoción y la personalidad, y emite `starseed:gesto` por `window.dispatchEvent`. Todo va envuelto: si el módulo de movimiento no está disponible (o falla), la voz sigue sonando IGUAL — la invariante «Aurora SIEMPRE habla» se respeta también aquí.

---

## 6. Problemas conocidos y su solución

### 6.1 La voz suena robótica o «a lista de la compra»

**Síntoma**: la frase sale plana, mismo tono y misma velocidad de principio a fin.

**Causa** (Ola 215): un TTS plano suena a robot porque dice TODA la frase con el mismo tono y la misma prisa. La solución son los tres números `expr.arco/vivacidad/calidez` del timbre, y el bucle de entrega expresiva de `voz-rito.ts:321-357` que parte el texto en cláusulas y aplica declinación entonativa + calidez de apertura + variación de velocidad.

**Cómo verificar**: en `/voces`, abrir un timbre con `expr.arco` < 0.10 y `expr.vivacidad` < 0.06 (Atlas o Solis): el habla sale solemne, pero con cuerpo. Subir `expr.vivacidad` a 0.20+ (Iris, Nova, Hermes): ágil y conversacional.

### 6.2 La voz cambiaba entre pestañas antes de la Ola 227

**Síntoma**: la misma Aurora sonaba con voces distintas según la ventana activa (rito, chat, guía, notificaciones).

**Causa**: cada superficie elegía su motor por su cuenta.

**Solución (Olas 227-228)**:

1. **Ola 227** — se unificó la selección de timbre en `timbreEfectivo()` (`voz-rito.ts:120-162`).
2. **Ola 228** — se creó el **motor único** `hablarStarSeed()` (`motor.ts:196-242`) como único punto de entrada. Todas las superficies pasan por él. El timbre viaja como parámetro; el nivel se resuelve una sola vez; la degradación es grácil y nunca cambia la identidad.
3. **Ola 232 · M5** — el gesto del avatar se dispara en el mismo instante (`starseed:gesto`), con `emocion` y `personalidadId` opcionales, sin importar el motor de movimiento.

Verificación: las 12 voces suenan idénticas en `/agent`, `/dashboard`, `/escritorios` y el rito de onboarding. El nivel mostrado en la UI coincide con el backend activo.

### 6.3 «La voz del navegador enumera 180 voces pero no suena»

**Síntoma** (Adenda 211): `speechSynthesis.getVoices()` devuelve 180 voces, `AudioContext` está `running` a 44.1 kHz, pero `onstart` no se dispara nunca. Pasa en navegadores embebidos y en Chrome cuando su servicio de voz se cuelga. `speak()` no falla —simplemente no suena— y el código creía haber hablado.

**Solución**: `voz-rito.ts:294-383` monta un **relevo verificado** a 1,2 s (`RELEVO_MS`):

1. Pide a `speechSynthesis` que hable con el timbre del rito (cláusulas expresivas).
2. Si en `RELEVO_MS` no ha llegado `onstart`, esa vía está **muerta**: se corta y se entrega el turno al motor OSS/OmniVoice, que reproduce por un elemento `<audio>` — un camino de audio COMPLETAMENTE distinto, que funciona allí donde funciona cualquier otro sonido.
3. Detalles que ya costaron regresiones: `cancel()` y `speak()` en el mismo tick encallan Chrome → tick de respiro de 90 ms. Chrome corta el habla solo a los ~15 s → `resume()` cada 9 s.

**Si tampoco el motor OSS habla**, el rito avisa con honestidad por evento (`starseed:voz-rito` con `detail: "muda"` o `detail: "instalable"` si Kokoro podría descargarse con permiso) para que la ventana lo diga en pantalla en vez de dejar al usuario mirando en silencio.

### 6.4 Las voces caen a Kokoro aunque el daemon neuronal está vivo

**Síntoma**: el demonio OmniVoice está en pie, el rito debería hablar con voz neuronal, pero termina sonando Kokoro o la voz del sistema.

**Causa** (capacidades.ts:64-82): el sondeo del daemon tenía un timeout de **800 ms** y se miraba el código 200 de `/api/voz/salud`. En una Mac cargada la ruta tardaba más y el rito degradaba a Kokoro. Además, la ruta respondía 200 también cuando el demonio estaba apagado.

**Solución**: `capacidades.ts::sondearDaemon()` ahora tiene timeout de **4 s** y se mira `vivo: true` (no solo el 200). El sondeo se cachea 5 min y se marca «ausente 3 min» si falla (`motor-local.ts:78-103`).

### 6.5 El daemon OmniVoice daba timeout de 180 s con Q4_K_M

**Síntoma** (Adenda 217, `motor-local.ts:1-23`): el demonio fallaba CADA síntesis con «timeout de síntesis (180000 ms)».

**Causa**: la config apuntaba al modelo Q4_K_M, pero el binario `omnivoice-tts` solo carga F32 / BF16 / **Q8_0**. Con Q8_0 (ya descargado) sintetiza a la primera.

**Solución**: el Lector del motor local del Estudio de Voces (`/voces` → Lector del motor) detecta los modelos GGUF instalados y permite reiniciar con `Q8_0` o `Q4_K_M` desde la UI. La causa raíz se documentó en `motor-local.ts:9-17`.

### 6.6 El rito en bucle tras la ventana de perfil (Ola 221/227)

**Síntoma**: tras completar la ventana de perfil del rito, el portero reabría la bienvenida en cada recarga.

**Causa**: `skippedAt` (camelCase) se enviaba como clave al upsert de `onboarding_state`, pero la columna en BD es `skipped_at` (snake_case). El upsert devolvía 400 y `completed` nunca se guardaba. Además, el rito no consumía la marca de «recién registrado» al terminar.

**Solución** (`onboarding.ts:113-180`): `deFila()` traduce `skipped_at` ↔ `skippedAt`; `saveOnboarding` filtra `skippedAt` del patch y lo envía como `skipped_at`. Completar limpia `skipped` y `skipped_at`. Terminar o posponer consume `starseed.recien.registrado` (sessionStorage).

### 6.7 `instruct` en español: el daemon lo rechaza

**Síntoma**: todos los timbres caen al default y suenan igual.

**Causa** (Ola 222): el daemon OmniVoice sanitiza `instruct` contra `VALID_INSTRUCT_TOKENS` (whitelist en inglés de tokens de género/edad/tono). Texto libre en español es rechazado por `sanitizeInstruct`.

**Solución**: `timbres.ts:77` documenta la regla; los `instruct` de los 12 timbres están limitados a tokens válidos (`female, young adult, moderate pitch` y similares). El soporte para `instruct` en español es **pendiente de ampliación** en el backend.

### 6.8 Inconsistencias entre `kind` del catálogo y el registro

**Síntoma** (verificación Adenda 67): el Centro de Configuración declaraba Kokoro como «needs-endpoint» porque su `availabilityOffline` aplicaba la rama de motores por endpoint.

**Solución** (`engine-registry.ts:556-590`): `availabilityOffline` distingue `kind` explícitamente: `browser → ready/unsupported`, `kokoro → configured/needs-download`, `kitten → unsupported`, motores neurales → `configured`/`needs-endpoint`/`needs-profile`/`needs-unreachable`.

### 6.9 `catálogo` duplicado en `timbres.ts` y `vozDelTimbre`/filtro de personaje

**Síntoma**: las voces de personaje de Apple (`eddy`, `flo`, `grandma`…) suenan a caricatura; `vozDelTimbre` las prefiere por nombre si están en la lista de bases.

**Solución** (`timbres.ts:67, 187-205`): `VOCES_PERSONAJE` es la lista negra; `esVozPersonaje(nombre)` las detecta; `vozDelTimbre()` las filtra ANTES de devolver una voz. Si no queda ninguna voz natural, devuelve `null` y el rito avisa «muda» (Ola 213).

---

## 7. Referencias cruzadas (rutas reales)

### 7.1 Motor único «Voz StarSeed»

- `src/lib/aurora/voz-starseed/motor.ts` — `hablarStarSeed()`, `nivelActual()`, `nivelPreferido()`, `fijarNivel()`, `parametrosPorNivel()`, `precalentar()`, `nombreNivelActual()`. Clave LS `starseed.voz.nivel`.
- `src/lib/aurora/voz-starseed/niveles.ts` — `NIVELES`, `nivelPara(c)`, `nivelesDisponibles(c)`, `siguienteNivel(n)`.
- `src/lib/aurora/voz-starseed/capacidades.ts` — `detectarCapacidades()`, `capacidadesEnCache()`. Caché 5 min, timeout del daemon 4 s.
- `src/lib/aurora/voz-starseed/daemon.ts` — `saludDaemon()`, `sintetizarEnDaemon()`. Dos puertas: tts-server en 4500 y demonio Astraura en 4444.

### 7.2 Capa de timbres (receta)

- `src/lib/aurora/timbres.ts` — `TIMBRES`, `TIMBRE_PREDETERMINADO`, `TIMBRE_AUTONOMO_BASE`, `buscarTimbre()`, `timbreActual()`, `fijarTimbre()`, `timbresPropios()`, `guardarTimbrePropio()`, `generarTimbreUnico()`, `vozDelTimbre()`.
- `src/lib/aurora/voz-inicial.ts` — `getModoVoz()`, `setModoVoz()`, `generoEfectivo()`, `modulacionAutonoma(traits)`.
- `src/lib/aurora/agente-entonacion.ts` — `decidirEntonacion(texto, ctx)`.
- `src/lib/aurora/voces-catalogo.ts` — `vocesDefecto()`, `cargarVoces()`, `guardarVoz()`, `clonarVoz()`, `restablecerVoz()`, `exportarVoces()`, `importarVoces()`. Clave LS `starseed.voces.v1`.

### 7.3 Capa de motores (cadena y registro)

- `src/lib/aurora/tts-oss/engine-registry.ts` — `VOICE_ENGINE_REGISTRY`, `AUTO_ENDPOINT_ORDER`, `PRIMARY_VOICE_ENGINE = "openvoice2"`, `buildVoiceChain()`, `resolveActiveVoiceEngine()`, `personalityVoiceEnginePin()`, `refreshPersonalityVoicePin()`, `listVoiceEngines()`, `listVoiceEnginesWithStatus()`.
- `src/lib/aurora/tts-oss/speak-router.ts` — `speakWithConfiguredEngine()`, `isConfiguredOssEngineReady()`, `stopConfiguredEngine()`, `detectSpokenLang()`.
- `src/lib/aurora/tts-oss/voice-config.ts` — `getVoiceConfig()`, `setVoiceConfig()`, `AURORA_VOICE_CONFIG_KEY`, `VOICE_PRESETS`, `NEURAL_VOICE_ENGINES`, `isNeuralEngine()`, `applyVoicePreset()`.
- `src/lib/aurora/tts-oss/voice-style.ts` — `VOICE_EMOTIONS` (8), `resolveVoiceParams()`, `decorateTextForBark()`, `decorateTextForVoxCPM()`, `voiceDesignPrompt()`, `deliveryInstruction()`, `passthroughParams()`, `installVoiceStyleListener()`.
- `src/lib/aurora/tts-oss/voice-identity.ts` — `FrozenVoiceIdentity`, `setVoiceIdentity()`, `markVoiceIdentitySpoke()`, `lockVoiceIdentityEndpoint()`, `cachedSynthesis()`.
- `src/lib/aurora/tts-oss/omnivoice-mixer.ts` — `mixerPlayBlob()`, `mixerPlayBufferAt()`, `mixerPlayPcm16Chunk()`, `mixerEndPcmStream()`, `stopMixer()`. `MIXER_DEFAULT_CROSSFADE_MS = 160`.
- `src/lib/aurora/tts-oss/omnivoice-hybrid.ts` — `synthesizeOmniVoiceHybrid()`, `decideOmniRoute()`, `getOmniVoiceRouteState()`, `OMNI_LOCAL_BASE = "http://127.0.0.1:4444"`, `OMNI_SPACE_BASE = "https://k2-fsa-omnivoice.hf.space"`.
- `src/lib/aurora/tts-oss/openvoice2.ts` — `OPENVOICE2_SPACE = "https://myshell-ai-openvoicev2.hf.space"`, `OPENVOICE2_STYLES` (10), `OPENVOICE2_FN_INDEX = 1`.
- `src/lib/aurora/tts-oss/neural-tts.ts` — `neuralSpeak()`, `neuralSynthesize()`, `pingNeuralEngine()`, `NEURAL_TTS_TIMEOUT_MS = 20_000`, `ENGINE_TIMEOUT_MS` (por motor), `NEURAL_PING_TTL_MS = 60_000`, `ENGINE_PATHS` (rutas candidatas).
- `src/lib/aurora/tts-oss/openvoice-discovery.ts` — `discoverOpenVoiceEndpoints()`, `orderedOpenVoiceEndpoints()`, `ensureDiscoveryFresh()`, memoria de salud.
- `src/lib/aurora/tts-oss/omnivoice-web-router.ts` — `omnivoiceWebSynthesize()`, `applyVoiceChainPriority()`, `motorVivoDeEstaNeurona()`.
- `src/lib/aurora/tts-oss/voicebox-engine.ts` — `OpenVoiceHybridRouter.synthesize()`, `resolveVoiceboxPersonality()`, `VOICEBOX_LOCAL_HOST = "http://127.0.0.1:17493"`.
- `src/lib/aurora/tts-oss/brain-api-manager.ts` — `BrainApiManager.sync()` (auto-sync de API key por Cerebro/Usuario).
- `src/lib/aurora/tts-oss/kokoro.ts` — `kokoroAvailable()`, `kokoroModelReady()`, `kokoroPreload()`, `kokoroSpeak()`, `stopKokoro()`, `KOKORO_SPANISH_VOICES`, `KOKORO_DEFAULT_SPANISH_VOICE`.
- `src/lib/aurora/tts-oss/oss-tts.ts` — `loadTtsModel()`, `isTtsModelReady()`, `speakOss()`, `isOssTtsSupported()`.
- `src/lib/aurora/tts-oss/opt-in.ts` — `AURORA_OSS_TTS_KEY`, `KOKORO_MODEL_REPO`, `KOKORO_APPROX_SIZE`, `OSS_TTS_VOICES`, `DEFAULT_OSS_TTS_VOICE`.
- `src/lib/aurora/tts-oss/browser-voices.ts` — `rankBrowserVoices()`, `getBestBrowserVoice()`, `resolveBrowserVoice()`.
- `src/lib/aurora/tts-oss/locales.ts` — `findLocale()`, `suggestLocalesFromEnvironment()`.
- `src/lib/aurora/tts-oss/kitten.ts` — **STUB**: `kittenAvailable()` siempre `false`; `KITTEN_STATUS` honesto.
- `src/lib/aurora/tts-oss/voice-catalog.ts` — `VOICE_CATALOG` (catálogo amplio: xAI + open-source), `DEFAULT_FEM_VOICES`, `defaultVoiceForGender()`.
- `src/lib/aurora/tts-oss/xai-voice-agent.ts` — agente conversacional (WebSocket), `xaiSpeakOnce()` para la cadena one-shot.
- `src/lib/aurora/tts-oss/xai-persona-voices.ts` — `XAI_PERSONA_VOICES` (Astraura/Council/MoA/Aurora/Hermione con voz e instrucciones).
- `src/lib/aurora/tts-oss/voice-recorder.ts` — captura de audio para clonación (`refBlob`).
- `src/lib/aurora/tts-oss/neuron-voice-constants.ts` — `probeLocalDaemon()`, `readNeuronVoiceChoice()`.
- `src/lib/aurora/tts-oss/index.ts` — barrel con TODO el sistema de voz (la API que consume el Centro de Configuración).

### 7.4 Cliente del daemon local

- `src/lib/aurora/motor-local.ts` — `estadoMotorLocal()`, `hablarLocalPorFrases()`, `precalentarMotorLocal()`, `anticiparLocal()`, `pararLocal()`, `sintetizarLocal()`. Caché 5 s + marca ausente 3 min.

### 7.5 Rito, ventana, gestos

- `src/lib/aurora/voz-rito.ts` — `hablarRito()`, `timbreEfectivo()`, `callarRito()`, `anticiparRito()`, `instalarVozPropia()`. Evento `starseed:voz-rito`. `RELEVO_MS = 1200`.
- `src/lib/aurora/narracion-ventana.ts` — `useNarracionVentana()`, `marcarVozDelRito()`, `cortarVoz()`. Marca `starseed.voz.rito` (sessionStorage).
- `src/lib/aurora/streaming-voice.ts` — `createStreamingVoice()`, `splitClauses()`, `detectPersonaHeader()`. Cabeceras `### 💬 [Hephaestus]:` etc.
- `src/lib/aurora/motor-voz.ts` — reexporta el motor único + `motorPreferido()`, `precalentarMotorNeural()`, `motorNeuralListo()`, `MOTORES_VOZ_INFO` (4 fichas para la UI).
- `src/lib/aurora/personalities.ts` — fuente de `VoiceGender` (usado por los timbres) y de las personalidades.
- `src/lib/aurora/persona-coherence.ts` — coherencia de la voz con la personalidad activa.
- `src/lib/aurora/audio-emotion.ts` — `getLastUserVoiceEmotion()` (ánimo vivo del usuario).

### 7.6 Estudio de Voces (Ola 240)

- `src/lib/voces/motores.ts` — `leerMotores()`, `reiniciarConModelo()`, `listarModelos()` (SOLO servidor, no expone rutas del disco).
- `src/lib/voces/versiones.ts` — `VersionVoz`, `versionDesdeTimbre()`, `crearVersion()`, `fusionarVersiones(a, b, peso)`, `aplicarVersionATimbre()`.
- `src/lib/voces/vinculos.ts` — `Vinculos`, `cargarVinculos()`, `guardarVinculos()`, `promoverVersion()`.
- `src/app/(app)/voces/page.tsx` — ruta del Estudio.
- `src/components/voces/estudio-voces.tsx` — UI (no leída en este doc; ver la implementación).

### 7.7 Rito, onboarding y superficie

- `src/lib/onboarding/onboarding.ts` — `getOnboarding()`, `saveOnboarding()`. Estado del rito en `onboarding_state` (`skipped` + `skipped_at`).
- `src/components/onboarding/onboarding-wizard.tsx` — el wizard (no leído en este doc).
- `src/components/onboarding/aurora-guide-voice.ts` — el `auroraBridge` que consume `narracion-ventana.ts`.

### 7.8 SOPs de arquitectura (fuente de verdad de las olas)

- `architecture/astraura-158-sistema-primario.md` — Adenda 153: Astraura 1.58-bit como SISTEMA PRIMARIO; voz sigue siendo OmniVoice (OS), VoiceStudio 1.58 queda como pendiente §11.
- `architecture/aurora-voz-motores.md` — Adenda 67 · P2: registro de motores, fusión y selección automática. Define el orden AUTO original.
- `architecture/centro-creacion-sync-permisos.md` — Adenda 63 (2026-07-11/12): Centro de Creación, sesión persistente, voz, neuronas, CasaOS, OmniVoice Mixer (Adenda 97).
- `architecture/astraura-mesh-meshtastic.md` — Adenda 97 (Red Mesh): incluye la sección «OmniVoice Mixer» (`omnivoice-mixer.ts`).

### 7.9 Memoria

- `memory/principles.md` — Tríada ideológica nuclear.
- `memory/roadmap.md` — roadmap técnico de 3 fases.
- `memory/architecture.md` — decisiones de arquitectura.
- `memory/state.md` — bitácora de cambios (actualizar tras cada sesión).
- `memory/glossary.md` — glosario extendido.
- `memory/estudio-voces.md` — apuntes previos del Estudio (referencia cruzada).

---

## 8. Nota sobre los archivos de la lista original

La tarea pedía leer estos archivos: `motor-voz.ts`, `voz-rito.ts`, `narracion-ventana.ts`, `streaming-voice.ts`, `tts-oss/*` (engine-registry.ts, kokoro.ts, kitten.ts, omnivoice-*.ts, openvoice2.ts, voicebox-engine.ts, speak-router.ts, voice-catalog.ts, voice-identity.ts, voice-style.ts, xai-persona-voices.ts, neural-tts.ts) y `src/lib/aurora/voces-catalogo.ts` (Estudio de Voces).

**Verificación de existencia** (realizada con `ls src/lib/aurora/tts-oss/` y `ls src/lib/voces/`):

| Archivo pedido | Estado | Nota |
|---|---|---|
| `motor-voz.ts` | ✓ existe | `src/lib/aurora/motor-voz.ts` — reexporta el motor único |
| `voz-rito.ts` | ✓ existe | `src/lib/aurora/voz-rito.ts` |
| `narracion-ventana.ts` | ✓ existe | `src/lib/aurora/narracion-ventana.ts` |
| `streaming-voice.ts` | ✓ existe | `src/lib/aurora/streaming-voice.ts` |
| `tts-oss/engine-registry.ts` | ✓ existe | — |
| `tts-oss/kokoro.ts` | ✓ existe | — |
| `tts-oss/kitten.ts` | ✓ existe | — |
| `tts-oss/omnivoice-*.ts` | ✓ existen 3: `omnivoice-hybrid.ts`, `omnivoice-mixer.ts`, `omnivoice-web-router.ts` | (los tres leídos) |
| `tts-oss/openvoice2.ts` | ✓ existe | — |
| `tts-oss/voicebox-engine.ts` | ✓ existe | — |
| `tts-oss/speak-router.ts` | ✓ existe | — |
| `tts-oss/voice-catalog.ts` | ✓ existe | — |
| `tts-oss/voice-identity.ts` | ✓ existe | — |
| `tts-oss/voice-style.ts` | ✓ existe | — |
| `tts-oss/xai-persona-voices.ts` | ✓ existe | (sí existe, NO había que fusionar) |
| `tts-oss/neural-tts.ts` | ✓ existe | — |
| `src/lib/aurora/voces-catalogo.ts` | ✓ existe | (convive con `src/lib/voces/*` — ver §3.5) |
| `src/lib/voces/*` (Estudio de Voces, Ola 240) | ✓ existen 3: `motores.ts`, `versiones.ts`, `vinculos.ts` | (mencionados en §3.5 y §3.6) |

**No existen** y, por tanto, no se han podido leer:

- `tts-oss/omnivoice-engine.ts` — la tarea lo lista entre los `omnivoice-*.ts`, pero NO existe como archivo aparte. Su funcionalidad está repartida entre `omnivoice-hybrid.ts` (motor completo: daemon local + nube) y `omnivoice-web-router.ts` (router de Spaces HF). La cadena habla con el motor OmniVoice a través de `speak-router.ts:runLink('omnivoice')` → `synthesizeOmniVoiceHybrid()`. He documentado el comportamiento del motor en §2 fila 7 con las referencias reales.
- `tts-oss/openvoice.ts` (sin el sufijo `2`) — la tarea lo lista pero no existe. OpenVoice V2 vive en `openvoice2.ts`; el motor «OpenVoice 2 (motor)» del registro (`engine-registry.ts:230-250`) es ese. La versión 1 del motor está disponible vía `OPENVOICE_V1_EMOTIONS` y `looksLikeV1Predict()` en `openvoice-discovery.ts` para los Spaces HF heredados, pero no tiene un módulo cliente dedicado.
- `voces-catalogo.ts` en `src/lib/voces/` (la tarea dice «el Estudio de Voces vive en `src/lib/voces/` desde la Ola 240»). Conviven dos archivos con nombre similar:
  - `src/lib/aurora/voces-catalogo.ts` (existe) — vista editable de las 12 voces predeterminadas (`VozEditable` con `origen`); clave `starseed.voces.v1`. Es la capa de **superficie** del catálogo.
  - `src/lib/voces/motores.ts` + `versiones.ts` + `vinculos.ts` (existen los tres) — el **Estudio de Voces** de la Ola 240: versiones, vínculos y lector del motor local. NO hay un `voces-catalogo.ts` en `src/lib/voces/`; la operativa de versiones/vínculos se hace desde la UI del Estudio consumiendo directamente los módulos. He documentado las dos capas en §3.5 y §3.6.

El resto de la documentación se ha construido leyendo el código real. Las afirmaciones sobre rutas, líneas, claves de localStorage, eventos, signatures de funciones y orden de las cadenas se han verificado con grep/Read contra los archivos en disco en 2026-09-05.
