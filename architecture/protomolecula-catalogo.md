# Protomolécula · Catálogo de herramientas (verificado el 2026-10-10)

> Fuente de verdad del **catálogo de herramientas** de la Protomolécula: qué contiene, de dónde sale cada cosa,
> con qué licencia entra y por qué vía. El contrato general es `architecture/protomolecula.md` (§3.2 grados de
> integración, §9 autoactualización y Biblioteca); aquí se detalla el **contenido**.
> Datos: `src/lib/protomolecula/catalogo-herramientas.ts` (módulo puro, 60 pruebas).
> Actualizador de versiones: `scripts/protomolecula/actualizar_catalogo.py` (30 pruebas con respuestas simuladas).

**Regla de lectura (nada de ilusiones).** El campo `estado` NO dice «ya corre en StarSeed OS». Dice si esa
herramienta **puede entrar** y por qué vía (`integracion`). Hoy el catálogo es una lista verificada y tipada; los
átomos que de verdad ejecutan cada herramienta los escriben las tareas F2K/F2L del contrato. Lo que no corre se
marca «próximamente» con su motivo, y lo que no se puede incorporar se marca «solo enlace» con la razón.

## 1 · En una pantalla

| Concepto | Cifra |
|---|---|
| Herramientas en el catálogo | **227** |
| De ArtCraft (getartcraft.com) | **10** entradas: las **7 apps** de su catálogo + 3 repositorios hermanos |
| De fuera de ArtCraft (código abierto, estándares y servicios) | **217** |
| Pueden entrar (`integrable`) | **206** |
| Próximamente (hay camino, falta una pieza externa) | **9** |
| Solo enlace (no se pueden incorporar) | **12** |
| Categorías · grupos de la Biblioteca | **25** · **14** |
| Con consulta automática de versión | **184** (el resto, 43, se mira a mano: fuente `web`) |
| Modelos de IA (código y pesos con licencia aparte) | **17** |
| Estándares del navegador y servicios de terceros | **11** y **7** |

Por forma de integración: iframe-aislado 26 · wasm-en-worker 33 · libreria-js 59 · servicio-local 43 · app-nativa-puente 41 · servidor-remoto 13 · solo-enlace 12.

## 2 · Qué es ArtCraft (y por qué «getarcraft.com» no existe)

- El sitio es **getartcraft.com** (con «art»). La dirección de la petición, `getarcraft.com/apps`, lleva una letra
  de menos y no se alcanza. El catálogo vive en `getartcraft.com/apps` y el código en la organización de GitHub
  **`storytold`**.
- ArtCraft publica **7 «Craft Apps»**: reimplementaciones desde cero (clean-room) y en Rust de las herramientas
  profesionales más conocidas. Las 7 son de **código abierto con doble licencia MIT o Apache-2.0** (archivos
  `LICENSE-MIT` y `LICENSE-APACHE` en la rama principal de cada repositorio).
- Cada versión publicada trae dos cosas: `<app>-web-<versión>.zip` (build estático en WebAssembly, listo para
  alojar) e instaladores nativos (macOS universal, Windows msi y portable x86/x64/arm64, Linux AppImage/deb/rpm/
  flatpak en x86_64 y aarch64, FreeBSD y un CLI para macOS).
- **Control externo:** el binario nativo trae CLI sin pantalla, servidor MCP por stdio y un canal de control
  JSON-líneas por TCP (`--control <puerto>`), todos sobre el mismo registro de comandos. El **build web no trae
  canal de control**: dentro de un iframe el control es «solo ventana» más archivos. Para dictar parámetros desde
  Astraura hace falta el binario nativo en una neurona de escritorio o servidor.
- **Madurez:** repositorios creados el 2026-09-30; versiones nuevas cada pocos días; la web los marca como alfa
  temprana. Hay que **fijar la versión por SHA** antes de alojar un zip.
- **Marca:** el nombre y los logos de ArtCraft son marcas **no abiertas**; solo pueden usarse sin modificar y como
  parte de la app (`docs/brand/LICENSE-brand.txt`). Al alojar su build no se cambia ni se reutiliza la marca.

| App | Reimplementación de (según su README) | Qué hace | Última versión comprobada | Código |
|---|---|---|---|---|
| PhotoCraft | Adobe Photoshop | Editor de imagen en Rust con capas, máscaras, ajustes, estilos de capa, texto, vectores y pinceles; abre y guarda PSD/PSB reales. | v0.6.0 (2026-10-10) | `https://github.com/storytold/photocraft` |
| VectorCraft | Adobe Illustrator | Ilustración vectorial en Rust: pluma, pathfinder, degradados, efectos vivos, texto con estilos y bidireccional, trazado de imágenes. | v0.8.0 (2026-10-10) | `https://github.com/storytold/vectorcraft` |
| FilmCraft | Adobe Premiere Pro | Editor de vídeo profesional en Rust con códecs propios (H.264, HEVC, ProRes, VP9, AV1, AAC, Opus), línea de tiempo multipista, color, efectos y compositor GPU. | v0.5.0 (2026-10-10) | `https://github.com/storytold/filmcraft` |
| LightCraft | Adobe Lightroom | Biblioteca de fotos y revelador RAW no destructivo, escrito en Rust: decodificadores RAW propios, pipeline GPU con color de escena y máscaras (pincel, degradados, cielo, sujeto). | v0.5.0 (2026-10-10) | `https://github.com/storytold/lightcraft` |
| PdfCraft | Adobe Acrobat | Banco de trabajo PDF en Rust: leer, buscar, organizar páginas, combinar, dividir, comentar, rellenar formularios, firmar y proteger. | v0.5.0 (2026-10-10) | `https://github.com/storytold/pdfcraft` |
| EffectCraft | Adobe After Effects | Gráficos en movimiento y efectos visuales en Rust: composiciones, capas, fotogramas clave, 259 efectos, expresiones JavaScript, cámaras y luces 3D y cola de render. | v0.7.0 (2026-10-10) | `https://github.com/storytold/effectcraft` |
| DesignCraft | Adobe InDesign | Maquetación y publicación en Rust: páginas enfrentadas, páginas maestras, marcos de texto enlazados, estilos, compositor Knuth-Plass y exportación PDF/X-4 y PDF/A-2b. | v0.5.0 (2026-10-10) | `https://github.com/storytold/designcraft` |

Repositorios hermanos de la misma organización (no son parte de `/apps`):

| Repositorio | Licencia | Estado en el catálogo |
|---|---|---|
| `artcraft` (estudio de IA para imagen y vídeo) | MIT OR Apache-2.0 | próximamente: es cliente de modelos alojados (pide cuenta y créditos de ArtCraft o claves de terceros) y no tiene control externo documentado |
| `artcraft-services` (backend y web alojados) | «ArtCraft License (WIP)», fair-source, no OSI | solo enlace: su código no se puede reutilizar |
| `artcraftx` (escritorio mínimo de IA) | sin archivo de licencia | solo enlace: sin licencia son derechos reservados; además aún no publica instaladores |

Una sonda con el nombre `printcraft` devolvió el mismo README que PdfCraft: es un alias o nombre anterior, **no
una octava app**.

## 3 · Cuántas apps de ArtCraft hay y cuántas entran

| Pregunta | Respuesta |
|---|---|
| ¿Cuántas apps tiene `/apps`? | **7** (PhotoCraft, VectorCraft, FilmCraft, LightCraft, PdfCraft, EffectCraft, DesignCraft) |
| ¿Cuántas son de código abierto? | **7** de 7 (MIT OR Apache-2.0) |
| ¿Cuántas entran en el catálogo como integrables? | **7** de 7, por la vía `iframe-aislado` (zip web alojado como origen aparte con `sandbox`) |
| ¿Con qué condiciones? | SHA fijado, marca sin tocar, y control por parámetros solo con el binario nativo en una neurona de escritorio/servidor |
| ¿Y los otros 3 repositorios? | 0 integrables: 1 próximamente (`artcraft`) y 2 solo enlace (`artcraft-services`, `artcraftx`) |

## 4 · Tabla por categoría

Columnas de estado: integrable / próximamente / solo enlace. «Permisivas» = MIT, Apache, BSD, zlib, CC0 y similares;
«LGPL/MPL» = copyleft débil (separable y reemplazable); «GPL/AGPL» = solo como programa aparte.

| Categoría | Grupo de la Biblioteca | N | Estado | Forma de integración | Licencias | Algunas herramientas |
|---|---|---|---|---|---|---|
| Pintura y retoque (ráster) (`raster-pintura`) | Imagen | 8 | 8 / 0 / 0 | iframe-aislado 2 · libreria-js 4 · app-nativa-puente 2 | permisivas 6 · GPL/AGPL 2 | PhotoCraft, Krita, GIMP, miniPaint, Filerobot Image Editor, Fabric.js y 2 más |
| Vector y diseño (`vector-diseno`) | Imagen | 7 | 7 / 0 / 0 | iframe-aislado 3 · wasm-en-worker 1 · libreria-js 1 · app-nativa-puente 1 · servidor-remoto 1 | permisivas 5 · LGPL/MPL 1 · GPL/AGPL 1 | VectorCraft, Inkscape, Graphite, Penpot, SVG-Edit, Paper.js y 1 más |
| Fotografía y RAW (`foto-raw`) | Imagen | 4 | 4 / 0 / 0 | iframe-aislado 1 · app-nativa-puente 3 | permisivas 1 · GPL/AGPL 3 | LightCraft, darktable, RawTherapee, RapidRAW |
| Documentos, PDF y maquetación (`documentos-pdf`) | Documentos y diagramas | 11 | 11 / 0 / 0 | iframe-aislado 2 · wasm-en-worker 1 · libreria-js 3 · servicio-local 2 · app-nativa-puente 1 · servidor-remoto 2 | permisivas 6 · LGPL/MPL 2 · GPL/AGPL 3 | PdfCraft, DesignCraft, Scribus, PDF.js, pdf-lib, Typst y 5 más |
| Pizarras y diagramas (`pizarras-diagramas`) | Documentos y diagramas | 7 | 6 / 0 / 1 | iframe-aislado 1 · wasm-en-worker 2 · libreria-js 3 · solo-enlace 1 | permisivas 5 · LGPL/MPL 1 · sin permiso 1 | Excalidraw, draw.io (diagrams.net), tldraw, Mermaid, D2, Graphviz (Viz.js) y 1 más |
| Edición de audio y DAW (`audio-edicion`) | Audio y síntesis | 11 | 11 / 0 / 0 | iframe-aislado 3 · libreria-js 3 · servicio-local 1 · app-nativa-puente 4 | permisivas 4 · GPL/AGPL 7 | Ardour, Audacity, Tenacity, AudioMass, openDAW, GridSound DAW y 5 más |
| Síntesis y música por código (`sintesis-audio`) | Audio y síntesis | 14 | 14 / 0 / 0 | iframe-aislado 1 · wasm-en-worker 4 · libreria-js 3 · servicio-local 1 · app-nativa-puente 5 | permisivas 5 · LGPL/MPL 3 · GPL/AGPL 5 · estándar 1 | Tone.js, Web Audio API, Strudel, Surge XT, Cardinal, VCV Rack y 8 más |
| Edición de vídeo y composición (`video-composicion`) | Vídeo y movimiento | 13 | 12 / 0 / 1 | iframe-aislado 2 · wasm-en-worker 1 · libreria-js 2 · servicio-local 2 · app-nativa-puente 5 · solo-enlace 1 | permisivas 4 · LGPL/MPL 2 · GPL/AGPL 5 · estándar 1 · sin permiso 1 | FilmCraft, Kdenlive, Shotcut, Olive, OpenShot, Natron y 7 más |
| Animación 2D y gráficos en movimiento (`animacion-motion`) | Vídeo y movimiento | 10 | 9 / 0 / 1 | iframe-aislado 1 · wasm-en-worker 1 · libreria-js 4 · app-nativa-puente 3 · solo-enlace 1 | permisivas 7 · GPL/AGPL 2 · sin permiso 1 | EffectCraft, Synfig Studio, OpenToonz, Pencil2D, Theatre.js, Lottie (lottie-web) y 4 más |
| Transmisión en directo (`transmision`) | Vídeo y movimiento | 5 | 5 / 0 / 0 | iframe-aislado 1 · app-nativa-puente 1 · servidor-remoto 3 | permisivas 4 · GPL/AGPL 1 | OBS Studio, MediaMTX, Owncast, LiveKit, Jitsi Meet |
| Modelado, escultura y 3D (`modelado-3d`) | 3D y escenas | 6 | 6 / 0 / 0 | iframe-aislado 2 · servicio-local 1 · app-nativa-puente 3 | permisivas 4 · GPL/AGPL 2 | Blender, BlenderMCP, SculptGL, Dust3D, Editor de three.js, MeshLab |
| Materiales, texturas y shaders (`materiales-shaders`) | 3D y escenas | 6 | 6 / 0 / 0 | wasm-en-worker 1 · libreria-js 3 · app-nativa-puente 2 | permisivas 6 | MaterialX, Material Maker, ArmorPaint, glslCanvas, TSL de three.js (nodos de shader), Tweakpane |
| Gaussian splats y fotogrametría (`splats-fotogrametria`) | 3D y escenas | 9 | 8 / 0 / 1 | iframe-aislado 2 · libreria-js 1 · servicio-local 4 · app-nativa-puente 1 · solo-enlace 1 | permisivas 6 · LGPL/MPL 1 · GPL/AGPL 1 · sin permiso 1 | SuperSplat, Spark (World Labs), Brush, Nerfstudio, COLMAP, Meshroom (AliceVision) y 3 más |
| Arquitectura, CAD y BIM (`arquitectura-cad`) | Arquitectura | 14 | 14 / 0 / 0 | iframe-aislado 1 · wasm-en-worker 4 · libreria-js 2 · servicio-local 4 · app-nativa-puente 3 | permisivas 6 · LGPL/MPL 4 · GPL/AGPL 4 | FreeCAD, IfcOpenShell, Bonsai (BIM sobre Blender), web-ifc, That Open Engine · Components, xeokit SDK y 8 más |
| Físicas y simulación (`fisicas`) | Físicas y prototipos | 5 | 5 / 0 / 0 | wasm-en-worker 3 · libreria-js 2 | permisivas 5 | Rapier, Jolt Physics (JoltPhysics.js), cannon-es, Matter.js, MuJoCo |
| Motores de juego y de 3D web (`motores-juego`) | Juegos | 8 | 8 / 0 / 0 | iframe-aislado 2 · libreria-js 6 | permisivas 8 | Godot Engine, Bevy, three.js, Babylon.js, PlayCanvas Engine, React Three Fiber y 2 más |
| Realidad virtual y aumentada (XR) (`xr`) | VR/AR | 6 | 6 / 0 / 0 | libreria-js 4 · app-nativa-puente 1 · servidor-remoto 1 | permisivas 3 · LGPL/MPL 2 · estándar 1 | WebXR Device API, A-Frame, @react-three/xr, Hubs (edición comunitaria), Wolvic, IWER (Immersive Web Emulation Runtime) |
| Código creativo y programación visual (`codigo-creativo`) | Código y conversión | 5 | 5 / 0 / 0 | iframe-aislado 2 · libreria-js 2 · servicio-local 1 | permisivas 3 · LGPL/MPL 1 · GPL/AGPL 1 | p5.js, Hydra, cables.gl, Blockly, Node-RED |
| Editor de código y ejecución aislada (`editor-codigo`) | Código y conversión | 5 | 5 / 0 / 0 | wasm-en-worker 3 · libreria-js 2 | permisivas 4 · LGPL/MPL 1 | Monaco Editor, CodeMirror 6, Pyodide, Tree-sitter, esbuild (WebAssembly) |
| Conversión de formatos (`conversion-formatos`) | Código y conversión | 7 | 7 / 0 / 0 | wasm-en-worker 2 · libreria-js 1 · servicio-local 4 | permisivas 5 · LGPL/MPL 1 · GPL/AGPL 1 | FFmpeg, ImageMagick (magick-wasm), jSquash, Pandoc, Assimp, glTF-Transform y 1 más |
| IA generativa abierta y local (`ia-generativa`) | IA generativa | 32 | 26 / 1 / 5 | wasm-en-worker 8 · servicio-local 18 · app-nativa-puente 1 · solo-enlace 5 | permisivas 26 · GPL/AGPL 3 · sin permiso 3 | ArtCraft (estudio de IA para imagen y vídeo), ArtCraft Services (backend y web alojados), ComfyUI, InvokeAI, AUTOMATIC1111 Stable Diffusion web UI, stable-diffusion.cpp y 26 más |
| Controles y dispositivos (`controles-dispositivos`) | Controles y sensores | 13 | 13 / 0 / 0 | libreria-js 8 · servicio-local 4 · app-nativa-puente 1 | permisivas 5 · GPL/AGPL 2 · estándar 6 | Web MIDI API, WebHID, Web Serial API, Gamepad API, Web Bluetooth, WebUSB y 7 más |
| Sensores y wearables (`sensores-wearables`) | Controles y sensores | 13 | 3 / 8 / 2 | libreria-js 2 · servicio-local 1 · app-nativa-puente 4 · servidor-remoto 4 · solo-enlace 2 | permisivas 3 · GPL/AGPL 1 · estándar 2 · sin permiso 7 | Ritmo cardiaco por Bluetooth (perfil 0x180D), Health Connect (Android), HealthKit (Apple), Gadgetbridge, Polar BLE SDK, Oura Cloud API v2 y 7 más |
| Colaboración y sincronía (`colaboracion-sync`) | Colaboración | 5 | 5 / 0 / 0 | wasm-en-worker 2 · libreria-js 3 | permisivas 5 | Yjs, y-webrtc, Automerge, Loro, Trystero |
| Recursos abiertos (CC0) (`recursos-abiertos`) | Recursos abiertos | 3 | 2 / 0 / 1 | servidor-remoto 2 · solo-enlace 1 | permisivas 3 | Poly Haven, ambientCG, Kenney |

## 5 · Licencias y forma de integración

Reglas de la casa, aplicadas por `usoLicencia()` y `respetaReglaDeLicencia()` y vigiladas por las pruebas:

| Clase de uso | Herramientas | Qué se puede hacer |
|---|---|---|
| `enlazable` (MIT, Apache, BSD, zlib, CC0…) | 139 | Se puede importar en el paquete o ejecutar en un Worker |
| `enlazable-con-aviso` (LGPL, MPL) | 19 | Enlazable si la biblioteca queda separable y reemplazable; el aviso se muestra en la ficha |
| `programa-aparte` (GPL, AGPL) | 44 | **Solo como programa o servidor aparte** (iframe de otro origen, app nativa, servicio local o remoto). Nunca `libreria-js` ni `wasm-en-worker`: la prueba lo comprueba |
| `estandar` (W3C, Bluetooth SIG…) | 11 | Especificación abierta; no es código nuestro |
| `sin-permiso` (propietaria, no comercial o con restricciones) | 14 | Nunca `integrable`: solo enlace o próximamente |

- **Modelos de IA: dos licencias.** `licencia` es la del código y `licenciaPesos` la de los pesos; manda la más
  restrictiva. Hay 17 entradas de tipo `modelo`; los pesos con licencia no comercial no entran
  (MusicGen, Stable Audio Open, Hunyuan3D 2) y, en Depth Anything V2, solo el tamaño Small es Apache-2.0.
- **Control** (puede haber varias vías por herramienta): js 109, cli 60, python 40, http 31, ninguno 21, midi 15, osc 12, mcp 8, websocket 8, json-lineas 7, postMessage 6, lua 3, tuberia 2, intents 1.
- **Código ajeno**: nunca se ejecuta en el hilo del OS. Editable sí, ejecutable no.

## 6 · Lo que NO se puede integrar (y por qué)

### Solo enlace (12)

| Herramienta | Licencia | Motivo |
|---|---|---|
| tldraw (`tldraw`) | LicenseRef-tldraw | Licencia tldraw (source-available): uso en producción con clave de pago o con marca de agua. No es de código abierto; se usa Excalidraw en su lugar. |
| Remotion (`remotion`) | LicenseRef-Remotion | Licencia Remotion (source-available): uso comercial de pago según el tamaño de la organización. No es de código abierto. |
| GSAP (`gsap`) | LicenseRef-GSAP-Standard | Licencia GSAP Standard (gratuita pero no abierta; restricciones contra editores de animación visual). Para Protomolécula se usa Motion o Theatre.js. |
| 3D Gaussian Splatting (Inria) (`gaussian-splatting-inria`) | LicenseRef-Inria-NonCommercial | Licencia de investigación y uso no comercial (no abierta). Solo enlace; usa Brush, Nerfstudio u OpenSplat. |
| ArtCraft Services (backend y web alojados) (`artcraft-services`) | LicenseRef-ArtCraft-WIP-fair-source | Licencia fair-source (no OSI): no se puede reutilizar su código en StarSeed OS. Solo enlace. |
| MusicGen (AudioCraft) (`musicgen`) | MIT (pesos: CC-BY-NC-4.0) | Los PESOS son CC-BY-NC-4.0 (no comerciales); no se pueden ofrecer dentro del OS. Usa ACE-Step. |
| Stable Audio Open (`stable-audio-open`) | MIT (pesos: LicenseRef-Stability-AI-Community) | Pesos con Licencia Comunitaria de Stability (no OSI, con tope de ingresos). Solo enlace. |
| Hunyuan3D 2 (Tencent) (`hunyuan3d`) | LicenseRef-Tencent-Hunyuan-Community | La licencia excluye la Unión Europea (y UK y Corea del Sur) y limita a organizaciones grandes: no usable por StarSeed. Solo enlace. |
| ArtCraft-X (escritorio mínimo de IA) (`artcraft-x`) | NOASSERTION | No trae archivo de licencia en la raíz (ni LICENSE-MIT ni LICENSE-APACHE, a diferencia de los siete Craft Apps): sin licencia declarada son derechos reservados. Solo enlace hasta que la publique. |
| Garmin Connect Developer Program (Health API) (`garmin-health-api`) | LicenseRef-Garmin-terminos | El programa es solo para empresas, con aprobación y posibles tasas: no encaja con una red de personas. Para el pulso en tiempo real, el reloj puede transmitir por Bluetooth (modo «transmitir ritmo cardiaco»). |
| Fitbit Web API → Google Health API (`fitbit-google-health`) | LicenseRef-Google-API-terminos | La API clásica se apaga el 30-10-2026 y la Google Health API no admite proyectos nuevos por ahora: no se puede integrar. Reevaluar cuando abran el alta. |
| Kenney (`kenney`) | CC0-1.0 | Sin API: se enlaza y la persona descarga los paquetes CC0 que quiera; luego entran como entidades de la Biblioteca. |

### Próximamente (9)

| Herramienta | Licencia | Qué falta |
|---|---|---|
| ArtCraft (estudio de IA para imagen y vídeo) (`artcraft-estudio`) | MIT OR Apache-2.0 | Es un cliente de modelos alojados (pide cuenta y créditos de ArtCraft o claves de terceros) y no tiene control externo documentado: no encaja con «gratis primero». Se enlaza; se reevalúa cuando publique API. |
| Health Connect (Android) (`health-connect`) | Apache-2.0 | Requiere una app Android nativa con permisos de Health Connect (la app Tauri 0.3.0 aún no los pide) y la declaración de apps de salud de Google Play. |
| HealthKit (Apple) (`healthkit`) | LicenseRef-Apple-propietaria | Requiere una app iOS/watchOS nativa firmada con cuenta de desarrollador de Apple; no hay acceso desde la web. Es una API propietaria de plataforma. |
| Gadgetbridge (`gadgetbridge`) | AGPL-3.0 | Se enlaza desde la app Android nativa del OS (intents); falta ese puente nativo. |
| Polar BLE SDK (`polar-ble-sdk`) | LicenseRef-Polar-BLE-SDK | Licencia propia de Polar (comprobar redistribución) y puente nativo en Android e iOS; para el pulso, el perfil estándar ya basta. |
| Oura Cloud API v2 (`oura-api`) | LicenseRef-Oura-API-terminos | API de nube propietaria: OAuth2 con custodia en servidor, límite de 10 usuarios hasta aprobación de Oura y datos con retraso. Cada persona conecta su propia cuenta. |
| Polar AccessLink API (`polar-accesslink`) | LicenseRef-Polar-AccessLink-licencia | API de nube con licencia limitada de Polar y datos tras sincronizar (sin tiempo real); para tiempo real se usa el perfil Bluetooth estándar. |
| Withings Public API (`withings-api`) | LicenseRef-Withings-terminos | API de nube propietaria: registro de aplicación, OAuth2 con custodia en servidor y datos con retraso. No se pudo contrastar su página de condiciones desde aquí: revisarla antes de integrarla. |
| Open Wearables (`open-wearables`) | MIT | Proyecto joven: valorar madurez y cada proveedor antes de adoptarlo. |

## 7 · Avisos que hay que leer antes de usar el catálogo

1. **Choque de nombres con Bonsai.** `bonsai-bim` es el BIM de IfcOpenShell sobre Blender y **no tiene nada que
   ver** con «Bonsai», el modelo 1,58-bit de Astraura. En la Biblioteca y la interfaz se llama siempre «Bonsai BIM».
2. **tldraw ya está en el repositorio** (dependencia `tldraw` ^5.2.3, `src/components/canvas/tldraw-board.tsx`) con la marca de
   agua obligatoria y sin clave comercial. El catálogo lo marca «solo enlace» porque su licencia no es abierta y la
   Protomolécula **no suma usos nuevos**: para pizarras usa Excalidraw. Que el OS siga o no con tldraw es una
   decisión de Alex que este catálogo no toma.
3. **Repositorios con dirección distinta de la esperada** (verificado): miniPaint es `viliusle/miniPaint` (la ruta
   `ViliusL` no existe); Open Stage Control ya no está en GitHub, vive en framagit (GPL-3.0); ArmorPaint es de
   código libre (zlib) pero sus instaladores son de pago: se compila uno mismo.
4. **«Última versión» no siempre es la estable.** La etiqueta `latest` de GitHub apuntaba a una compilación Nightly
   en Surge XT, a una alfa en Bonsai BIM y a una etiqueta ajena (`v0.6.0`) en llama.cpp, cuyas versiones reales son
   compilaciones numeradas `bNNNN`. Esas entradas (y OpenCut) llevan `actualizacion.filtro`, una expresión regular
   sobre la etiqueta, y el actualizador la respeta.
5. **Proyectos sin versión consultable por máquina** (fuente `web`, 43 entradas): ACE-Step, SAM 2, AudioMass,
   blender-mcp y SculptGL no publican versiones ni etiquetas en GitHub; Graphite solo anuncia «Alpha 4» y
   compilaciones continuas; las etiquetas de Collabora Online son sobre todo del paquete Helm; Open Stage Control
   vive fuera de GitHub; y los estándares y servicios no tienen repositorio. Su versión se mira a mano.
6. **Sensores y salud.** Los datos de salud son locales por defecto, con consentimiento por métrica y sin afirmaciones
   médicas (contrato §8.3). Web Bluetooth (perfil estándar de ritmo cardiaco 0x180D) solo existe en Chromium: no en
   Firefox, no en Safari y **ningún navegador en iPhone**; ahí hace falta la app nativa. HealthKit y Health Connect
   piden app nativa firmada y declaración de la tienda. Garmin y Fitbit no se pueden integrar hoy (condiciones en la
   tabla de arriba).
7. **Web MIDI, WebHID, Web Serial y Gamepad** tienen soporte distinto por navegador (lo comprobado en MDN el
   2026-10-10 está en la nota de cada entrada); Safari y los navegadores de iPhone no soportan Web MIDI, WebHID ni
   Web Serial.

## 8 · Cómo se conecta con la Biblioteca y la autoactualización

### 8.1 · Del catálogo a fichas de la Biblioteca

`aPaqueteBiblioteca(h)` convierte cada herramienta en un `LibraryPackage`: `id: "proto-<id>"`, `kind` `app` o `repo`,
`sourceRepoId: "protomolecula"`, `free: true`, `comingSoon` cuando el estado no es `integrable`, `payload.externalUrl`
(sin `route`: instalar = guardar el enlace y abrirlo, nada se promete de lo que no corre), `payload.githubRepo` y
`payload.upstream` solo si hay repo de GitHub o ficha de Hugging Face, y `payload.protomolecula` con integración,
licencia, clase de uso y fechas.

**Lo que falta y NO está hecho** (pertenece a quien edite la Biblioteca; este catálogo no toca `packages.ts` ni la ruta):

1. Crear un repo integrado, por ejemplo `src/lib/library/fuentes-protomolecula.ts`:
   `export const REPO_PROTOMOLECULA: LibraryRepo = { id: "protomolecula", name: "Protomolécula", builtin: true, packages: CATALOGO_PROTOMOLECULA.map(aPaqueteBiblioteca) }`.
2. Añadirlo a `listRepos()` (`base`) y a los ids reservados de `addRepoByUrl`.
3. Los iconos: la Biblioteca los resuelve con `ICON_MAP` de `src/components/library/package-store.tsx`, que hoy NO
   incluye la mayoría de los que usan las categorías (Paintbrush, PenTool, Camera, PenLine, AudioWaveform, Music,
   Film, Clapperboard, ScanLine, Building2, Atom, Braces, Code2, Replace, SlidersHorizontal, HeartPulse, Users,
   Gift). Mientras no se añadan, cae al icono genérico `Package`: no se rompe, pero se ve igual.

### 8.2 · Cómo se engancha con `/api/library/actualizaciones`

Hoy esa ruta solo recorre `REPO_DECISIONES.packages`, pide **una** llamada a la API de GitHub por ficha (último
commit, `payload.upstream`) y compara **solo SHAs** (`compararVersiones`): una versión por etiqueta como `v0.6.0`
queda «desconocida». Con 197 fichas de GitHub eso no cabe: la API sin clave permite 60 peticiones por hora y la
ruta se corta a los 8 s. Por eso el enganche recomendado es **otro**:

1. El actualizador (`actualizar_catalogo.py`) lee el catálogo, pregunta a cada origen su última versión y escribe
   `config/protomolecula-versiones.json` **solo con las diferencias**: id, versión y fecha de antes y de ahora,
   SHA corto cuando el origen lo da y `licenciaCambiada` si cambió la licencia. Si no hay diferencias no escribe nada.
2. La ruta `/api/library/actualizaciones` (tarea de quien la edite) lee ese informe en el servidor y, para las fichas
   `proto-*`, devuelve `hay-actualizacion` cuando la versión del informe es distinta de `package.version`, sin
   gastar una sola llamada a GitHub. Sigue la regla del contrato: **sin SHA verificado, una versión nueva queda
   «disponible», no «instalada»**; el actualizador no descarga ni instala nada.
3. Con `--aplicar`, el actualizador reescribe en el catálogo únicamente las líneas `actualizacion: {…}` de las
   herramientas que cambiaron (protegido por la fecha de modificación del archivo; si alguien lo edita durante la
   consulta, no se pisa). Un cambio de licencia **nunca se reescribe solo**: se avisa y lo revisa una persona.

### 8.3 · Cómo se ejecuta el actualizador

```
python3 scripts/protomolecula/actualizar_catalogo.py                 # informe, sin tocar el catálogo
python3 scripts/protomolecula/actualizar_catalogo.py --aplicar       # además reescribe las líneas de versión
python3 scripts/protomolecula/actualizar_catalogo.py --solo krita,gimp --licencias
python3 scripts/protomolecula/actualizar_catalogo.py --sin-red       # solo comprueba que el catálogo se lee
python3 -m unittest scripts/protomolecula/test_actualizar_catalogo.py
```

- Fuentes: releases y etiquetas de GitHub, npm, PyPI y Flathub. La fuente `web` se omite.
- **Token opcional por NOMBRE de variable:** `GITHUB_TOKEN` o `GH_TOKEN` (nunca el valor en el repo). Solo se envía a
  `api.github.com`, jamás a otro sitio, y no se imprime ni se guarda en la caché.
- Sin token, la API permite 60 peticiones por hora: cuando GitHub limita, el actualizador cae a los **Atom públicos**
  (`releases.atom`, `tags.atom`) y a la redirección de `releases/latest`, que no cuentan para ese límite.
- Pausa de 0,5 s entre llamadas (`--pausa`), caché de **6 h** en `~/.starseed/protomolecula/versiones.json`
  (solo aciertos: un fallo se vuelve a intentar).
- Debe correr donde haya acceso a GitHub. El contenedor de la nube de esta sesión no alcanza `github.com`; las
  versiones del catálogo se leyeron desde la Mac (redirección de `releases/latest` y fuentes Atom).
- Los servicios de la Mac pueden lanzarlo cada pocas horas (`com.starseed.*`); programar eso no está hecho aquí.

## 9 · Cómo se verificó (2026-10-10)

- **Licencia**: leída del archivo de licencia del repositorio (los nombres de archivo distinguen mayúsculas; por
  ejemplo ArmorPaint usa `license.md` en minúsculas) y contrastada con la API o la ficha del paquete.
- **Versión y fecha**: etiqueta y fecha de la última publicación estable en GitHub (Mac), `registry.npmjs.org`,
  PyPI y Flathub. Donde la última «latest» no era estable se aplicó `filtro`.
- **Soporte de los estándares web**: tabla de compatibilidad de MDN (`browser-compat-data`), con los valores «mirror»
  resueltos al navegador de origen.
- **Pesos de modelos**: licencia leída de la ficha de Hugging Face, aparte de la del código.
- **Sin inventar repos**: toda entrada con `codigo` apunta a un repositorio comprobado en esa fecha; los estándares y
  servicios llevan `codigo: null`.
- **Sin comprobar**: la licencia de cables.gl (MIT, tomada del `package.json`; no hay archivo `LICENSE` en la raíz)
  y la página de condiciones de la API de Withings (no cargó). Las entradas lo declaran en `sinComprobar`/`avisos`.
- Pruebas: `npx vitest run src/lib/protomolecula/__tests__/catalogo-herramientas.test.ts` (60) y
  `python3 -m unittest scripts/protomolecula/test_actualizar_catalogo.py` (30). `tsc` limpio.

## 10 · Qué sigue

1. Quien edite la Biblioteca engancha el repo `protomolecula`, los iconos y la lectura del informe de versiones (§8).
2. Las tareas de átomos (contrato §12, F2K/F2L) leen `CATALOGO_PROTOMOLECULA` por id; cada átomo real se escribe
   aparte y solo entonces la ficha puede dejar de decir «puede entrar».
3. Reverificar el catálogo cada pocas semanas: ArtCraft es de hace diez días y cambia a diario.
4. Decidir sobre tldraw (aviso 2 de §7) y sobre las herramientas «próximamente» que dependen de una app nativa
   (Health Connect, HealthKit, Gadgetbridge, Polar).
