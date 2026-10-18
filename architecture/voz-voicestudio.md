# Voz de Astraura + VoiceStudio: fusión, licencias por contexto y respuesta instantánea

> **Petición de Alex (2026-10-18):** «en la fusión de los modelos locales código abierto del sistema predeterminado de
> voz de Astraura, de todos sus medios y configuraciones y ajustes y opciones de clonación y generación, incluyendo sus
> capacidades completas, para siempre sea la respuesta instantánea, autoadaptable en cada dispositivo, automejorable y
> autoactualizable en toda la red y StarSeed OS, integra las funcionalidades de las mejoras y fusiona este otro sistema
> y también agrégalo a la Librería de StarSeed OS: https://github.com/debpalash/voicestudio».

Amplía `voz-fusionada-astraura.md` (una sola puerta `hablar()`, un solo resolutor de identidad, oído por elector,
servidor de voz en malla), `aurora-voz-motores.md` («Aurora SIEMPRE habla»), `vigia-modelos.md` (licencias y
autoactualización) y `apps-en-la-malla.md` (relé `capacidad.*`).

## 1. Qué es VoiceStudio (comprobado el 2026-10-18)

- **Qué hace:** estudio de voz local (antes «OmniVoice-Studio»): voz con clonación instantánea desde ~3 s, diseño de
  voz por atributos (género, edad, acento, tono, emoción, dialecto), dictado con atajo global, doblaje de vídeo
  (transcribir → traducir → revocar → MP4), audiolibros EPUB/PDF → .m4b, editor de guiones a varias voces,
  aislamiento de voz (Demucs), quién habla cuándo (Pyannote), marca de agua (AudioSeal), colas por lotes y una
  galería de voces con paquetes `.ovsvoice`.
- **Cómo está hecho:** la app de escritorio pasó de Tauri a **Electron** (rama principal del 2026-10-18); el motor es
  Python/FastAPI como proceso aparte en `127.0.0.1:3900`.
  - **Descubrimiento:** `GET /.well-known/voicestudio-speech` dice si está vivo y qué ofrece (así lo detecta el demonio).
  - **API compatible con OpenAI:** `POST /v1/audio/speech`, `POST /v1/audio/transcriptions` y `GET /v1/audio/voices`.
  - **Más:** oído en vivo por WebSocket `ws://127.0.0.1:3900/v1/audio/transcriptions/stream`, voz en flujo por
    frases, más de 100 rutas REST y servidor MCP en `POST :3900/mcp/`.
  - **Acceso:** solo desde la propia máquina y sin clave por defecto; en remoto pide clave (`OMNIVOICE_API_KEY`
    como «bearer») y su guía dice: solo en red de confianza.
- **Versión:** última publicada v0.5.6 (23-09-2026); el repositorio ya va por 0.5.7. Beta activa.
  - **Paquetes:** macOS (.dmg; el motor local acelera con Metal en Apple Silicon), Windows x64 y Linux x64
    (.AppImage, .deb) y **Docker**. No hay paquete Linux arm64 (el A1); si su Docker corre en arm64 está **sin medir**.
  - **Requisitos:** 8 GB de RAM mínimo (16 recomendados), 4 GB de VRAM y 10 GB de disco. La Mac de Alex tiene 8 GB:
    VoiceStudio entero ahí va al límite; por eso el nivel «estudio» se usa cuando la neurona lo aguanta (§4) y se
    puede servir desde otra neurona de la malla.
- **Licencia del programa: AGPL-3.0-only** (aviso en `LICENSE-NOTICE.md`; el mantenedor vende licencia comercial solo
  para quien quiera cerrarlo). Es compatible con StarSeed OS (`AGPL-3.0-or-later`): el código que se fusione queda bajo
  AGPL-3.0, conservando avisos y atribución. Los pesos de cada modelo mantienen su propia licencia (§2).
- **Paquete de voz `.ovsvoice` (formato comprobado en `backend/services/persona_bundle.py`):** un ZIP de hasta 100 MB
  con `manifest.json` (`format: "ovsvoice"`, `schema_version: 1`, `persona` {name, kind, language, personality,
  instruct, ref_text, seed, is_locked}, `engine`, `license.spdx`, `tags`, `preview`, `members`), `metadata.json`
  (compatibilidad), `consent.json` opcional y audios `ref_audio`, `locked_audio`, `consent_audio` y `preview`
  (≤ 8 s, 24 kHz mono, con marca de agua). Licencias admitidas: CC0-1.0, CC-BY-4.0, CC-BY-SA-4.0, CC-BY-NC-4.0,
  CC-BY-NC-SA-4.0, CC-BY-ND-4.0, MIT, Apache-2.0 y `LicenseRef-VoiceStudio-Personal` (la de por defecto). Nunca se usa
  el nombre de un miembro del ZIP como ruta.
- **Motores que trae:**
  - **Voz (14):** OmniVoice (por defecto), CosyVoice 3, GPT-SoVITS, VoxCPM2, MOSS-TTS-Nano, KittenTTS,
    MLX-Audio (Kokoro, Qwen3-TTS, CSM, Dia), Sherpa-ONNX, IndexTTS 2, OmniVoice GGUF, Supertonic 3, MOSS-TTS v1.5,
    dots.tts y Confucius4-TTS.
  - **Oído (11):** WhisperX, Faster-Whisper, MLX Whisper, Parakeet TDT v3, Moonshine, SenseVoice, sherpa-onnx y
    cliente remoto compatible con OpenAI.

## 2. Licencias de los PESOS (comprobadas en Hugging Face el 2026-10-18)

La tabla de VoiceStudio dice «Built-in» o «Apache-2.0», pero lo que manda es la licencia de cada modelo:

| Modelo | Licencia real | Clase (`vigia-modelos.md` §3) |
|---|---|---|
| **OmniVoice** (k2-fsa) — el motor por defecto de VoiceStudio | código Apache-2.0, **pesos CC-BY-NC** («por los datos de entrenamiento») | **personal** |
| CosyVoice 3 (Fun-CosyVoice3-0.5B-2512) | Apache-2.0 | libre |
| VoxCPM2 (openbmb) | Apache-2.0 | libre |
| MOSS-TTS-Nano-100M · MOSS-TTS v1.5 | Apache-2.0 | libre |
| KittenTTS nano 0.8 | Apache-2.0 | libre |
| Kokoro-82M | Apache-2.0 | libre |
| Qwen3-TTS 0.6B/1.7B | Apache-2.0 | libre |
| CSM-1B (Sesame) | Apache-2.0 (acceso con aceptación) | libre |
| Dia-1.6B | Apache-2.0 | libre |
| dots.tts | Apache-2.0 | libre |
| IndexTTS 2 / 2.5 | bilibili Model Use License (umbral de 100 M usuarios; no usarlo para mejorar otros modelos) | condicionada |
| Confucius4 (netease-youdao) | NetEase model use license | condicionada |
| Supertonic 3 (la voz F1 de Alex) | OpenRAIL (uso comercial con restricciones de uso) | condicionada (se cumple) |
| Parakeet TDT v3 | CC-BY-4.0 (atribución) | libre |
| Moonshine (moonshine-ai) | MIT | libre |
| SenseVoice | FunASR model license | condicionada |
| AudioSeal · Pyannote 3.1 · Demucs | MIT | libre |

**Importante para lo que ya tenemos:** según su ficha en la Biblioteca, `voz-voicemorphic` («la voz nativa de
Astraura, motor por defecto en macOS») es una fusión **sobre OmniVoice**. Con pesos CC-BY-NC no puede ser la voz por
defecto en usos comerciales ni públicos (regla de Alex: nada no comercial en uso comercial). Se queda como opción
**personal** y el elector la cambia sola por una libre en contextos de grupo, comunidad, publicación o comercio (§4).

## 3. Cómo se fusiona (lo de VoiceStudio entra en NUESTRA voz, no al lado)

1. **VoiceStudio es un motor más detrás de la única puerta** `hablar()` y del elector de oído:
   - si está instalado y responde en `127.0.0.1:3900`, cuenta como **nivel «estudio»**, el de más calidad, con
     clonación, diseño, emoción y voz en flujo;
   - el demonio de voz (`native/astraura-voice/daemon.mjs`, 127.0.0.1:4444) lo detecta y lo sirve por la misma puerta
     local, así que nadie más tiene que saber que existe.
2. **Sus motores libres pasan a nuestro catálogo**, cada uno con licencia, clase, tamaño y para qué medio sirve:
   - **CosyVoice 3, VoxCPM2 y Qwen3-TTS:** clonación de calidad y libre;
   - **KittenTTS, MOSS-TTS-Nano y Kokoro:** voz instantánea en cualquier aparato;
   - **dots.tts y Dia:** diálogo con varias voces;
   - **Moonshine:** oído pequeño y libre.
3. **Sus capacidades se vuelven del OS:**
   - **Diseño de voz por atributos:** entra en la identidad de cada persona, bot y agente.
   - **Paquetes `.ovsvoice`:** se importan y exportan como perfiles de voz.
   - **Doblaje:** un átomo de la Protomolécula.
   - **Audiolibros:** desde la Biblioteca.
   - **Quién habla cuándo:** en llamadas y reuniones, con permiso.
   - **Aislamiento de voz:** en la Protomolécula y en Audiomorphic.
   - **Marca de agua:** en todo audio clonado.
4. **En la malla**, una neurona con VoiceStudio sirve voz y oído a las demás de su cuenta y grupo por el relé
   `capacidad.*`, con las reglas de privacidad de `voz-fusionada` §3: el audio de una persona no sale de sus neuronas
   sin permiso.

## 4. Siempre instantánea, autoadaptable y con la licencia correcta

- **Primera frase del más rápido que tenga esa voz.** Una conversación empieza a sonar con el motor de menor latencia
  medida en ESA neurona que tenga la voz de esa persona (Supertonic, Kitten o Kokoro en el navegador o el demonio). El
  motor de estudio se usa para lectura, ventanas largas, doblaje y audiolibros.
- **Nunca se parte un mensaje entre dos motores** (regla de `speak-router`).
- **En flujo:** voz por frases (WebSocket) para que suene mientras se genera.
- **Por aparato:** el nivel sale de las capacidades medidas, igual que hoy: estudio › alta › nube › ligera › mínima.
- **Licencia por contexto (pura):** `personal`, `grupo`, `comunidad`, `publico` y `comercial`.
  - En los cuatro últimos solo entran motores `libre`, o `condicionada` si la condición se cumple.
  - Un motor `personal` (OmniVoice, VoiceMorphic) solo suena en lo personal y lo dice en Ajustes.
  - Se usa la misma herencia de capas de conciencia que `preferencias-capas.ts`.
- **Clonación con consentimiento:**
  - solo la voz propia o una con permiso registrado (quién, de quién, para qué, hasta cuándo, revocable);
  - todo audio clonado lleva marca de agua y la etiqueta «voz clonada»;
  - nunca se clona una voz desde un audio de otra persona sin su permiso.
- **Se mejora sola:**
  - las medidas de latencia y calidad por motor y aparato (`medidas-voz.ts`) y el 👍/👎 de cada respuesta hablada
    ordenan el elector;
  - el vigía de modelos vigila VoiceStudio y sus motores (áreas voz y oído) y propone o instala lo que mejora (§5 del
    vigía).

## 5. Tareas (Ola 1018V, `cola-voicestudio-1018.json`)

| Bloque | Tareas |
|---|---|
| Biblioteca | A fichas de VoiceStudio y de los motores nuevos, con licencia real · aviso en la ficha de VoiceMorphic |
| Catálogo y licencias | B licencia y clase en `catalogo-voces.ts` · C elector de licencia por contexto (puro) |
| Motor | D cliente de VoiceStudio · E oído por VoiceStudio y Moonshine · F nivel «estudio» e instantáneo en el motor único · G demonio: puerta local hacia VoiceStudio |
| Identidad y ética | H clonación con consentimiento y marca de agua · I lector ZIP seguro · Ib paquetes `.ovsvoice` |
| Capacidades | J átomo «doblaje» de la Protomolécula · K voz y oído de VoiceStudio por la malla |
| Ajustes, vigía y mejora | L Ajustes → Voz con VoiceStudio y etiquetas de licencia · M el vigía vigila VoiceStudio y sus motores (y también HyperFrames, Laya y las skills de Matt Pocock, para no tocar dos veces el mismo archivo) · N el elector aprende de las medidas y del 👍/👎 |

Cada tarea toca como mucho 3 archivos y 120 líneas por archivo. Las escribe el enjambre; Claude dirige y verifica en
localhost (Ajustes → Voz, Biblioteca › Voces).
