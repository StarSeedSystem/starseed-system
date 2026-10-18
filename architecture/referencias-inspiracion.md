# Referencias e inspiración: categoría de la Biblioteca y conocimiento de las capas de Astraura

> **Petición de Alex (2026-10-18), resumida:** en la Librería, y como referencias conocidas por las capas de Astraura,
> una categoría «Referencias e inspiración» con varios temas y enlaces de todo tipo, programas y diseños ejecutables en
> publicaciones con vista previa, autoactualizable y lo más visual y dinámica posible. Las herramientas de Astraura
> deben poder recorrer esos sitios a fondo para encontrar las mejores referencias para cada contexto (personalidad y
> preferencias del agente, perfil, página, grupo, mensaje, publicación, pizarra, escritorio, ventanas flotantes) y
> convertirlas en diseños, funciones, transiciones, animaciones, botones, menús, 2D, 3D, AR y VR instalables en cada
> contexto, con integraciones externas como Higgsfield. Analizar cada enlace y ponerlo en su tema.

Amplía `director-diseno.md` (memoria, brief y verificación de diseño), `laya-y-habilidades.md`, `fondos-shaders.md`,
`diagramas.md`, `protomolecula.md` y `libreria-biblioteca-sync.md`.

## 1. El catálogo (datos verificados el 2026-10-18)

`config/referencias-inspiracion.json` (34 entradas en 7 temas): **Herramientas de IA para diseño** (Higgsfield,
Linearity, SlopMonster), **Guías y comunidad** (The Claude Design Blueprint, el vídeo origen, AI Automation Vault con
Design Loop), **Movimiento** (LottieFiles, transitions.dev, 60fps.design, Kinetics, Motion Primitives), **Marca**
(Brand Guidelines, Deck.Gallery, Logosystem, Visual Journal, Rebrand Gallery), **Tipografías e iconos** (Typewolf,
Fonts In Use, WhatTheFont, Fontshare, Flaticon, Icons8), **Inspiración de interfaz** (Navbar Gallery, Footer Design,
CTA Gallery, 404s Design, Unsection, BentoGrids, Savee, Mobbin, Refero, la lista de @iamtanzil_) y **Reglas y
principios** (Don't Make Me Think, ASD-STE100).

Cada entrada dice qué es, su acceso (libre, registro, pago, mixto), su **clase de uso** y sus **canales permitidos**,
lo que sus propios términos prohíben, cómo se detectan sus novedades y sus integraciones oficiales (MCP, API, CLI,
plugins). Lo que no se pudo comprobar está en `sin_verificar`, nunca inventado.

| Clase de uso | Cuántas | Qué significa |
|---|---|---|
| reutilizable | 2 | código abierto (MIT): se puede instalar y adaptar conservando el aviso |
| reutilizable con condiciones | 6 | recursos con licencia propia (atribución, plan, no redistribuir…): el OS aplica la condición en cada contexto |
| solo referencia | 22 | galerías y guías: se estudia el patrón y se crea una versión propia; nada se copia |
| solo enlace | 4 | lo abre la persona (comunidades cerradas, herramientas sin API, X) |

## 2. Lo que dicen los términos (y por qué Astraura no «raspa»)

La mayoría de estos sitios **prohíben el scraping, la descarga masiva y usar su contenido para entrenar IA** (Mobbin,
Refero, Savee, 60fps, Deck.Gallery, Rebrand Gallery, Fonts In Use, MyFonts, Logosystem, Brand Guidelines, Flaticon,
Icons8, LottieFiles). Varios ofrecen **canales oficiales para agentes**: MCP de Mobbin, Refero, Savee, 60fps,
LottieFiles, Icons8 y Higgsfield, y APIs de Mobbin, Fontshare, Icons8 y Flaticon. Por eso «a fondo» se hace así:

1. **Canal oficial con la cuenta de la persona** (MCP o API), dentro de sus cuotas, sin revender el acceso, sin
   guardar sus resultados como base de datos propia y sin entrenar nada con ellos.
2. **Sitios sin restricciones publicadas** (Navbar Gallery, Footer Design, CTA Gallery, 404s Design, Unsection,
   Kinetics, transitions.dev): lectura ligera de su sitemap y sus páginas, respetando `robots.txt`, con un agente de
   usuario que diga quién es, pausas entre peticiones y solo título, enlace y etiquetas (nunca copias de capturas).
3. **RSS donde lo hay** (Fonts In Use, Typewolf, la newsletter de Navbar Gallery) para las novedades.
4. **El navegador de la persona** para todo lo demás: Astraura le abre la página y lo que ella traiga se analiza.
5. **Resultado siempre propio:** de una referencia se extrae el patrón (estructura, jerarquía, ritmo, parámetros de
   movimiento, emparejamiento tipográfico) y Astraura diseña una versión nueva para ese contexto, con la referencia
   citada como inspiración. Nunca se copian textos, marcas, logos, capturas ni assets de terceros.

## 3. Lo que se puede instalar en cada contexto

| Recurso | Cómo entra | Condición que aplica el OS |
|---|---|---|
| Motion Primitives (MIT) | componentes adaptados a `framer-motion` (ya en el OS) | aviso MIT |
| transitions.dev (gratis) | su CLI `npx transitions-dev add --free` | conservar el comentario «transitions.dev» |
| Animaciones de LottieFiles | reproductor `@lottiefiles/dotlottie-react` (MIT) + su MCP | Lottie Simple License; en uso comercial, confirmar el plan |
| Fontshare | su CSS alojada | ITF FFL: nunca empaquetar los archivos |
| Icons8 | MCP o renderer PNG | enlace a Icons8 en el pie o «Acerca de» |
| Flaticon | su API | atribución; nunca en un pack de iconos; nunca para entrenar IA |
| Higgsfield | MCP o CLI con la cuenta de la persona | créditos de pago suyos; revelar contenido sintético cuando toque |
| SlopMonster (MIT) | skill de revisión de textos en inglés | aviso MIT |

## 4. Cómo aparece (visual y dinámico)

- **Biblioteca › Referencias e inspiración:** pestañas por tema, tarjetas con portada, nombre, tipo, acceso, insignia
  de clase de uso y botones «Abrir», «Usar como inspiración» e «Instalar» (solo si se puede).
- **Portadas sin rastreo:** por defecto una portada generada por el OS (degradado StarSeed + nombre + icono del
  tipo). La imagen del sitio (og:image) solo se carga cuando la persona abre la tarjeta, directa desde el sitio y sin
  guardarla; el vídeo, con el reproductor de YouTube sin cookies.
- **En todos los contextos:** las referencias que Astraura elige salen como tarjetas en su respuesta del chat, en el
  panel «Inspiración» de la Protomolécula, como bloque en el lienzo y las publicaciones, y como widget en la pizarra,
  el escritorio y la capa flotante.
- **Elección por contexto:** Laya elige tema y subtema por la petición, y el orden tiene en cuenta la personalidad
  del agente, el ADN de diseño y la memoria de gustos del perfil, página o grupo (lo privado solo en sus neuronas).

## 5. Se actualiza sola, sin cambiar licencias a escondidas

El vigía de referencias revisa cada día los canales permitidos de cada entrada (RSS, sitemap con fecha, GitHub, npm,
API de Fontshare) y marca novedades. Una vez al mes compara la página de términos de cada sitio: si cambia, la
entrada queda «a revisar» y **su clase de uso no cambia sola** (lo revisa Claude o Alex).

## 6. Tareas (Ola 1018R, `cola-referencias-1018.json`)

| Bloque | Tareas |
|---|---|
| Datos y reglas | A cargar y validar el catálogo · B política de canales por fuente · C principios de usabilidad y redacción con palabras propias |
| Biblioteca | D panel y tarjetas por tema · E portadas sin rastreo |
| Astraura | F herramienta `referencias.buscar` · G de referencia a diseño propio · H conectores oficiales (MCP y APIs) |
| Instalables | I recursos con su licencia aplicada · J reproductor de animaciones Lottie |
| Superficies | K widget y bloque en todos los contextos |
| Actualización | L vigía de referencias y de términos |

Cada tarea toca como mucho 3 archivos y 120 líneas por archivo. Las escribe el enjambre; Claude dirige y verifica en
localhost (Biblioteca › Referencias e inspiración, un chat de Astraura que pide «un menú como los mejores» y la pizarra).
