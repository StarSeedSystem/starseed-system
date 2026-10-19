# Mapa de herramientas del estudio

Orden de preferencia: **lo propio, local y gratis primero** (skills de este plugin, Three.js, artefactos de
Claude, la IA local de Astraura cuando la pieza se hace dentro del OS); **después los servicios con la
cuenta de Alex** (Higgsfield, Canva, Figma, LottieFiles, Icons8), siempre con su licencia aplicada y
mostrando el coste antes de gastar créditos de pago.

## 1. Qué usar para cada cosa

| Necesito | Herramienta | Dónde corre |
|---|---|---|
| Intro de canal, motion graphics, tipografía cinética, explicativo con subtítulos, render determinista a MP4 | skills `hyperframes`, `hyperframes-cli`, `motion-graphics`, `faceless-explainer`, `slideshow`, `embedded-captions` | este contenedor (Node + Chromium + ffmpeg) o el servidor A1 de StarSeed |
| Vídeo generado con IA (cinemático, cámara, personajes, efectos) | Higgsfield `generate_video` (y `models_explore` para elegir modelo) | nube de Higgsfield, créditos de Alex |
| Explicativo narrado por bloques con un estilo fijo | Higgsfield `get_explainer_presets` → `resolve_explainer_preset` | nube de Higgsfield |
| Shorts y reels listos para redes | Higgsfield `shorts_studio_create` o HyperFrames en 9:16 | nube de Higgsfield / contenedor |
| Imagen fija, fondo, cartel, portada | Higgsfield `generate_image`; Canva `generate-design`; artefacto Design | nube / claude.ai |
| Objeto 3D desde una imagen (GLB) | Higgsfield `generate_3d` | nube de Higgsfield |
| Escena 3D con cámaras y ángulos | Higgsfield `scene_builder_3d_*` (antes `get_preset_instructions` con `/3d-jutsu`) | nube de Higgsfield |
| Animación 3D de un programa del OS en la web | Three.js (MIT) en una página HTML o en HyperFrames | contenedor / navegador |
| Diagramas (arquitectura, flujo, capas, despiece axonométrico, Sankey, línea de tiempo…) | skill `diagram-design` con el perfil `starseed` (ver `diagramas-starseed.md`) | contenedor |
| Gráficas de datos animadas | `diagram-design` (barras, líneas, Sankey, mapa de calor…) o HyperFrames | contenedor |
| Fondos vivos y efectos GPU (auroras, cristal, distorsión, partículas) | skill `shaders` (npm `shaders`, MIT, siempre `disableTelemetry`) | navegador con WebGPU |
| Transiciones de interfaz en páginas animadas | skills `transitions-dev`, `transitions-polish`, `transitions-ui-generation` | contenedor |
| Animaciones Lottie de terceros | conector LottieFiles de la cuenta (OAuth de Alex; el 2026-10-19 no conectó: «state not found or expired»). Mientras no conecte: animaciones que Alex descargue con Lottie Simple License, o propias hechas en HyperFrames/WAAPI; se reproducen con `@lottiefiles/dotlottie-react` (MIT) | nube de LottieFiles / navegador |
| Iconos | conector Icons8 de la cuenta (conectado): PNG y animados GIF/APNG gratis con enlace a Icons8; SVG y Lottie con plan (100/h y 1000/día) | nube de Icons8 |
| Pantallas y flujos de referencia de apps reales | conector Mobbin de la cuenta: conectado, pero su MCP exige plan de pago (comprobado el 2026-10-19). No se usa hasta que Alex se suscriba; con plan, solo para estudiar patrones y citar su `mobbin_url` | nube de Mobbin |
| Pantallas de interfaz generadas | Stitch: en el Claude Code de la Mac con clave en `~/.starseed/stitch.env` (15 herramientas); el conector de claude.ai respondía HTTP 502 | Google |
| Voz en off y música | Higgsfield `generate_audio`, `create_voice`, `list_voices` | nube de Higgsfield |
| Doblaje y cambio de voz | Higgsfield `dubbing`, `voice_change` (solo con voces propias o con permiso) | nube de Higgsfield |
| Mejorar o adaptar un vídeo | Higgsfield `upscale_video`, `reframe`, `remove_background` | nube de Higgsfield |
| Predecir si un vídeo engancha | Higgsfield `virality_predictor` | nube de Higgsfield |
| Presentación para conferencia | artefacto **Slides** de Claude (se descarga en PPTX o PDF) | claude.ai |
| Storyboard, cartel, página de diseño, maqueta | artefacto **Design** de Claude, Canva o Figma | claude.ai / Canva / Figma |
| Guion, brief, documento para el equipo | artefacto **Docs** de Claude | claude.ai |
| Métricas de canales | artefacto **Dashboard** de Claude | claude.ai |
| Marca para todos los artefactos | artefacto **Design System «StarSeed OS»** (https://claude.ai/artifact/XGig1BviuZC1C1157GKxSL), el editable. Claude Design cierra el 14-12-2026: lo nuevo se hace siempre en Artefactos (tipos Design, Slides, Docs, Design System), nunca en claude.ai/design (ver `adn-y-tokens.md` §8) | claude.ai |
| Investigación, resumen en audio o vídeo de los fundamentos | skill `notebooklm` y los cuadernos de StarSeed en NotebookLM | Google |
| Piezas en Canva con marca | Canva `list-brand-kits`, `create-design-from-brand-template`, `export-design`, `import-claude-motion-from-url` | Canva |
| Piezas en Figma | archivos de identidad de StarSeed (claves en la memoria del proyecto); antes de `use_figma`, la skill `figma-use` | Figma |
| Textos en inglés con aire de IA | skill `slopmonster` | contenedor |

## 2. Cómo trabajar con cada una

- **HyperFrames:** antes de cualquier orden, `export HYPERFRAMES_NO_TELEMETRY=1 DO_NOT_TRACK=1`. Las
  composiciones son HTML: usa `assets/tokens.css` y las fuentes de la marca. Medido el 2026-10-18: 3 s a
  720p y 24 fps se renderizan en 5,1 s en el A1 de StarSeed y en 18,7 s en un contenedor de Claude.
- **Higgsfield:** consulta `balance` y el coste (`models_explore`, o el presupuesto que devuelve cada
  herramienta) antes de lanzar lotes; enseña el coste a Alex y espera su visto bueno cuando la pieza
  gaste créditos de pago. Las salidas admiten uso comercial; revela el contenido sintético cuando toque; no
  uses sus salidas para entrenar otros modelos. Sigue las instrucciones del propio conector
  (`get_workflow_instructions`, `get_preset_instructions`).
- **Diagram Design:** antes del primer diagrama de la sesión, instala el perfil StarSeed (ver
  `diagramas-starseed.md`).
- **Shaders:** cada componente con `disableTelemetry: true`; respaldo fijo (imagen o degradado) cuando no
  hay WebGPU; velo bajo el texto.
- **Artefactos de Claude:** si el artefacto Design System «StarSeed OS» existe, construye los Slides y los
  Design desde él para heredar colores, tipos y componentes.
- **Lo que pide a Alex:** iniciar sesión (OAuth) en LottieFiles la primera vez (Icons8 y Miro ya están
  conectados); el plan de Mobbin si quiere su MCP.

## 3. Lo que no se recomienda

- **Remotion:** licencia de código fuente disponible que exige licencia de empresa a partir de cierto
  tamaño de equipo; para vídeo se usa HyperFrames (Apache-2.0).
- **GSAP dentro del editor visual del OS:** su licencia prohíbe usarla en herramientas sin código que
  crean animaciones. Usarla dentro de un vídeo propio renderizado está permitido; el editor del OS usa
  CSS/WAAPI, Anime.js, Lottie o Three.js.
- **MCP de pago** (Mobbin, Refero, Savee, 60fps): solo si Alex se suscribe. Mobbin ya está conectado y
  responde «requires a paid plan».
- **Copiar de galerías de inspiración:** se estudia el patrón y se crea una versión propia, citando la
  referencia; nunca se copian textos, marcas, logos, capturas ni assets.
