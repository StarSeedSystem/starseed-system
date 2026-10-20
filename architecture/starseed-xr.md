# StarSeed XR · el OS en visores de realidad virtual y aumentada (contrato, 2026-10-10)

> Contrato de la función XR de StarSeed OS. Lo escribió el arquitecto XR a petición de Alex (2026-10-10).
> Núcleo puro ya escrito y probado en `src/lib/xr/` (19 módulos, 214 pruebas). La cola del enjambre que
> construye el resto es `cola-xr-1010x.json` (ids `XR1010A…`). Léelo ENTERO antes de tocar nada.

**Petición de Alex, tal cual:** que StarSeed OS sea instalable y usable en gafas de AR/VR de todo tipo (Meta Quest,
Steam/SteamVR) o en cualquier navegador/dispositivo con WebXR, que **se abra solo en su formato (VR o AR)**, detectado
e integrado; que **todo el sistema se vea en 3D con el mismo diseño, elementos, funciones y estilo**, con capas 3D de
menús dinámicos e interactivos, menús 3D completos con animaciones y transiciones autoadaptables; varias capas con la
calidad fijada sola según el aparato, totalmente usables en VR/AR; con la Protomolécula y Astraura incluidas en local con
todas sus herramientas; con comandos de voz como «crea un mundo virtual con estas características y funciones e invita
a este grupo de amigos» o «súbelo a la Biblioteca / a una estación / a una publicación / a un mensaje»; con acceso a
servidores de transmisión o actividad, públicos o privados, y controles configurables para crear herramientas con las
que construir entornos virtuales, también en pizarras o llamadas. «Entender el propósito y hacerlo MUCHO MEJOR que lo
descrito, realmente funcional y profesional.»

---

## 0 · Reglas que mandan (de `CLAUDE.md`; no se negocian)

1. **Editable sí, ejecutable no.** Un mundo es un DATO (`MundoSpec`, vocabulario cerrado, sin scripts), igual que la
   interfaz es `UiSpec`. Nada de `eval`, `new Function` ni import dinámico de código ajeno; lo de terceros solo en iframe
   con `sandbox`, WASM en un Worker o app nativa. La lógica que no cabe en el vocabulario la PROPONE la Protomolécula
   como candidato aislado que una persona acepta (`architecture/protomolecula.md` §8.2).
2. **Núcleo intocable** (`src/lib/nucleo/invariantes.ts`): salir siempre se puede (acción obligatoria `salir` y `menu-mano`,
   probada en `vinculos-xr.ts`), permisos visibles, datos honestos, deshacer.
3. **Privacidad (Ciberdelia, §3):** la cámara del passthrough NO sale del visor, jamás; el mapa de la habitación solo
   viaja entre cuentas de la propia persona y con su consentimiento (`privacidad.ts`, §3 k).
4. **Honestidad:** un botón sin efecto real no se pinta, se escribe «próximamente: <motivo>». Una capacidad se afirma por
   lo que concede `session.enabledFeatures`, nunca por la marca del aparato.
5. **Dependencias nuevas = palabra de Alex** (`CLAUDE.md` capas, §11). Son 7 directas (§1.3 y §3 n); la tarea `XR1010A` lleva
   `aprobacion: true` para que no entren sin su visto bueno.
6. **El layout raíz no carga motores pesados** (`CLAUDE.md`, «Publicar»): three/uikit/rapier/vrm/spark solo en el chunk de
   `/xr/os` (`next/dynamic` sin SSR). Al layout raíz solo sube el botón de entrada (ligero).
7. **Nada de `node:*` en código de cliente.** Claves solo por NOMBRE de variable. Migrar lo persistido al cambiar defaults
   (`sanearConfort` ya lo hace). Máximo 3 archivos y 120 líneas por tarea de la cola; añadir ≤30 líneas a un archivo grande
   existente; nunca reescribir uno entero.
8. **«Integrado no es aplicado»:** cada pieza termina con un `grep` que prueba que se usa fuera de su propia prueba.

---

## 1 · Investigación fechada (2026-10-10)

**Método y confianza.** Primaria = documentación del fabricante con su fecha, código fuente (IDL de WebKit, registro npm)
o el propio paquete. Secundaria = artículos de prensa o blogs. Lo que no pude confirmar con una primaria lo marco **no
verificado** y el diseño no depende de ello: el sondeo en el visor (`/xr/diagnostico`, §3 l) decide en tiempo de ejecución.

### 1.1 Por plataforma

| Plataforma | Qué se sabe (fuente y fecha) | Confianza | Huecos honestos |
|---|---|---|---|
| **Meta Quest** (Horizon OS; Quest 2/3/3S/Pro) | Meta Quest Browser/Horizon Browser usa Chromium (docs «Browser specifications», act. 2026-07-21; UA de ejemplo `OculusBrowser/39.2… Chrome/136`, «no es un contrato»). `immersive-ar` (passthrough) se pide sin feature; **`plane-detection` solo como `requiredFeatures`**; anclas con `createAnchor`, persistentes con `requestPersistentHandle` (máx. 8 por sitio, no se guardan en navegación privada) (docs «Mixed Reality», sin fecha). Capas: cilindro, equirect y cubo (`XRMediaBinding`); el ejemplo de Meta baja el uso de bus de ~50 % a ~24 % (docs «Layers», © 2026). PWA: la página «WebXR PWAs» (act. 2026-07-22) dice que se lanza directo en inmersivo llamando a `requestSession` al cargar, que **tocar el icono de la PWA cuenta como gesto de usuario** y que `window.getDigitalGoodsService` sirve para saber que se está dentro de una PWA. Empaquetado: `@meta-quest/bubblewrap-cli` 1.24.1, Node 18+, `bubblewrap init --manifest=<url> --metaquest`, modo `2D` o `immersive` (`horizonOSAppMode` en `twa-manifest.json`), `assetlinks.json` obligatorio (docs «PWA packaging», act. 2026-07-22). «Web Launch»: enlace `open_url` que manda una URL del móvil al visor (blog Meta, 2022-11-29). | Alta (docs de Meta con fecha) | **No encontré en Meta** hit-test, mesh-detection ni depth-sensing documentados para el navegador, ni `offerSession`: se piden como opcionales y se usa lo que conceda `enabledFeatures`. La página de manos (`webxr-hand-tracking`) no se pudo leer; consta como tema oficial en el índice de WebXR (act. 2026-07-21). **Publicar la PWA en la Horizon Store: no confirmado** (§1.4). |
| **Android XR** (Samsung Galaxy XR; Project Aura de Xreal) | Chrome en Android XR soporta Device API, AR, Gamepads, Hit Test, Hand Input, Anchors, Depth Sensing (estéreo, un mapa por ojo) y Light Estimation; permisos por dominio (mapeo 3D, cámara, cara/ojos/manos) que se piden uno a uno (developer.android.com/develop/xr/web, act. 2026-08-31). SDK de Android XR en Developer Preview 4 (mayo 2026). Xreal Project Aura: gafas por cable, 70°, a la venta antes de fin de 2026, acceso por el programa «Developer Catalyst» (9to5Google, 2026-05-19). | Alta (Google) / media (Aura) | La página **no lista Layers** ni WebGPU ni `offerSession`; no dice nada de publicar una TWA/PWA para visores en Google Play. Aura: la prensa no menciona WebXR. |
| **Apple Vision Pro** (visionOS) | WebXR **activado por defecto desde visionOS 2** (UploadVR, 2024-06-12): solo `immersive-vr`, **sin el módulo AR**. Entrada por mirada+pellizco con modo `transient-pointer` (WebKit, 2024-03-19; la lista de inputs está vacía hasta que pellizcas). | Alta para lo de 2024 | Una fuente secundaria (buildmvpfast, 2026-06-19) dice que Safari 26.2 permite WebGPU como backend dentro de WebXR, que no hay «Añadir a pantalla de inicio» y que visionOS 27 está en beta: **no verificado**. No asumir índices fijos de inputs (cambian respecto a Quest): se recorre `inputSources` por `targetRayMode`. El elemento HTML `<model>` (USDZ) existe en Safari 26 (secundaria). |
| **Pico** (4, 4 Ultra) | Wolvic, el navegador abierto de Igalia, lista Meta Quest, Pico, Magic Leap 2 y Huawei VR Glasses, y se pasa a Chromium (UploadVR, 2024-04-10: añade manos sin mando, módulo AR y capas). | Media | **No pude leer la documentación web de Pico** (la página devolvió solo el menú): su navegador nativo, sus funciones y la vía de publicación quedan **no verificados**. Vía segura hoy: Wolvic. |
| **SteamVR / PC** (Index, Vive, WMR, Quest Link) | Chrome desde la 81 usa OpenXR en Windows para `immersive-vr`; hace falta SteamVR ≥ 1.16.8 (o el runtime de Oculus ≥ 19 / WMR de Windows 10 1903) y que el runtime admita `XR_EXT_win32_appcontainer_compatible` (immersiveweb.dev/chrome-support). | Alta | Chrome en Windows da **VR, no AR**. Steam **no lista aplicaciones web puras**: no he encontrado ninguna vía de Valve para ello; lo que sí existe es un atajo (`chrome --app=<url>`) como «juego fuera de Steam» o un envoltorio nativo (§3 i). |
| **Steam Frame** (Valve) | Visor autónomo con SteamOS (Linux sobre ARM, Snapdragon 8 Gen 3, 16 GB); ejecuta APK de Android sin Google Play Services y Valve aceptará APK en Steam (UploadVR, 2025-11-12). | Media (anuncio) | El anuncio **no menciona WebXR** ni navegador. Fecha de venta y estado real hoy: no verificado. Sin camino comprobado; se decide con hardware. |
| **Magic Leap 2** | Navegador del sistema (sustituye al WebXR Viewer): `immersive-ar` e `immersive-vr`, manos, mandos, hit-test, planos, **`camera-access`** (única plataforma que lo ofrece) y capas proyección/quad. Límites: varias capas bajan los fps; **no se puede anclar una web al menú de inicio**; los permisos no se saltan (docs Magic Leap, 2025-11-11). | Alta | No lista anclas ni depth. |
| **Snap Spectacles** | Snap OS 2.0 (2025-09-15) trae un navegador con WebXR **solo AR**; la venta pública «Specs» se anuncia para 2026 (newsroom Snap). | Media | Sin requisitos de desarrollador ni instalación de web apps documentados. |
| **Android de mano** (ARCore) | Chrome 81+ con ARCore: `immersive-ar`, hit-test, `dom-overlay`, anclas, luz (immersiveweb.dev). Ya lo usa `use-sesion-xr.ts`. | Alta | — |
| **iPhone / iPad** | Safari no ofrece WebXR AR. | Alta | Alternativas: escena 3D en pantalla (modo `3d-pantalla`, ya existe) y, en el futuro, AR Quick Look con USDZ por objeto (no planificado). 8th Wall anunció su cierre en 2026 (sin fuente primaria leída): no depender de él. |
| **Gafas Xreal/Viture** (monitor externo) | Hacen de pantalla de un móvil/PC. | Media | Se tratan como 2D/3D en pantalla del aparato anfitrión. |

### 1.2 Funciones WebXR: qué cubre cada una y cómo se pide

| Función | Estado verificado | Cómo la usa StarSeed |
|---|---|---|
| `offerSession` / evento `sessiongranted` | **Extensión no estándar**: ausente en MDN (`XRSystem`), en el IDL de WebKit y en el explainer del grupo; A-Frame 1.6.0 (2024-05-23) la incorpora (`navigator.xr.offerSession`), @pmndrs/xr y Threlte la exponen (`offerSession`, `enterGrantedSession`). Un hilo de Needle (2023-03-16) cuenta que `sessiongranted` mantiene la VR al navegar entre páginas y que en Quest pudo fallar. | Se detecta **por la función** (`DatosNavegador.ofreceSesion`), nunca por marca. Si existe → `estrategia: "oferta-navegador"`; nuestro botón queda de respaldo. No se depende de ello. |
| Gesto de usuario | `requestSession` exige activación; excepción documentada: PWA instalada en Quest (tocar el icono). | `planificarEntrada`: solo `auto-al-abrir` en Quest instalada; en lo demás, botón universal. |
| `local-floor`, `bounded-floor` | Estándar; los pide casi todo. | Siempre `local-floor`; `bounded-floor` opcional. |
| `hand-tracking` | Quest (índice oficial de Meta), Android XR («Hand Input»), Magic Leap, Vision Pro (WebKit 2024). | Opcional siempre; 25 articulaciones **no salen del aparato** (`privacidad.ts`). |
| `layers` | Quest (cilindro/equirect/cubo), Magic Leap, Wolvic. **No** en Android XR ni confirmado en Vision Pro. | Solo para pantallas de vídeo/estación (`capas.capasWebXR`); sin capas, textura de vídeo en malla. |
| `anchors` | Quest (con tope de 8 persistentes), Android XR, Magic Leap no listado. | Opcional; sirve para recordar dónde colgó la persona su dock en AR. |
| `hit-test` | Android XR, ARCore, Magic Leap; Quest **no verificado**. | Opcional (colocar un mundo en AR). |
| `plane-detection` | Quest: **`requiredFeatures`**; Magic Leap sí. | Solo se pide como requerida si la persona elige «mundo AR con mi habitación»; si no, ni se pide. |
| `mesh-detection` | Quest **no verificado**. | Opcional, nunca imprescindible. |
| `depth-sensing` | Android XR (estéreo); Quest **no verificado**. | Opcional (oclusión futura, fase 7). |
| `dom-overlay` | ARCore (móvil). No en visores. | Solo en AR de mano (ya lo hace `use-sesion-xr.ts`). |
| `light-estimation` | ARCore, Android XR. | Opcional. |
| `camera-access` | Solo Magic Leap. | **No se pide nunca.** Hay una prueba que lo vigila (§3 k). |
| WebGPU en XR (`XRGPUBinding`) | Existe el explainer del grupo (sin estado ni versiones); Chrome 146 (feb 2026) trae WebGPU, pero que `XRGPUBinding` esté habilitado **no verificado**. | three sigue en WebGL2 dentro de XR; WebGPU solo en pantalla. Se reevalúa en fase 7. |
| `supportedFrameRates` / `updateTargetFrameRate`, foveación | API estándar en navegadores de visor; @pmndrs/xr expone `frameRate`, `foveation` y `frameBufferScaling`. | `calidad.ts` pide `refrescoPreferidoHz` ∈ lo soportado y baja la foveación al subir de nivel. |
| Temperatura | **No existe API web.** | Se infiere de fotogramas sostenidos; batería (`getBattery`) y `deviceMemory` solo Chromium. |

### 1.3 Librerías (npm, consultado el 2026-10-10)

| Paquete | Versión exacta | Licencia | Modificado | Decisión |
|---|---|---|---|---|
| `@react-three/xr` | **6.6.31** | MIT (texto en `LICENSE`, © 2024 Bela Bohlender; el campo npm dice «SEE LICENSE») | 2026-09-28 | **Usar.** `createXRStore`, `offerSession`, `enterGrantedSession`, `foveation`, `frameRate`, `frameBufferScaling`, capas, manos y mandos. Trae `@pmndrs/xr`, que depende de `iwer ^2.1`, `@iwer/sem ~0.2.5` y `@iwer/devui ^1.1.1`. **`emulate` por defecto es `"metaQuest3"` en localhost: en producción va `emulate: false`.** |
| `@react-three/uikit` | **1.0.76** (trae `@pmndrs/uikit` 1.0.76) | MIT (mismo autor y texto) | 2026-09-01 | **Usar.** Interfaz flexbox (Yoga) en 3D con texto MSDF; `panelMaterialClass` permite un material propio (el cristal de `tokens-3d.ts`). Trae `zod ^4` (el repo usa `^3.24`: queda anidado, vigilar el tamaño). |
| `detect-gpu` | **5.0.70** (ya llega por `@react-three/drei`; se fija directo) | MIT | 2025-02-26 | **Usar solo fuera de visores autónomos** (en ellos la GPU es siempre la misma familia y su tabla se queda corta). Descarga sus datos de un CDN: copiarlos a `public/` o pedir permiso. |
| `@dimforge/rapier3d-compat` | **0.21.0** | Apache-2.0 | 2026-09-25 | **Usar directo** (WASM embebido). **No** `@react-three/rapier` 2.2.0 (fija rapier 0.19.2, exige React 19 exacto y envuelve lo que necesitamos controlar a mano). El repo ya tiene la 0.12.0 anidada por `@types/three`. |
| `@pixiv/three-vrm` | **3.5.5** | MIT | 2026-07-09 | **Usar** para avatares `vrm*` (lazy). |
| `@sparkjsdev/spark` | **2.3.1** | MIT | 2026-10-01 | **Usar** para splats gaussianos (`three >=0.180`, el repo tiene `^0.182`). El anterior `@mkkellogg/gaussian-splats-3d` 0.4.7 (MIT) está parado desde enero de 2025. |
| `iwer` | **2.5.0** (dev) | MIT | 2026-09-24 | **Usar en pruebas.** Emulación de WebXR (Meta Quest 2/3/Pro, Quest 1, mandos Touch). **NO** añadir `@iwer/sem` 2.5.0 ni `@iwer/devui` 2.x directos: arrastran un `three ^0.184` propio. |
| `three` / `@react-three/fiber` / `@react-three/drei` | ya instalados (0.182 / 9.x / 10.7.7) | MIT | — | Se quedan. three actual en npm: 0.186.1; no se sube en esta ola. |

**Riesgo conocido de dependencias.** `@iwer/devui` 1.1.1 y `@iwer/sem` 0.2.5 (que `@pmndrs/xr` arrastra) traen `three ^0.165`, `react 18.3.1` y `react-dom 18.3.1` como dependencias duras: npm los dejará anidados. Mientras `emulate` esté en `false` y el chunk XR sea perezoso no deberían entrar en el paquete de producción, pero **se mide** (tarea `XR1010AL`): si aparecen, se alias­an a un módulo vacío en `next.config.ts` fuera de desarrollo.

### 1.4 Horizon Store y PWAs: lo que SÍ está comprobado y lo que no

- Comprobado: empaquetar una PWA en un APK para Quest con Bubblewrap y **sideloadearlo** (`adb install`), con `assetlinks.json`
  (si falla la verificación, una PWA inmersiva no arranca). Dos modos: `2D` (ventana) o `immersive` (directo a WebXR).
- Comprobado: la página «Upload and submit» (act. 2026-05-08) describe subir y enviar una app Android firmada al Developer Dashboard
  («Submit for Review»; **enviar con al menos dos semanas de antelación**; las apps 2D usan un subconjunto de los VRC y
  se rechazan si piden permisos restringidos). **No menciona PWAs.**
- **No confirmado:** que se pueda *listar* una PWA en la Horizon Store hoy. Un empleado de Meta contestó en el foro
  (sin fecha, «hace 1 año») que «el envío de PWAs aún no es posible», aunque Connect 2024 dijo lo contrario. Alex debe
  comprobar en el Developer Dashboard si al crear la app aparece la casilla de PWA (§3 i, paso 5).

### 1.5 Lo que NO existe o NO funciona (para no prometerlo)

1. **No hay API web para pintar HTML arbitrario dentro de una sesión inmersiva** (`vr-frame.tsx` ya lo dice). El `dom-overlay` solo
   existe en AR de mano. Por eso el OS en 3D es *re-renderizado* (§3 b), no una captura de las páginas.
2. **WebXR AR no existe en Safari/iOS ni en Vision Pro** (solo VR en este último).
3. **No hay API de temperatura** ni forma web de leer el uso de GPU.
4. **No hay cámara en bruto** en la web (salvo `camera-access` de Magic Leap, que no usamos): no se hace reconocimiento de objetos de la habitación.
5. **Steam no admite webs puras**: SteamVR por Chrome sí; la tienda requiere envoltorio nativo (no está en la cola).
6. **Capas WebXR no están en Android XR ni confirmadas en Vision Pro:** el diseño funciona sin ellas.
7. **Resolución en caliente:** cambiar el factor de escala del framebuffer a mitad de sesión obliga a recrear la capa de render
   (parpadeo). Se guarda el nivel y se aplica en la sesión siguiente; en caliente solo se mueven foveación, fps y la escena.
8. **El botón del menú/logo y el pellizco de palma hacia ti** son del sistema del visor y no llegan a la página (`GESTOS_RESERVADOS`).
9. **Publicar en tiendas** (Horizon, Pico, Steam, App Store, Play) es trabajo de Alex con sus cuentas (§3 i).

---

## 2 · Mapa de lo que ya existe

### 2.1 Se reutiliza tal cual

| Pieza | Para qué en XR |
|---|---|
| `src/lib/xr/**` (este contrato) | Núcleo puro: capacidades, calidad, Trinity espacial, MundoSpec, voz, tokens, transiciones, confort, privacidad, vínculos. |
| `src/lib/salas/{sala,sincronia-sala,plantillas-sala}.ts` | Roles (`dueno/editor/comentarista/observador`), `elegirTransporte` (privado prefiere servidor privado o malla), fusión determinista con lápidas, plantillas. |
| `src/lib/vivo/escena3d.ts`, `src/lib/vivo/xr.ts` | `crearVivoXr`, `crearVivoEscena3d`, `concederAccesoEscena(refId, userIds, permiso)`, `cambiarPublicoEscena`, `deshacerCreacionEscena`, `rutaSalaXr`, `rutaSalaLlamada`. |
| `src/lib/vivo/espacial/{modelo,canal,sesion,fusion,avatares,persistencia}.ts` | `DocEscena` (objetos con lápidas, límite 400), `ConexionEscena` (hoy Supabase Realtime, poses a 10 Hz), sesión, avatares. |
| `src/lib/network/webrtc-mesh.ts` (`createMesh`, `SignalTransport`), `par-signaling.ts`, `architecture/transporte-universal-sin-internet.md` | Base del adaptador P2P (§3 h). |
| `src/lib/protomolecula/*` (`dictado.ts`, `vinculos-control.ts`, `parametros.ts`, `permisos.ts`) | Dictado de parámetros y vínculos de mando; `gatilloAFuente` los puentea. |
| `src/components/layout/dock-config.ts` (`DOCK_PRESETS`, `loadDockConfig`), `src/components/dashboard/apps/app-catalog.ts` | Son LAS MISMAS apps del dock en 2D y en 3D: el dock 3D lee estos datos. |
| `src/lib/aurora/*`, `src/components/aurora/{aurora-orb,aurora-provider}.tsx`, `src/lib/aurora/stt-oss/vibeasr-local.ts` | Estado del orbe, voz y reconocimiento; no se duplican. |
| `src/lib/nucleo/ui-spec.ts` (`UiSpec`, `validarUiSpec`) | Cualquier página declarada como `UiSpec` se puede pintar en 3D (§3 b). |
| `public/manifest.webmanifest`, `src/styles/starseed-materials.css`, `design-system/starseed-system/MASTER.md` | Instalación y estilo; `tokens-3d.ts` espeja los colores. |
| `src/components/xr/xr-network-hub.tsx` (ruta `/xr`) | Hub 3D de la red; se mantiene como está. |

### 2.2 Se fusiona o se migra (sin romper su API)

| Hoy | Problema | Plan |
|---|---|---|
| `use-sesion-xr.ts` (153 l.), `dashboard/apps/immersive/use-webxr.ts` (179), `canvas/xr-view.tsx` (469), `browser/vr-frame.tsx` (214) | Cuatro formas distintas de llamar a `requestSession`, cada una con su mensaje de error y sus `optionalFeatures`. | Un solo almacén (`almacen-xr.ts`). Los hooks viejos conservan su API y pasan a delegar (≤30 líneas cada uno), una tarea por archivo, solo cuando el almacén esté probado. |
| `src/lib/vivo/xr.ts#plataformaDe` (5 plataformas) | Se solapa con `capacidades.ts#plataformaDeDatos` (10). | `plataformaDe` delega en el nuevo (tarea `XR1010AK`). |
| `components/vivo/espacial/rendimiento.ts#leerPerfil` (eco/reducido) | Calidad ad hoc de 2 estados. | Su salida alimenta `PerfilDispositivo` (`nucleos`, `memoriaGB`). |
| `XREntryButton` (enlace a `/xr`) | Solo navega. | Se queda para navegar al hub; el botón universal nuevo es el que abre sesión de verdad. |
| `DocEscena` (colaborativo) y `MundoSpec` (declarativo) | Dos modelos de «mundo». | **Decisión:** UNA entidad `vivo` (singularidad, §6 de `CLAUDE.md`) con dos capas: `doc` (`DocEscena`, lo que se edita en colaboración, con lápidas) y `mundo` (`MundoSpec`, que fija el dueño/editor y se fusiona entero por versión). Adaptador `mundo → doc` para el lienzo 2D existente (pierde portales/reglas/zonas, que quedan en `mundo`). |

### 2.3 Sobra o está sin uso (candidatos, NO se tocan sin la palabra de Alex)

`dashboard/widgets/gen2/immersion-portal-widget.tsx` (232 l.) no tiene importadores fuera de pruebas (grep 2026-10-10);
`components/canvas/xr-view.tsx` solo lo importa `canvas-board.tsx`. Se evalúan cuando los hooks viejos delegan.

---

## 3 · Contrato (a)–(o)

Módulos del núcleo (todos puros, `src/lib/xr/`, ≤ 200 líneas por archivo, probados con `npx vitest run src/lib/xr`):

| Módulo | Qué da |
|---|---|
| `tipos.ts` | `ModoXR` (`2d`, `3d-pantalla`, `vr-inmersivo`, `ar-passthrough`, `ar-mano`), `NivelCalidad`, `PlataformaVisor`, `EntradaXR`, `FuncionXR`, `Vec3`, utilidades. |
| `capacidades.ts` | `evaluarCapacidades`, `plataformaDeDatos`, `modeloQuest`, `FUNCIONES_ESPERADAS`, `refinarFunciones`, `planificarEntrada`. |
| `calidad.ts`, `calidad-perfiles.ts` | `nivelInicial`, `siguienteCalidad` (histéresis, `AJUSTES`), `PERFILES`, `perfilDeNivel`, `refrescoInferior`. |
| `espacio-trinity.ts` | `disponerTrinity`, `posicionesDock`, `debeRecentrar`, `normalDePanel`. |
| `tokens-3d.ts`, `transiciones.ts` | Colores y cristal; `paramsMaterial`, `planTransicion`, `evaluar`, `retardoDeHermano`. |
| `mundo-spec.ts` (+ `mundo-tipos/reglas/saneo`) | `validarMundo`, `costoMundo`, `adaptarANivel`, `LIMITES`. |
| `intenciones-voz.ts` (+ `-tipos/-ref/-destinos/-clausulas`) | `entenderVoz`, `elegirCandidato`, `tarjetaDe`, `capaDe`, `saleDeLaCuenta`. |
| `confort.ts`, `privacidad.ts`, `vinculos-xr.ts` | Accesibilidad saneada; política de datos; mapas de entrada reconfigurables. |

### (a) Trinity espacial

La Trinity (`CLAUDE.md` §7) se despliega alrededor de la persona, en metros (eje y arriba, -z al frente, origen en el suelo,
referencia `local-floor`). `disponerTrinity({alturaOjos, postura, manoDominante, modo, yawBase, escala, techo})`:

| Nodo | Dónde (de pie / sentado / una mano) | Contenido |
|---|---|---|
| **Zenith** (norte) | 1,8 / 1,6 / 1,2 m, elevación 24° / 20° / 16° | Astraura: orbe, conversación, tarjeta de confirmación de voz. |
| **Horizon** (oeste) | azimut −48° / −42° / −30°, elevación −2° / −4° / −4° | Creación: mundos, Protomolécula, Biblioteca, destinos (estaciones, servidores, grupos). |
| **Logic** (este) | azimut +48° / +42° / +30° | Control: calidad, confort, vínculos, privacidad, conexiones, ajustes. |
| **Anchor** (sur) | dock curvo a la cintura (−0,55 / −0,40 m de los ojos, radio 0,62 / 0,58 / 0,50 m) | Dock de apps (las del dock 2D) y accesos rápidos. |
| **Menú de mano** | en la muñeca de la mano NO dominante | Recentrar, salir, voz, calidad, dock. Con manos se abre con **palma hacia la cara** (`cosenoPalma`), nunca con el pellizco de palma, que es del sistema. |

- Los cardinales **no se espejan para zurdos**: Horizon es siempre el oeste. Lo que cambia con la mano dominante es el menú de la muñeca.
- Objetivos: ≥ 3 cm para tocar con dedo (`OBJETIVO_MIN_TACTO_M`), ≥ 2° con rayo (`OBJETIVO_MIN_RAYO_DEG`), texto ≥ 1° (`TEXTO_MIN_DEG`; `altoMinimoTexto`).
- En postura de una mano, los nodos laterales se agrupan en pestañas (`agrupadoCon`). Dos capas de profundidad: `cercana` y `media`.
- Se recentra al entrar y cuando `debeRecentrar(yawCabeza, yawBase, segundosFuera)` lo pide o la persona dice «recentra».
- En AR, `opacidadMinima` garantiza lectura sobre cualquier habitación (§b).

### (b) Mismo estilo 3D, menús, animaciones y cómo se pintan las páginas 2D

**Tokens, no colores a mano.** `tokens-3d.ts` espeja `starseed-materials.css`: `COLORES_NODO` (Zenith `#007FFF`, Horizon `#10B981`/`#39FF14`,
Logic `#D4AF37`/`#FFBF00`, Anchor `#DC143C`) y `CRISTAL` (fondo `#0E101E` al 62 %, borde blanco 14 %, texto `#F5F7FF`). `paramsMaterial(material, nodo, opciones)`
devuelve la clase y los parámetros de three; quien pinta no escribe un color.

**El cristal líquido tiene un equivalente barato por nivel** (la transmisión de three cuesta una pasada extra de render, impagable en un visor autónomo):

| Nivel | Material | Qué es | Coste |
|---|---|---|---|
| mínima | `plano` | `MeshBasicMaterial` al 94 % + borde de acento | 0 |
| baja | `translucido` | `MeshBasicMaterial` translúcido | 1 |
| media | `vidrio-entorno` | `MeshStandardMaterial` con mapa de entorno | 2 |
| alta | `transmision-media` | `MeshPhysicalMaterial`, transmisión 0,9 a media resolución | 3 |
| máxima | `transmision-completa` | `MeshPhysicalMaterial`, transmisión 1, dispersión 0,2 | 4 |

«Reducir transparencias» fuerza `plano` y «contraste alto» sube la opacidad a ≥ 0,92 con borde grueso. **Legibilidad probada:** el texto sobre el cristal por defecto
cumple 4,5:1 incluso con una habitación blanca detrás (`opacidadMinimaParaTexto`); el segundo fondo (42 %) **no** sirve para texto y no se usa para ello.

**Menús 3D completos** (todos con entrada, foco, despliegue, cambio de capa, confirmación y salida): dock curvo (Anchor), menú de muñeca, orbe y conversación de Astraura (Zenith),
paleta de creación y destinos (Horizon), panel de sistema con calidad/confort/vínculos/privacidad (Logic), menú contextual al apuntar a un objeto (pulsación larga) y pila de avisos.

**Animaciones y transiciones autoadaptables.** `planTransicion(evento, estilo, {movimientoReducido, escalaDistancia})` con los eventos `entrada`, `salida`, `foco`, `desfoco`, `despliegue`,
`pliegue`, `cambio-capa`, `confirmar`; estilos `minimas`/`normales`/`ricas` que salen del nivel de calidad (`PerfilCalidad.transiciones`). Reglas duras de confort, probadas:
nada se desplaza más de **25 cm** ni a más de **1,5 m/s**, ninguna secuencia escalonada pasa de **700 ms** (`retardoDeHermano`), y con movimiento reducido solo hay fundidos de ≤ 120 ms sin desplazamiento ni escala.

**Cómo se pintan las páginas 2D en 3D (honesto, en cuatro escalones):**

1. **Nativo 3D** para lo esencial (dock, Astraura, ajustes, mundos, pizarra, llamada): se escribe en uikit con los mismos datos que el 2D.
2. **`UiSpec` → uikit** (`uispec-uikit.tsx`): cualquier página declarada como `UiSpec` (vocabulario cerrado) aparece sola en 3D.
3. **Pantallas** (`PantallaMundo.fuente`): una estación, una llamada o una app *emitida desde otro aparato* se ven como vídeo en una malla o, con capas (Quest), en una capa de medios; las de `https` solo se muestran si son vídeo/imagen o un `iframe` permitido fuera de la sesión.
4. **«Abrir en ventana 2D»:** lo que aún no tiene vista 3D lo dice con una tarjeta («esta app todavía no tiene vista 3D») y ofrece salir de XR para abrirla; nunca finge.

### (c) Detección y entrada automática

Tubería: `sondearNavegador()` (cliente: UA, `isSecureContext`, `navigator.xr`, `isSessionSupported('immersive-vr'|'immersive-ar')`, `typeof navigator.xr.offerSession`, táctil, WebGL2, WebGPU,
`display-mode: standalone`, `getDigitalGoodsService`) → `DatosNavegador` → `evaluarCapacidades` → `planificarEntrada(c, {instalada, gesto})`:

| Estrategia | Cuándo | Qué pasa |
|---|---|---|
| `auto-al-abrir` | PWA instalada en Quest (tocar el icono es el gesto, según Meta) | Entra directo en `/xr/os?modo=…`, sin página 2D intermedia. Si el navegador lo rechaza, cae al botón. |
| `oferta-navegador` | `navigator.xr.offerSession` existe | `store.offerSession`/`enterGrantedSession` de @pmndrs/xr; nuestro botón queda de respaldo. |
| `boton-universal` | VR/AR disponible, sin lo anterior | Botón «Entrar en VR» / «Entrar en AR» (o ambos). Requiere un toque: el navegador no deja otra cosa. |
| `solo-pantalla` | iPhone, escritorio sin visor | Escena 3D en pantalla (`3d-pantalla`) y botón de VR/AR solo si algún modo inmersivo es posible. |

- **«Se abre en su formato»:** VR en Quest, Pico, Vision Pro y PC-VR; **AR (passthrough)** en Quest 3/3S/Pro cuando la persona o el mundo la piden; AR de mano en Android con ARCore; pantalla en lo demás. El modo recomendado lo da `capacidades.recomendado`; el último elegido se recuerda en `localStorage` (solo comodidad).
- **Instalado + atajos:** `manifest.webmanifest` gana `shortcuts` («Entrar en VR» → `/xr/os?modo=vr`, «Entrar en AR» → `/xr/os?modo=ar`). «Web Launch» de Meta permite mandar el enlace del móvil al visor.
- **Errores** con mensaje humano (`mensajeErrorXR`): sin https, sin gesto, permiso denegado, otra sesión abierta.
- **Salir:** siempre hay una forma (acción obligatoria `salir`, también por voz «salir»); al acabar la sesión (`sessionend`), vuelta a 2D con el estado intacto.
- **`emulate: false` en producción.** El emulador de @pmndrs/xr solo existe en desarrollo y con `?emulador=1`.

### (d) Calidad automática y dinámica

1. **Inicial:** `nivelInicial(PerfilDispositivo)` parte de la plataforma (Quest 2, Pico, Vision Pro, Android XR, escritorio…) y suma o resta por modelo (Quest 3 +1; Quest 1 y 2 −1), memoria ≤ 3 GB (−1), batería < 20 % sin cargar (−1) y `termica` (−1 «serious», −2 «critical»). `detect-gpu` (`gpuTier`) cuenta **solo fuera de los visores autónomos**.
2. **Dinámica con histéresis** (`siguienteCalidad`, `AJUSTES`): 2,5 s de gracia al empezar; se baja tras 1,2 s sobre 1,08× el presupuesto del fotograma (0,5 s si es urgente); se sube tras 10 s por debajo de 0,62×; cerrojos de 20 s tras bajar y 30 s tras subir; tras 3 bajadas, 120 s sin subir. Bajar es rápido y subir lento, para no oscilar.
3. **Qué se mueve en caliente:** foveación, `updateTargetFrameRate` (`refrescoInferior` busca el siguiente soportado), sesgo de LOD, partículas, sombras, material del cristal, avatares, audio, pasos de física, jugadores visibles. **Qué NO:** la escala de resolución (se aplica en la sesión siguiente).
4. **Niveles** (`PERFILES`):

| Nivel | Resol. | Foveación | MSAA | Sombras | Luces | Jugadores | Avatar | Audio | Física (Hz / cuerpos) | Hz | Transiciones |
|---|---|---|---|---|---|---|---|---|---|---|---|
| mínima | 0,70 | 1,0 | 0 | no | 1 | 4 | orbe+manos | estéreo | 30 / 20 | 72 | mínimas |
| baja | 0,85 | 0,8 | 0 | no | 2 | 8 | cabeza+manos | panner | 45 / 60 | 72 | normales |
| media | 1,00 | 0,5 | 2 | 1024 | 3 | 12 | VRM ligero | HRTF | 60 / 150 | 72 | normales |
| alta | 1,15 | 0,3 | 4 | 2048 | 5 | 24 | VRM | HRTF | 60 / 300 | 90 | ricas |
| máxima | 1,30 | 0 | 4 | 4096 | 8 | 48 | VRM completo | HRTF | 90 / 600 | 120 | ricas |

5. **La persona manda:** «Auto» o un nivel fijo en Logic; el aviso de cambio es breve y dice por qué («bajé a Baja: fotogramas lentos»).
6. **Capas WebXR** (`capasWebXR`, niveles media+): solo para vídeo/estación; el resto es malla. El posproceso (bloom) solo en pantalla: en XR copia el búfer del visor.

### (e) Entrada

`vinculos-xr.ts`: 11 acciones (`seleccionar`, `agarrar`, `menu-mano`, `abrir-dock`, `recentrar`, `salir`, `hablar`, `teletransporte`, `giro-izquierda`, `giro-derecha`, `atras`) y un mapa por forma de entrada
(`mandos`, `manos`, `mirada-pellizco`, `teclado-raton`, `gamepad`, `tactil`, `voz`), todos reconfigurables desde Logic con `asignar`/`validarMapa`:

- Se prueba que **todos los mapas por defecto son válidos**, que `salir` y `menu-mano` existen siempre y que no hay dos acciones con el mismo gatillo; reasignar un gatillo ocupado se lo quita a la otra **y lo dice**.
- `GESTOS_RESERVADOS = ["pellizco-palma"]` no se puede reasignar (es del menú del sistema de Quest).
- Mandos `xr-standard`: botón 0 gatillo, 1 empuñadura, 3 stick pulsado, 4 A/X, 5 B/Y, ejes 2–3. Los botones de menú/logo no llegan a la página.
- **No se fijan índices de inputs** (Vision Pro los pone distinto): se recorre `inputSources` por `targetRayMode` (`tracked-pointer`, `gaze`, `screen`, `transient-pointer`).
- Manos: rayo desde `targetRaySpace` con pellizco; tocar a < 3 cm; palma hacia la cara abre el menú. Mirada+pellizco (Vision Pro) y táctil (AR de mano) son entradas de primera clase.
- `gatilloAFuente` convierte un botón/eje de mando en la `FuenteControl` de gamepad de la Protomolécula (índice 0 = izquierda, 1 = derecha): el mismo «aprender» y las mismas curvas sirven en el visor.
- Locomoción: teletransporte por defecto; giro por saltos (`siguienteGiro`); caminar continuo solo si la persona lo activa.

### (f) Voz con Astraura y tarjeta de confirmación

Tubería: pulsar «hablar» (o decir «Astraura») → micrófono → reconocimiento (1: `SpeechRecognition` donde exista, el mismo que usa `aurora-provider.tsx`; 2: el oído local `transcribirLocal`/VibeASR de la neurona;
3: WASM en el aparato, futuro) → `entenderVoz(frase, ctx)` → `ResultadoVoz`:

- **Capas** (`capaDe`): *reflejo* (Needle, siempre encendida) entiende las órdenes cerradas; *razón* solo cuando hay creación libre («un bosque con luciérnagas»); la web lleva solo el reflejo local y la razón la presta la neurona o el enrutador gratis-primero (`architecture/capas-autoadaptables.md`). El orbe muestra qué capa respondió.
- **Nunca se adivina** un grupo, una persona ni un destino: «este grupo» sin nada señalado pregunta («No hay grupo señalado. Míralo con el puntero y repite, o dime su nombre») y ofrece candidatos. Probado.
- **Tarjeta de confirmación 3D** (`tarjetaDe`) a 1,2 m con `confirmar` / `cambiar` / `cancelar` (también por voz). **Todo lo que sale de la cuenta pide confirmar** (`saleDeLaCuenta`): invitar, publicar, mandar un mensaje, subir a una estación. Guardar en la Biblioteca propia no.
- **Frases y su efecto real:**

| Frase | Intención | Ejecución (`ejecutor-*`) |
|---|---|---|
| «Crea un mundo virtual con cielo de noche y gravedad cero y mesas flotantes e invita a este grupo de amigos» | `crear-mundo` (+ `editar-mundo` cielo/gravedad) + `invitar` | `crearVivoXr` + `MundoSpec` (reflejo para lo cerrado, razón para lo libre, validado por `validarMundo`) → tarjeta → `concederAccesoEscena` para los miembros del grupo señalado |
| «Súbelo a la Biblioteca» | `subir` → `biblioteca` | Guarda la entidad (sin confirmar; es tuya) |
| «Súbelo a la estación Cumbre» / «a una estación nueva» | `subir` → `estacion` | `src/lib/estaciones` (`crearSesionEnVivo` si es nueva); confirma |
| «Publícalo para mi grupo» / «para todo el mundo» | `subir` → `publicacion` (`yo`/`grupo`/`publica`) | Publicación; **confirma siempre**; público = `mundo-spec` a `sala-publica` exige consentimiento (`privacidad.ts`) |
| «Mándalo a Ana y a Luis» | `subir` → `mensaje` | Mensajería; confirma |
| «Llévame a la estación Cumbre» | `ir-a` | Portal/estación/servidor (§3 h) |
| «Abre una pizarra con Ana» / una llamada | `abrir` | Pizarra o `rutaSalaLlamada` |
| «Recentra» / «salir» / «ayuda» / «silencia» | `sistema` | Inmediato |

- **Reparto con la Protomolécula:** primero `entenderVoz`; si responde «no entendido» y hay una molécula con foco, el dictado de parámetros (`src/lib/protomolecula/dictado.ts`, valor exacto o relativo) toma la frase; si no, se pregunta.
- Si la razón propone un `MundoSpec` inválido, se le devuelve **una vez** la lista de problemas (`validarMundo` explica cada uno y cómo arreglarlo); si sigue mal, se muestra a la persona. Un mundo creado se puede **deshacer** (`deshacerCreacionEscena`).

### (g) Mundos: `MundoSpec`

Un mundo es un dato (`version 1`, `tipo "mundo-xr"`): `entorno` (cielo, terreno procedural por `semilla`, tamaño), `fisica` (gravedad), `interaccion` (quién toca/agarra), `spawns`, `luces`, `objetos` (primitivas, modelo `glb`, `splat`, imagen, audio, avatar VRM de la Biblioteca; cuerpos `fijo`/`dinamico`/`cinematico`),
`portales`, `zonas` (con efecto: punto de reunión, escenario, audio privado, silencio, gravedad cero, zona segura), `pizarras`, `pantallas` y `reglas` («cuando X, entonces Y», ≤ 64 reglas, ≤ 6 acciones; **vocabulario cerrado, sin scripts ni expresiones**).

- **Límites por nivel** (`LIMITES`) y `costoMundo` → `nivelMinimo`; `adaptarANivel` recorta de forma explicada («se quitaron 12 objetos para este aparato») sin tocar el original.
- **Validación** (`validarMundo`): errores con la ruta, el motivo y cómo arreglarlo; URLs solo `https`; textos sin apariencia de código (`pareceCodigo`); referencias rotas descartan la regla.
- **Física:** Rapier directo (`@dimforge/rapier3d-compat`), tick a `PERFILES[n].fisica.pasosHz`, tope de cuerpos del nivel. La simulación es *local con autoridad*: la simula el anfitrión (menor id entre los conectados) y emite poses de los cuerpos dinámicos; los demás interpolan. Las reglas también las ejecuta el anfitrión (así `unaVez` no se dispara dos veces).
- **Splats** con Spark (niveles ≥ alta) y avatares VRM con `three-vrm`, ambos perezosos.
- **Persistencia:** la entidad única de §2.2. El 2D sigue viendo el `doc`.

### (h) Multijugador, servidores y estaciones como destinos

- **P2P primero.** Hoy el canal de escena (`ConexionEscena`) va por Supabase Realtime. Se añade `canal-p2p.ts` que implementa **la misma interfaz** sobre `webrtc-mesh.ts` (`createMesh`, `SignalTransport` por Supabase, LAN o malla), de modo que `use-sesion-escena` no cambia. Malla completa hasta **8 personas** (poses a 10 Hz: kilobytes); a partir de 9, hasta `LIMITES.jugadores`, se usa el canal de Supabase o un servidor propio. La elección sigue `elegirTransporte`: una sala privada prefiere servidor privado o malla **aunque haya internet**.
- **Datos por la red:** solo `pose-avatar`, `avatar`, `mundo-spec` y voz de sala (`privacidad.ts`); la pose es cabeza + manos + orientación, **no** las 25 articulaciones. Fusión determinista con lápidas (`fusionarEstados`).
- **Audio espacial:** Web Audio `PannerNode` HRTF (nivel media+; `panner` en baja; estéreo en mínima), oyente en la cabeza, efectos de las zonas (`audio-privado`, `silencio`).
- **Destinos.** Cada portal/`ir-a` apunta a un mundo, una estación en vivo, un servidor (público o privado, de `/servidores`) o una sala; el panel de Horizon los lista con su transporte, su rol (`RANGO_ROL`) y si se puede ver/editar/invitar (`puedeVer/puedeEditar/puedeInvitar`).
- **Pizarras y llamadas en 3D:** `PizarraMundo.salaId` enlaza una sala de tipo `pizarra` existente (fusión con lápidas, tope 5000 elementos), dibujada con el rayo; una llamada se abre con `rutaSalaLlamada(sesionId, modo)`.
- **Herramientas de construcción** (la parte «configurable»): el panel 3D de parámetros de la Protomolécula (deslizadores/diales sobre `Parametro`) y los mapas de §3 e hacen que cualquier herramienta de creación se controle a mano, con mando, con gesto o dictando, también sobre una pizarra o durante una llamada.

### (i) Instalación por plataforma: pasos exactos y qué solo puede hacer Alex

**Regla común.** Nada de esto publica nada solo: publicar en tiendas y abrir cuentas es de Alex.

1. **Meta Quest (2, 3, 3S, Pro).**
   - *Nivel 0 (sin cuentas, hoy):* en el Meta Quest Browser abrir `https://starseed-os.vercel.app/xr/os` y tocar «Entrar en VR/AR». Requiere que `/xr/os` esté publicado (publicar es decisión de Alex).
   - *Nivel 1 (PWA instalable por sideload):* cuenta de desarrollador de Meta y modo desarrollador en el visor. En su Mac: `npm install --global @meta-quest/bubblewrap-cli` · `bubblewrap init --manifest=https://starseed-os.vercel.app/manifest.webmanifest --metaquest` (elegir `immersive` para el paquete «StarSeed OS XR» con `start_url=/xr/os?modo=vr` y, si se quiere, un segundo paquete `2D` con `start_url=/`; identificadores únicos y para siempre, p. ej. `app.starseed.os` y `app.starseed.os.xr`) · la **misma** clave de firma para siempre · `keytool -list -v -keystore <ruta> -alias android` · `bubblewrap fingerprint add <SHA-256>` · publicar `https://starseed-os.vercel.app/.well-known/assetlinks.json` (lo genera Bubblewrap; **el SHA-256 no es secreto**: la cola puede añadir el archivo cuando Alex lo dé) · `bubblewrap build` · `adb install app-release-signed.apk` · abrir desde «Orígenes desconocidos» de la biblioteca. Si `assetlinks.json` falla, el paquete inmersivo no arranca. El script `scripts/xr/empaquetar-quest.sh` (cola `XR1010AH`) encadena estos comandos leyendo `STARSEED_QUEST_PACKAGE`, `STARSEED_QUEST_KEYSTORE` y `STARSEED_QUEST_SHA256` del entorno (nunca contraseñas en archivos).
   - *Nivel 2 (Horizon Store):* crear la app en el Developer Dashboard, completar metadatos, precio, y **Enviar a revisión con ≥ 2 semanas de antelación**. Antes, comprobar que el Dashboard ofrece PWA (§1.4); si no, la vía de tienda no existe todavía y se queda en sideload/Web Launch.
2. **Android XR (Galaxy XR; Aura cuando salga).** Abrir la URL en Chrome, aceptar los permisos por dominio (mapeo 3D, manos) y «Entrar en VR/AR». Instalar como PWA con el menú de Chrome. Sin publicación verificada para visores: no hay paso de Alex salvo la prueba.
3. **Apple Vision Pro.** Safari (visionOS 2 o superior): abrir la URL → «Entrar en VR». Solo VR, mirada + pellizco. No hace falta cuenta de desarrollador. Una app nativa o tienda exigiría el Apple Developer Program (no planificado).
4. **Pico 4 / 4 Ultra.** Navegador de Pico o **Wolvic** (Chromium); misma URL. Publicación web en la Pico Store: no verificada.
5. **SteamVR en Windows.** Chrome o Edge (≥ 81) con SteamVR (≥ 1.16.8) como runtime OpenXR activo: abrir la URL → «Entrar en VR». Para lanzarlo desde la biblioteca de Steam: añadir Chrome como «juego ajeno» con `--app=https://starseed-os.vercel.app/xr/os?modo=vr`. Listarlo en la tienda de Steam requeriría un envoltorio nativo y una cuenta de Steamworks: fuera de esta cola.
6. **Steam Frame.** Sin camino verificado (§1.1). Cuando haya hardware: probar un navegador Chromium en APK; si el APK acepta WebXR, el flujo es el de Pico.
7. **Magic Leap 2.** Navegador del sistema → URL → «Entrar en AR». No se puede anclar al menú de inicio.
8. **Snap Spectacles.** Navegador de Snap OS 2.0 → URL (solo AR).
9. **Android con ARCore.** Chrome → «Entrar en AR»; instalable como PWA.
10. **iPhone/iPad.** Escena 3D en pantalla + aviso honesto («Safari no ofrece AR web; usa un Android o un visor»).

**Solo Alex puede:** abrir las cuentas de desarrollador y verificarlas (Meta, y Apple/Steam/Google solo si quiere esas tiendas), generar y guardar la clave de firma, activar el modo desarrollador del visor, probar con el visor real, y decir sí a las dependencias (§0.5) y a publicar. El resto lo hace la cola.

### (j) Comodidad y accesibilidad

`confort.ts` (`sanearConfort` limpia lo persistido y avisa de lo corregido; `CONFORT_DEFECTO`): **giro por saltos de 30°** y **teletransporte** por defecto, viñeta automática (tope 0,85, nunca oscurece del todo), subtítulos de voz y de transmisiones, **movimiento reducido** (solo fundidos; fuerza saltos, viñeta y sin caminar continuo; se suma a la preferencia del sistema, nunca la anula), contraste alto, reducir transparencias, postura (de pie, sentado, una mano), mano dominante, escala 0,8–1,5, altura de ojos manual y tamaño mínimo del texto (1° por defecto). Uso a una mano completo (dock y menú agrupados). Todo por voz además de por gesto. Los valores viejos guardados reciben los nuevos por defecto (regla de propagación).

### (k) Privacidad

`privacidad.ts` es política como código (`POLITICA`, `evaluarSalida(dato, destino, ahora, consentimientos)`):

| Dato | Llega hasta | Con consentimiento |
|---|---|---|
| Cámara del passthrough | **el aparato** | **nunca más allá** |
| Mirada | el aparato | nunca más allá |
| Mapa de la habitación (planos, malla, anclas) | el aparato | sus mismas cuentas |
| Articulaciones de las manos, biometría, ubicación física | el aparato | sus mismas cuentas |
| Voz (audio) | el aparato | hasta sala pública, solo con el micrófono abierto a propósito |
| Voz (texto dictado) | su nube | a un modelo de terceros |
| Pose del avatar y avatar | cualquier sala | — |
| `MundoSpec` | su nube | sala pública (tarjeta de confirmación) |

Los consentimientos vencen (8 h por defecto, mínimo 1 min) y no valen para otro dato. `NUNCA_EN_REGISTROS` lista lo que no puede aparecer en un log, en la red ni en un informe de errores. **Guardias:** una prueba comprueba que ningún código pide `camera-access`; el canal P2P y el de Supabase pasan por `evaluarSalida` antes de enviar; el micrófono arranca en silencio en salas públicas.

### (l) Pruebas

1. **Núcleo puro** (hecho): `npx vitest run src/lib/xr` → 214 pruebas; `pureza.test.ts` vigila ≤ 200 líneas, sin APIs prohibidas y sin importar nada fuera de `./`.
2. **vitest + jsdom + IWER** (cola `XR1010AJ`): `new XRDevice(metaQuest3)` e instalar su runtime para probar sondeo, planificación, `requestSession`, `enabledFeatures` y errores **sin visor**; sin WebGL (jsdom no lo trae), así que se prueba la lógica y que el módulo se importa.
3. **Playwright + Chromium + IWER** (`scripts/xr/humo-iwer.mjs`): en esta caja **no hay binario de Chromium**; en la Mac se usa Chrome instalado (`channel: "chrome"`) para no descargar otro navegador (el disco manda). Comprueba que `/xr/os` pinta y entra con el runtime emulado.
4. **En el visor de verdad** — no hay emulación que lo sustituya: la página **`/xr/diagnostico`** (cola `XR1010AI`) corre dentro del visor y muestra `enabledFeatures`, `supportedFrameRates`, el nivel de calidad, el tiempo de fotograma, entradas detectadas, micrófono y un botón «Copiar informe». Depuración remota (Meta): activar el modo desarrollador, `adb devices`, `chrome://inspect/#devices`.
5. **Verificación visual:** solo Alex puede afirmar «se ve bien»; las tareas dicen «pasa tsc/vitest» y señalan `/xr/diagnostico`.

### (m) Fases honestas

Qué se podrá afirmar al final de cada una (sin plazos inventados):

| Fase | Entregable | Se podrá decir |
|---|---|---|
| 0 | Núcleo puro + este contrato (hecho el 2026-10-10) | Las decisiones están escritas y probadas sin visor. |
| 1 | Sondeo, almacén, botón universal, entrada global, `/xr/os` con la Trinity de cristal | «En un visor con WebXR hay un botón que entra y se ve la Trinity.» (a verificar por Alex) |
| 2 | Menús 3D, transiciones, mano, orbe, voz y ejecutores | «Dices la orden, ves la tarjeta, se crea y se invita de verdad.» |
| 3 | Render de mundos, reglas, física, zonas, pantallas, pizarras, avatares, splats | «Un mundo declarado se ve, se toca y se mueve.» |
| 4 | P2P, audio espacial, presencia, privacidad aplicada | «Dos aparatos se ven sin servidor de por medio.» |
| 5 | Calidad dinámica, confort aplicado, ajustes | «Se adapta solo y se puede cambiar todo.» |
| 6 | PWA/atajos, empaquetado Quest, diagnóstico, IWER, guardas | «Se instala y se puede probar en un visor real.» |
| 7 (sin encolar) | Android XR/Play, Steam envoltorio, oclusión con depth, WebGPU en XR, USDZ en iPhone, voz en WASM | Depende de hardware y de decisiones de Alex. |

### (n) Paquetes npm exactos (la tarea `XR1010A`, con `aprobacion: true`)

Instalar con `npm install --save-exact`; **7 directas** (6 de producción, 1 de desarrollo) y unas 20 transitivas:

```
@react-three/xr@6.6.31            MIT
@react-three/uikit@1.0.76         MIT   (trae @pmndrs/uikit@1.0.76)
detect-gpu@5.0.70                 MIT   (ya presente por drei; se fija directo)
@dimforge/rapier3d-compat@0.21.0  Apache-2.0
@pixiv/three-vrm@3.5.5            MIT
@sparkjsdev/spark@2.3.1           MIT
iwer@2.5.0                        MIT   (devDependency)
```

Comprobaciones obligatorias tras instalar: `npm ls three react react-dom` (aceptable: copias anidadas SOLO dentro de `@iwer/*`), `npm ls zod`, `npm ci --include=dev` limpio, `tsc` y `vitest` en verde. No añadir `@iwer/sem` ni `@iwer/devui` directos.

### (o) Decisiones

Tomadas aquí (con motivo): P2P antes que servidor; una entidad con dos capas; Rapier directo; `detect-gpu` solo en no-autónomos; nativo + `UiSpec` en 3D en vez de «capturar» la web; confirmación para todo lo que sale de la cuenta; reglas de mundo por vocabulario cerrado.

**Por decidir (de Alex):** (1) ¿sí a las 7 dependencias? (2) ¿Se persigue la Horizon Store o solo sideload + Web Launch hasta confirmar que acepta PWAs? (3) Identificadores de paquete definitivos (`app.starseed.os`, `app.starseed.os.xr`). (4) ¿Micrófono silenciado por defecto en salas públicas? (propuesto: sí). (5) ¿Se retira lo duplicado de §2.3 cuando los hooks viejos delegan?

---

## 4 · Cola del enjambre y continuación

- Archivo: `starseed_memory_root/olas/cola-xr-1010x.json` en la Mac (copia en `/mnt/user-data/outputs/colas/cola-xr-1010x.json`). **No se lanza sola**: Alex o el director de producción la lanzan.
- Ids `XR1010A…`, cada tarea ≤ 3 archivos y ≤ 120 líneas por archivo; la lógica va en funciones puras (probables sin WebGL) y los componentes R3F son cascarones. Las tareas que dependen de paquetes dependen de `XR1010A`; las de la Protomolécula, del núcleo de `architecture/protomolecula.md` (si aún no está en `main`, dejan su pieza y dicen `PENDIENTE-DE`).
- Contenido de la cola (verificado: JSON válido, 45 ids únicos, todas las dependencias existen, sin ciclos, 14 niveles): `A` dependencias (con `aprobacion`), `B`–`G` sondeo, prefs, almacén, botón, entrada global y `/xr/os`; `H`–`L` cristal, movimiento, rig Trinity, gestos y acciones; `M`–`T` dock, menú de mano, orbe, voz, tarjeta, ejecutores y flujo; `U`–`Z` motor de reglas, render, física, zonas, pantallas/pizarras y avatares; `AA`–`AG` P2P, audio, presencia, privacidad, calidad dinámica, comodidad y panel Logic; `AH`–`AL` PWA/Quest, diagnóstico, IWER, `plataformaDe` y guardas; `AM`–`AR` splats, UiSpec 3D, Horizon, Protomolécula 3D y migración de los hooks viejos; `AS` el montaje final que cablea todo (la única que vuelve a tocar `escena-os.tsx`). Sin dependencias de partida: `A`, `B`, `C`, `K`, `U`, `AA`. Se lanza con el orden de dependencias; `AL` (guardas y medición del paquete) va la última.
- Estado verificado el 2026-10-10: `npx vitest run src/lib/xr` → 11 archivos, 214 pruebas en verde; `tsc` acotado a `src/lib/xr` limpio.

## Integración del 10-10 (INT1010D): motor de entrada del enjambre sobre stubs

Las tareas XR1010* escribieron `gestos.ts`, `entrada-eventos.ts` y `mundo-motor.ts` contra versiones mínimas
de `tipos.ts` (`Vec3 = {x,y,z}`), `espacio-trinity.ts` (`activacionMenu`) y `vinculos-xr.ts` (mapa como lista).
Ganó el núcleo del contrato (`Vec3` tupla, mapas por acción); la primera versión del enjambre vive en
`src/lib/xr/entrada-tipos.ts`, que solo importan esos tres módulos y `entrada-xr.test.ts`.
**Pendiente para la cola:** portar el motor de entrada a `vinculos-xr.ts`/`tipos.ts` y retirar `entrada-tipos.ts`.

## Sondeo del navegador y hook (XR1010Bc · 2026-10-20)

`src/components/xr/shell/sondeo-navegador.ts` (sin React) y `use-capacidades-xr.ts` cumplen la tubería de §3 (c).
- `sondearNavegador(entorno?)` devuelve el `DatosNavegador` EXACTO del núcleo (las 10 claves; sin extras ni `as`). Nunca lanza,
  nunca llama a `requestSession` ni lee `WEBGL_debug_renderer_info`. `isSessionSupported` que rechaza o lanza → `false`; sin
  `navigator.xr` → `vr/ar` `false` (ya comprobado); solo `null` si no hay `window` o el navegador no contesta en 1500 ms
  (el reloj se limpia siempre). `ofreceSesion` por la FUNCIÓN `offerSession`. WebGL2 se pregunta una vez por carga.
- `useCapacidadesXR({modo?, contexto?})` → `{estado, datos, capacidades, plan}`, nunca `null`; el estado inicial es igual en
  servidor y cliente. Re-sondea con `devicechange` y descarta respuestas tardías. **Mientras `estado === "sondeando"` el plan es
  provisional**: XR1010E/F deben mirar `estado` (y `datos.seguro === false` para el aviso «sin https», que el núcleo casi nunca
  emite porque `navigator.xr` no existe en contextos inseguros) antes de decir «este aparato no tiene VR».
- `esVisorPorUA(ua)` (Quest, Pico, Magic Leap…): lo usa `detectCurrentDeviceType` del dashboard. Antes `navigator.xr` bastaba
  para decir «VR / AR», y lo traen todos los Chrome/Edge de escritorio y Android. Vision Pro (UA de Mac) y Android XR (UA de
  Android) solo los confirma la sonda asíncrona; hasta entonces se ven como escritorio o móvil.
- Consumidores hoy: el widget «Espacio inmersivo» (`useSoporteXR`) y el dashboard. **Pendientes de cablear:** XR1010E/F (botón y
  entrada global), D (almacén), AI (`/xr/diagnostico`), AK (`plataformaDe`), AQ/AR (`use-sesion-xr`, `use-webxr`) y una tarea
  nueva XR1010AT: `vr-frame.tsx`, `xr-view.tsx` y `multiverse-hub-partes#detectarXR` delegan en el sondeo. Propuestos, no hechos:
  Biblioteca/Instalar (un visor no ejecuta `.AppImage`), ficha de neurona (`capabilities.xr`) y `perfilDeDatos` para avatares.
- No probado en un visor real: solo tsc y vitest. Lo valida Alex en `/xr/diagnostico` (XR1010AI).
