# Vídeo con HyperFrames en la Protomolécula: editor propio, render en la malla y edición en grupo

> **Petición de Alex (2026-10-18):** «integra este programa completo en la Protomolécula para la edición y desarrollo
> de vídeos y también instálalo para nuestro uso desde Claude para otros proyectos y en la Librería de StarSeed OS,
> instalado automáticamente en todo el sistema, en los chats de Astraura de cualquier medio directamente desde cada
> chat o ventana flotante en la pizarra o mantenible en una capa sobre todo el sistema del usuario o página o grupo o
> mensajes o donde sea, al igual que los demás widgets y ventanas de la pizarra, escritorio, navegador y dashboard;
> pero este es aparte un programa de edición especial autoactualizable, fusionable, de código abierto, incluido en la
> Protomolécula, el lienzo de creación universal, pizarras, escritorio, chats, mensajes, páginas, publicaciones,
> transmisiones compartibles en servidores públicos o privados para ediciones en grupo en tiempo real en salas 2D en
> pantallas o 3D en AR y VR: https://github.com/heygen-com/hyperframes».

Amplía `protomolecula.md` (molécula, átomos, superficie de control, sincronía §6), `apps-en-la-malla.md` (bolsa de
recursos y relé `capacidad.*`), `starseed-xr.md`, `vigia-modelos.md` y `voz-voicestudio.md` (voz para vídeos).

## 1. Qué es HyperFrames (comprobado el 2026-10-18)

- **Qué hace:** convierte HTML, CSS, medios y animaciones que se pueden «buscar» fotograma a fotograma en vídeo
  (MP4, WebM, MOV con transparencia, GIF, secuencia PNG, HLS). Un vídeo es un `index.html` con atributos de tiempo
  (`data-start`, `data-duration`, `data-track-index`, `class="clip"`); el resultado es determinista (la misma
  entrada da los mismos fotogramas). Es de HeyGen y lo usan en producción.
- **Licencia: Apache-2.0** (repo y paquetes npm). Compatible con StarSeed OS (`AGPL-3.0-or-later`).
- **Versión:** CLI `hyperframes` 0.8.172 y paquetes `@hyperframes/*` 0.8.173 en npm (publicados el 18-10-2026; sale
  versión casi a diario). Requisitos: Node 22+, FFmpeg y Chrome headless.
- **Paquetes:** `hyperframes` (CLI), `@hyperframes/core` (analizadores, linter, runtime), `@hyperframes/sdk` (motor
  de edición sin interfaz: consultas, mutaciones, parches JSON, deshacer/rehacer, adaptadores de guardado),
  `@hyperframes/player` (componente `<hyperframes-player>`), `@hyperframes/engine` y `@hyperframes/producer`
  (captura con Puppeteer + FFmpeg), `@hyperframes/shader-transitions` (transiciones WebGL),
  `@hyperframes/studio` (editor visual) y despliegues en AWS Lambda y Google Cloud Run.
- **Línea de órdenes (lo útil para nosotros):** `init`, `add`/`catalog` (bloques y componentes), `preview`,
  `lint`/`check`/`validate`, `render` (`--format mp4|webm|mov|gif|png-sequence|hls`, `--workers`, `--variables`,
  `--batch`), `snapshot`, `inspect`, `keyframes`, `beats` y `audio` (ritmo y sonido), `transcribe`, `tts` (Kokoro
  local), `remove-background` (U²-Net local), `capture` (capturar una web), `present` (diapositivas con público
  sincronizado), `history` (deshacer cambios del proyecto) y `doctor`.
- **Animación por adaptadores:** CSS, WAAPI, Anime.js, Lottie, Three.js, TypeGPU, «HTML in canvas» y GSAP.
- **Linux arm64 (el A1):** Chrome for Testing no publica arm64; su Dockerfile oficial usa el headless-shell arm64
  de Playwright (`playwright-core@1.61.1`), porque el `chromium` de Debian falla en arm64 (issue #2039).
- **Telemetría ENCENDIDA por defecto** (PostHog), en la CLI y en los scripts de sus skills. En StarSeed va SIEMPRE
  apagada: `hyperframes telemetry disable` (escribe `telemetryEnabled: false` en `~/.hyperframes/config.json`, que
  respetan CLI y skills) y `HYPERFRAMES_NO_TELEMETRY=1` en todo servicio.

## 2. Licencias y límites (lo que decide cómo se integra)

| Pieza | Licencia | Qué hacemos |
|---|---|---|
| HyperFrames (CLI, core, sdk, player, engine, producer, shader-transitions) | Apache-2.0 | se integra |
| **GSAP** (lo usa `@hyperframes/studio`, la plantilla por defecto de `init` y varias skills) | GSAP Standard «no charge»: **prohíbe usarla en herramientas que permiten crear animaciones visuales sin código** o que compitan con el constructor visual de Webflow | nuestro editor visual **no** usa GSAP ni incrusta `@hyperframes/studio`; nuestras plantillas usan CSS/WAAPI, Anime.js (MIT), Lottie (MIT), Three.js (MIT) o Theatre.js (núcleo Apache-2.0). Una composición ajena con GSAP se abre, se reproduce y se renderiza, pero su animación GSAP no se edita en el editor visual (se ofrece convertirla). Coincide con la ficha `gsap` de la Protomolécula («solo-enlace») |
| MusicGen (música local de `hyperframes`) | pesos CC-BY-NC-4.0 | clase **personal**: nunca por defecto ni fuera de lo personal |
| Kokoro-82M (voz), U²-Net human-seg (quitar fondo), whisper.cpp (oír) | Apache-2.0 / Apache-2.0 / MIT | libres; la voz de los vídeos sale de la voz única de Astraura (`voz-voicestudio.md`) |
| Parakeet TDT v3 (oír) | CC-BY-4.0 | libre con atribución |
| Lyria (Google), biblioteca de música de HeyGen, render en la nube de HeyGen | servicios de terceros con cuenta | apagados por defecto; solo si la persona los activa con su propia cuenta |

## 3. Lo que ya quedó instalado y medido hoy

- **En la nube de Claude (contenedor):** CLI 0.8.172 + headless-shell; composición StarSeed SIN GSAP (animaciones
  CSS, `data-no-timeline`): lint 0 errores y render real de 3 s a 1280×720 y 24 fps → 72 fotogramas, 97 KB, en
  18,7 s con 2 núcleos y GL por software. Fotogramas comprobados a mano: la animación avanza.
- **Para nosotros (Claude Code de la Mac):** plugin `hyperframes@hyperframes` 0.8.173 con sus 21 skills, desde una
  copia recortada de 17 MB en `~/.starseed/plugins/hyperframes-plugin` (la Mac tiene 1,4 GB libres y el repo entero
  ocupa 419 MB), telemetría apagada. Para actualizarlo: el vigía (VST1018M) avisa y se re-sincroniza la copia.
- **Capacidad de render en el A1:** CLI 0.8.172 en `~/servicios/hyperframes` del usuario `starseed`, FFmpeg del
  sistema y el headless-shell arm64 de Playwright, con su archivo `entorno` (telemetría apagada). Prueba real: §6.

## 4. Cómo se fusiona en StarSeed

1. **Átomo «video-html» de la Protomolécula.** Una composición HyperFrames es un átomo más (`herramientaId:
   "hyperframes"`): entradas (texto, imágenes, audio, vídeo, datos, voz de Astraura), parámetros (duración,
   resolución, fps, calidad, formato, variables) y salidas (MP4/WebM/MOV/GIF/PNG/HLS). Convergen con los demás
   átomos por las aristas de la pizarra como manda `protomolecula.md` §3.3.
2. **Estudio de vídeo propio** (no el de HeyGen, por GSAP): `@hyperframes/sdk` abre la composición y aplica cambios
   como parches; `@hyperframes/player` da la vista previa; `lint` valida. Las `Operacion` y el dictado de la
   Protomolécula se traducen a mutaciones del SDK (texto, estilo, tiempos, recursos, variables, animación CSS/WAAPI).
3. **Servicio «hyperframes» en cada neurona que pueda** (`servicios/hyperframes/`, 127.0.0.1:4490, Node 22): salud,
   abrir/editar con el SDK, lint, servir el reproductor y la composición, y una cola de render con cancelación y
   topes. Lo controla `servicio-local.ts` como a ComfyUI u Ollama. Nunca escucha fuera de la máquina.
4. **Render donde haya recursos:** la bolsa de `apps-en-la-malla.md` elige la neurona (el A1 siempre encendido
   primero; la Mac de 8 GB solo para vista previa) y la petición viaja por el relé `capacidad.video.render`. Lo
   privado no sale de las neuronas de la persona.
5. **Dónde aparece** (como los demás widgets y ventanas): bloque en el lienzo universal (publicaciones, mensajes,
   páginas, grupos), ventana en la pizarra, widget en el escritorio y el dashboard, ventana flotante y capa
   mantenible sobre todo el sistema, y en los chats de Astraura con la herramienta de agente `video.componer`
   (Astraura escribe la composición sin GSAP, la valida, la muestra en el chat y la renderiza en la malla). En
   transmisiones, salida HLS a la estación.
6. **Edición en grupo en tiempo real:** cada parche del SDK se convierte en `ElementoSala` (id `elemento::propiedad`)
   y viaja con `fusionarEstados` y los roles de `sala.ts` (dueño, editor, comentarista, observador). Salas 2D
   (pizarra, escritorio, dashboard) y 3D/XR (el reproductor como pantalla dentro de `escena3d` y `xr`), en
   servidores públicos o privados según la sala.
7. **Se actualiza solo y sin romper:** versiones fijadas; el vigía detecta una nueva, la neurona la instala aparte,
   pasa `lint` + un render de prueba con 3 fotogramas de referencia y solo entonces cambia; si falla, se queda la
   anterior y lo dice.

## 5. Tareas (Ola 1018H, `cola-hyperframes-1018.json`)

| Bloque | Tareas |
|---|---|
| Fichas | A Protomolécula (hyperframes integrable; su Studio «solo-enlace» por GSAP) · B Biblioteca (vídeo) |
| Núcleo puro | C plantilla StarSeed sin GSAP + detector de adaptadores y licencia · D átomo «video-html» · E traducción de operaciones de la Protomolécula a mutaciones del SDK |
| Servicio | F rutas y salud del servicio · G cola de render con topes y cancelación · H cliente en `servicio-local.ts` · P servidor y arranque en las neuronas |
| Malla y salas | I `capacidad.video.render` por la malla · J parches del SDK ↔ `ElementoSala` |
| Superficies | K widget/ventana «Estudio de vídeo» (pizarra, escritorio, dashboard, flotante) · L bloque en lienzo y publicaciones · M herramienta `video.componer` de Astraura · N pantalla en salas 3D/XR |
| Actualización | O actualización segura con render de prueba |

Cada tarea toca como mucho 3 archivos y 120 líneas por archivo. Las escribe el enjambre; Claude dirige y verifica en
localhost (Protomolécula › Vídeo, pizarra, chat de Astraura).

## 6. Prueba real en el A1

Medido el 2026-10-18 a las 22:43 UTC en el A1 (Ampere Neoverse-N1, 2 núcleos, Node 22.23.3, FFmpeg de Ubuntu, headless-shell arm64 de Playwright 1.61.1): la misma composición de 3 s a 1280×720 y 24 fps → 72 fotogramas, 97,3 KB, **renderizada en 5,1 s** (7 s contando el arranque) con captura «BeginFrame» determinista. En el contenedor de la nube la misma prueba tardó 18,7 s (captura por capturas de pantalla). El A1 es, por tanto, la neurona de render por defecto. Composiciones largas, 1080p/4K, vídeo de entrada o muchos efectos: **sin medir**.
