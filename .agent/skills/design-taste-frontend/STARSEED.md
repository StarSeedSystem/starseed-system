# tasteskill en StarSeed

Adaptación de StarSeed a esta skill (copia de Leonxlnx/taste-skill, MIT). Léela antes de la etapa «Draw» cuando la
pieza sea una página o una pantalla de StarSeed OS, de una de sus secciones, o de una cuenta, grupo, partido, evento
o página de la red.

## 1. La marca manda, el método se queda

La skill trae dos cosas distintas y se tratan distinto:

- **El método (vale siempre):** inventario de lo que solo tiene este sujeto → argumento (una afirmación con su prueba
  por sección) → una dirección elegida a propósito → las palabras primero → construir quieto → mirar capturas reales a
  1440, 768 y 390 px → arreglar los tres peores fallos → repetir. Y las reglas de **texto** (`references/copy.md`,
  `references/tells.md` §6): titulares de dos líneas o menos, nada de «Field notes» ni «Quietly trusted by», nada de
  pruebas inventadas (clientes, citas, cifras): en StarSeed es la regla «basta de ilusiones».
- **La estética de la casa de la skill (solo donde no hay ADN):** sin vidrio, sin brillos, sin degradados, sin
  sombras suaves, sin tipografía monoespaciada, sin líneas finas, sin crema con terracota. Es el gusto de la skill, no
  el de StarSeed. En el OS manda el ADN (`adn-y-tokens.md` y `memory/diseno/adn/<contexto>/dna.json`).

| La skill | El ADN de StarSeed | Gana |
|---|---|---|
| Vidrio con desenfoque (aviso), brillos y degradados (prohibidos), sombra suave de tarjeta (prohibida) | Cristal líquido (16 px; 10 px en Genesis), brillo multicapa en UNA pieza destacada, sombra simple en la interfaz de uso | ADN |
| Monoespaciada prohibida como voz «técnica» | JetBrains Mono para código y datos técnicos; Rajdhani en HUD | ADN (código y datos). La regla vale para etiquetas decorativas |
| Crema con terracota prohibido (`cream-terracotta`) | Registro «Café y comunidad física»: pergamino `#FDF7EA` + terracota `#C05C3B` | ADN en el Café: el inspector lo marcará y se justifica con el ADN |
| Navegación en píldora flotante con desenfoque (aviso) | Acciones siempre en píldora; paneles cardinales desde el perímetro | ADN |
| Líneas finas prohibidas | Borde fino de luz arriba en el cristal | ADN |
| Asimetría dentro de la rejilla | Composición centrada y espacio inteligente por aparato (Alex, 2026-10-19) | ADN |
| Sin cursor propio ni rueda capturada; escenas de scroll con GSAP ScrollTrigger y Lenis por CDN | Curvas y duraciones del ADN (140–350 ms), solo `transform` y `opacity`; GSAP «no charge» nunca en el editor visual del OS | ADN en la interfaz; las escenas solo en páginas propias publicadas fuera del editor |
| Familias de la dirección repartida | Satoshi / Rajdhani / Inter / Quicksand / JetBrains Mono | ADN (con `--keep palette,type`) |

Con el inspector, el mecanismo oficial es `--keep palette,type`: la skill reparte solo la composición y se asignan los
valores del ADN a los roles. Un `WARN` o `FAIL` que choca con el ADN se anota en el informe con su razón; no se esconde
ni se discute con el medidor.

## 2. Dónde se usa

- **Astraura (capacidad `taste`):** tarjeta (≤ 60 palabras) para Needle y BitNet, resumen (≤ 120) para Bonsai pequeño y
  este `SKILL.md` completo para razón, profunda y nube (tarea DSN1025A).
- **Páginas públicas de la red** (partido, grupo, comunidad, evento, asamblea) y publicaciones de tipo «página web» del
  Lienzo Universal: método completo; la estética, la del ADN de la entidad o, si no tiene, la del OS.
- **Estudio de Apps y pantallas de trabajo** (dashboards, ajustes, bandejas): `references/app-screens.md` entera. Sus
  reglas (bordes discretos, etiquetas pequeñas, estados vacío/cero/carga/error, datos que cuadran, cifras sin inventar)
  son compatibles con la sombra simple de la interfaz de uso del ADN.
- **Protomolécula (bloque de página web) y widgets:** el argumento y la crítica; el diseño sale del ADN.
- **Director de diseño y agente de referencias de diseño:** la lista de «tells» y la rúbrica de `critique.md` como segunda
  opinión al verificar una tarea de interfaz (tarea DSN1025B).

## 3. Con las skills que ya tenemos

- `starseed-estudio-audiovisual` (y su `adn-y-tokens.md`): fuente de verdad de la marca. Esta skill no la sustituye.
- `claude-video-studio`, `hyperframes`, `motion-graphics`, `general-video`: vídeo. No se solapan: `references/motion.md`
  de esta skill es de páginas web y **no se usa** para vídeo ni para la interfaz del OS.
- `transitions-dev`, `transitions-polish`, `transitions-ui-generation`: movimiento de interfaz con los tokens del OS;
  mandan sobre `motion.md`.
- `diagram-design`: diagramas. Sin solape.
- `slopmonster`: revisa textos en inglés; StarSeed escribe en español, así que `copy.md` se usa como método de
  estructura, no como detector.
- `.agent/skills/design-md`, `shadcn-ui`, `react-components`, `stitch-loop`: construyen componentes o pantallas; esta
  skill pone el criterio (qué decidir) y ellas lo construyen.

## 4. Si se instalan los scripts (Claude Code de la Mac)

Necesitan Node 22+ y un Chrome. Poner `TASTE_SKILL_HISTORY` y `TASTE_SKILL_TMP` dentro de la carpeta de datos de la
neurona (no en el home). `assets.mjs` busca imágenes en archivos abiertos y guarda su crédito: el crédito va al pie de
la página y la imagen hallada nunca se presenta como del cliente. La inspección final se hace sobre la compilación
(`next build && next start`), no sobre el servidor de desarrollo.
