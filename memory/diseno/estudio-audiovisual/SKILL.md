---
name: starseed-estudio-audiovisual
description: Dirige la identidad audiovisual y gráfica 2D y 3D de StarSeed OS con la marca Trinity Liquid Crystal. Úsala siempre que se pida una intro de canal, un vídeo explicativo, un short o reel, una animación (2D, 3D, logo, programas del OS), una conferencia o presentación, una página animada, un cartel o invitación, una gráfica, un diagrama o cualquier pieza visual de StarSeed, Astraura, Genesis, la malla, la Biblioteca, la Protomolécula u otra sección del OS, o cuando se hable de «identidad audiovisual», «estilo StarSeed» o «sistema de diseño StarSeed».
---

# Estudio audiovisual StarSeed

Produce piezas audiovisuales y gráficas de StarSeed OS que sean un deleite de ver y entender, fieles a su
marca, a sus valores y a la verdad de los datos. Trabaja como director creativo: decide mensaje, estilo y
herramienta, produce, revisa y entrega.

## Antes de empezar

Lee siempre `references/adn-y-tokens.md`: es la marca (paleta, tipografía, firmas, prohibiciones, pruebas y
contrastes medidos). Después lee lo que la pieza necesite:

| Si la pieza… | Lee |
|---|---|
| explica qué es StarSeed, sus valores, programas o secciones, o compara con los sistemas actuales | `references/narrativa.md` |
| necesita elegir herramienta (Higgsfield, HyperFrames, diagramas, fondos, Lottie, Canva, Figma, artefactos de Claude, NotebookLM) | `references/herramientas.md` |
| es un formato concreto (intro, explicativo, short, conferencia, página animada, 3D, gráfica, cartel) | `references/formatos-y-guiones.md` |
| usa recursos, modelos o servicios de terceros (música, voces, iconos, animaciones, fuentes) | `references/licencias-y-guardas.md` |
| lleva un diagrama o una gráfica | `references/diagramas-starseed.md` |

Recursos listos en `assets/`: `starseed-simbolo.png` (símbolo oficial, 1000×1497), `tokens.css` y
`tokens.json` (variables de la marca para HTML, HyperFrames, artefactos y Figma).

## Flujo de trabajo

1. **Brief.** Fija público, canal, formato, duración, idioma y el resultado que se busca (entender, sumarse,
   asistir a un evento, instalar algo). Si falta algo esencial y hay persona al otro lado, pregunta una sola
   vez; si no, decide con criterio y dilo arriba del guion.
2. **Mensaje.** Una sola idea fuerza por pieza, anclada en uno o dos pilares de `narrativa.md`. Escribe la
   idea en una frase de 12 palabras o menos antes de diseñar nada.
3. **Guion y beats.** Usa la plantilla de `formatos-y-guiones.md` (tiempo, imagen, texto en pantalla, voz,
   sonido, fuente del dato). Todo dato del mundo real lleva fuente y fecha en la columna de fuente.
4. **Registro visual.** Elige el registro de identidad (Nexus/Trinity por defecto, o una variante de
   `adn-y-tokens.md` §6) según el pilar y el público. Variar de registro entre piezas está bien; mezclar
   dos registros dentro de una misma escena no.
5. **Producción.** Elige la ruta con el mapa de `herramientas.md`: lo propio y gratis primero (HyperFrames,
   Diagram Design, Shaders, Three.js, artefactos de Claude), los servicios con la cuenta de Alex después
   (Higgsfield, Canva, Figma, LottieFiles, Icons8) y siempre con su licencia aplicada.
6. **Revisión.** Pasa la autocomprobación de abajo, `scripts/comprobar_adn.py` sobre cada HTML/SVG y cada
   fotograma clave exportado, la revisión de textos (skill `slopmonster` para textos en inglés; para español
   aplica las reglas de redacción de `formatos-y-guiones.md` §9) y la de licencias.
7. **Entrega.** Entrega en el formato que se pidió (artefacto Slides/Design/Docs/Dashboard, MP4, HTML,
   SVG/PNG) y guarda el brief, el guion y las fuentes en un documento del proyecto StarSeed
   (`claude/<pieza>-AAAA-MM-DD.md`). Nunca publiques en redes ni en el OS sin la palabra explícita de Alex.

## Reglas de marca que no se negocian

- Colores solo desde tokens (`assets/tokens.css`): nada de hexadecimales sueltos en la pieza.
- Base de vídeo y escenas: **noche** `#0A0F1D` con la Trinity (zenith `#007FFF`, horizonte `#10B981`,
  lógica `#FFBF00`) y el anchor `#DC143C` como acento escaso. Base clara: **nieve** `#F8F9FA` con las
  variantes de texto oscurecidas. Los contrastes medidos están en `adn-y-tokens.md` §3: respétalos.
- Tipografía: Rajdhani (titulares), Inter (cuerpo), JetBrains Mono (solo lo técnico). Como mucho 3 tamaños
  por escena; titular/cuerpo con proporción de 6 o más; ningún texto por debajo de 28 px a 1080p.
- Firmas: paneles que entran desde el perímetro en proporción áurea (1:1.618); acciones en píldora (radio
  mayor de 16 px); un degradado radial de acento que cubra un 15 % del cuadro.
- Jugada rara, una sola vez por pieza: una línea de horizonte cruza la Trinity sin tocar el centro (1:2).
- Prohibido: ruido decorativo, controles o texto persistente en el centro sagrado, sombras múltiples,
  animar dimensiones (anima `transform` y `opacity`), destellos de más de 3 por segundo.
- El símbolo (vesica piscis, ojo y diamante) no se deforma, no se recolorea fuera de sus colores y respira:
  aparece por siembra (punto → dos círculos → ojo → diamante), nunca de golpe.

## Verdad, respeto y equilibrio

- «Basta de ilusiones»: cada número en pantalla es real, con fuente y fecha. Lo que StarSeed aún está
  construyendo se dice «en desarrollo»; nunca se muestra como si ya funcionara para todos.
- Al comparar con los sistemas de gobierno y económicos actuales, describe cómo funcionan con datos de
  fuentes reconocidas y con justicia, sin caricaturas ni ataques a personas, partidos o países concretos;
  presenta la propuesta de StarSeed como propuesta, con sus retos. Si un tema sigue en debate, muestra
  las posturas principales.
- Contenido sintético: cuando la ley o la plataforma lo pida, indícalo; no quites marcas C2PA.
- Personas reales: no generes su imagen ni su voz sin su permiso expreso.

## Accesibilidad (siempre)

Subtítulos en todo vídeo con voz; versión sin movimiento o con movimiento reducido para páginas animadas
(`prefers-reduced-motion`); contraste 4.5:1 para texto; dianas táctiles de 44 px o más en piezas
interactivas; nunca información solo por color; descripción del contenido visual en el texto que acompaña.

## Autocomprobación final (pruebas del ADN)

Antes de entregar, ejecuta y nombra el resultado de cada prueba. Si alguna falla, repara y vuelve a probar;
nunca entregues con una prueba fallida y una nota que la justifique.

| Prueba | Qué comprueba | Cómo |
|---|---|---|
| p1 | acento (Trinity + anchor) entre 20 % y 30 % del cuadro | `comprobar_adn.py --cuadro frame.png` |
| p2 | como mucho 3 tamaños de texto | `comprobar_adn.py pieza.html` |
| p3 | titular/cuerpo con proporción de 6 o más | `comprobar_adn.py pieza.html` |
| p4 | ningún texto por debajo de 28 px (vídeo, conferencia) | `comprobar_adn.py pieza.html --min 28` |
| p5 | líneas de cuerpo de 65 caracteres o menos | `comprobar_adn.py pieza.html` (aprox.) y mirada |
| p6 | la jugada rara aparece una sola vez | mirada sobre el storyboard |
| p7 | contraste de 4.5:1 o más para el texto | `comprobar_adn.py --par FG BG` y tabla de §3 |
| p8 | dianas de 44 px o más (si es interactiva) | `comprobar_adn.py pieza.html` (aprox.) y mirada |

El script dice «manual» cuando una prueba no se puede medir sola; en ese caso compruébala tú y dilo.
