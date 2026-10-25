# frontend-slides en StarSeed

Adaptación de StarSeed a esta skill (copia de zarazhangrui/frontend-slides, MIT). Léela antes de empezar una
presentación, una conferencia o una página de diapositivas de StarSeed.

## 1. Qué es y qué NO es aquí

Crea presentaciones HTML de un solo archivo, sin dependencias, con un escenario fijo de 1920×1080 (16:9) escalado al
visor. En StarSeed OS ya existe la presentación en vivo (`src/lib/vivo/presentacion.ts`: diapositivas sobre el Lienzo,
escenario 960×540, 8 temas) pero **no exporta** a HTML autónomo ni a PDF. Esta skill aporta:

1. el **método** de descubrir el estilo viendo vistas previas (no eligiendo palabras);
2. las **reglas del escenario** (16:9 fijo, `viewport-base.css`, modos de densidad, `prefers-reduced-motion`);
3. un **formato HTML autónomo** para exportar (tarea DSN1025D/E del cuadro de tareas);
4. un **paquete de 34 plantillas** como lectura de composición (no como estilo del OS).

No es: un sustituto del ADN, un servicio de publicación ni un conversor de PPTX dentro del OS.

## 2. La marca manda

| La skill | El ADN de StarSeed | Gana |
|---|---|---|
| «Evita Inter y Arial; elige fuentes distintas cada vez» | Satoshi / Rajdhani / Inter / Quicksand / JetBrains Mono, fijas por registro | ADN. La variedad se logra con composición y ritmo, no con otra tipografía |
| «Varía entre claro y oscuro y entre estéticas» | Un registro por contexto (11), `noche #0A0F1D` / `nieve #F8F9FA` | ADN. Se varía entre diapositivas dentro del registro |
| Los 12 estilos de `STYLE_PRESETS.md` y las 34 plantillas | Cristal líquido Trinity y sus registros | ADN. Los estilos son ejemplos de composición; solo se usa su estructura |
| Degradados, fondos con atmósfera, brillos | Brillo multicapa en UNA pieza destacada; vidrio 16 px | ADN (una pieza destacada por diapositiva) |
| Animación con CSS puro, entradas escalonadas | Curvas y duraciones 140–350 ms, solo `transform` y `opacity` | ADN (más estricto) |
| Desplegar a Vercel / exportar PDF con Playwright / leer PPTX con python-pptx | Sin despliegues sin la palabra de Alex; Filee y Stirling-PDF para PDF y PPTX | OS. Los scripts no se instalan |
| Cero dependencias y un solo archivo | Igual | Coinciden |
| Escenario 16:9 fijo, sin reflujo en móvil | Igual (la presentación del OS ya es 16:9) | Coinciden |

Fuentes: Satoshi solo por el CSS de Fontshare (nunca empaquetada); el resto, por Google Fonts. Un `.html` exportado que
cargue fuentes externas debe decirlo en su pie.

## 3. Las 34 plantillas frente a los registros del ADN

Solo orientan la composición. La tabla dice qué plantilla estudiar según el registro de la pieza:

| Registro del ADN | Plantillas útiles como lectura de composición |
|---|---|
| Nexus / Trinity (oficial, institucional) | `signal`, `blue-professional`, `cobalt-grid` |
| Astraura (conversación e inteligencia) | `vellum`, `soft-editorial`, `cartesian` |
| Genesis | `studio`, `8-bit-orbit` (solo la rejilla; el neón no) |
| Malla cristalina y datos | `cobalt-grid`, `monochrome`, `neo-grid-bold` |
| Economía ecológica | `grove`, `editorial-forest`, `mat` |
| Democracia directa (manifiestos, asambleas, carteles) | `peoples-platform`, `bold-poster`, `broadside`, `biennale-yellow` |
| Café y comunidad física | `long-table`, `pin-and-paper`, `retro-zine`, `scatterbrain` |
| Audiomorphic y Materia Viva | `pink-script`, `stencil-tablet`, `emerald-editorial` |
| Exploración / Energía alta | `block-frame`, `raw-grid`, `capsule` |
| No usar | `retro-windows` (imita el aspecto de Windows 95 y pide una fuente no libre), `sakura-chroma` y `daisy-days` (estética de nicho que no es de ningún registro) salvo petición expresa de Alex |

Y siempre: la plantilla aporta estructura (rejilla, jerarquía, ritmo). La paleta, la tipografía y el vidrio salen del
`dna.json` del registro.

## 4. Dónde se usa

- **Presentación en vivo del OS** (`pagina-presentacion.tsx`): la skill alimenta la tarea de «exportar a HTML autónomo»
  (DSN1025D, núcleo sin dependencias de React ni `node:*`) y su botón (DSN1025E).
- **Protomolécula (bloque de presentación) y Astraura:** capacidad `slides` (tarjeta / resumen / completa) para quien
  pida «hazme una presentación».
- **Publicaciones de tipo «página»** y conferencias: el método de vista previa y las reglas de densidad.
- **Carteles e invitaciones en 16:9** (pantallas de eventos): el escenario fijo.

## 5. Con las skills que ya tenemos

- `starseed-estudio:slideshow` (HyperFrames): presentaciones interactivas con fragmentos y modo presentador. Si la pieza
  necesita video, marcadores o ramificación, es esa skill; si es un HTML estático ligero para compartir o imprimir, esta.
- `starseed-estudio:hyperframes` y `claude-video-studio`: vídeo renderizado. No se solapan.
- `transitions-*`: movimiento de interfaz con los tokens del OS; se aplican a las transiciones entre diapositivas.
- `design-taste-frontend` (la otra skill de este grupo): su `references/scenes.md` y `critique.md` sirven para criticar
  una presentación; el escenario fijo de aquí manda sobre su maquetación de página.
- `pptx` (de Anthropic): si Alex pide un `.pptx` real, esa skill; esta es solo HTML.
