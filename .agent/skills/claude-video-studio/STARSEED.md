# Claude Video 2.0 en StarSeed

Adaptación de StarSeed a esta skill (copia de ItsssssJack/claude-video-2, MIT). Léela antes de la etapa A
cuando la pieza sea de StarSeed OS, de una de sus secciones o mundos, o de una cuenta, grupo o página de la red.

## 1. La marca manda

- Antes de nada, carga la skill `starseed-estudio-audiovisual` y lee su `references/adn-y-tokens.md`
  (paleta, tipografía, contrastes medidos, firmas, registros y prohibiciones) y, si es una intro o un
  explicativo, `references/formatos-y-guiones.md`.
- El look por defecto es `starseed-trinity` (`styles/starseed-trinity/`): intro de canal de 7 s con la siembra
  del símbolo, la entrada cardinal de la Trinity, la línea de horizonte y el rótulo. Empieza siempre desde su
  pieza de referencia con `new_project.sh <dir> 16x9 <s> starseed-trinity`.
- Los otros 21 looks valen como **registros** de la identidad dinámica (variedad con coherencia): toma su
  movimiento y su composición, pero cambia su paleta por la de un registro de `adn-y-tokens.md` §6 y aplica
  las reglas de marca. Dilo en el brief («look `ink-line` en registro Materia Viva»).
- Conflictos con la lista de prohibiciones de la skill: en StarSeed la composición centrada, los cuatro
  colores de la Trinity (uno por papel) y un único brillo multicapa en la pieza protagonista son ley de marca.
  El resto de la lista se aplica igual.

## 2. Etapa A en la nube y en la Mac

- En Claude Code en la Mac, `scripts/gallery.py` abre la galería en el navegador de Alex.
- En una sesión de la nube (Cowork, claude.ai), 127.0.0.1 es el contenedor y la persona no lo ve: publica la
  galería como artefacto (los vídeos de esta copia son vistas previas de 640 px) o enséñale las fichas con
  su `best` de `gallery/looks.js` y el vídeo del look que encaje (SendUserFile).

## 3. Etapa B en español

Manda este bloque, tal cual, en un solo mensaje (salta lo que ya se sepa; «adelante» acepta todo):

1. ¿Para qué es y cuánto dura? (intro de canal, short, lanzamiento, explicativo, anuncio) [7 s, 16:9 y 9:16]
2. ¿Qué dice? (las palabras en pantalla) [lo escribo desde el tema]
3. ¿Hace bucle? [no]
4. ¿Registro de la identidad? (Trinity, Astraura, Genesis, malla, economía ecológica…) [Trinity]
5. ¿Medios reales? Tus fotos o clips, clips de IA con Higgsfield, o ninguno [ninguno]

## 4. Comprobaciones (todas, y se dicen sus resultados)

- Las de la skill: 3 fotogramas puntuados (8 o más), `pacing_check.py` y, si hace bucle, `loop_check.py`.
- Las del ADN: `comprobar_adn.py` del estudio StarSeed sobre el HTML (p2–p5, p8) y sobre un fotograma de la
  espera (`--cuadro`, p1: acento entre 20 % y 30 %); p6 (la jugada rara una sola vez) mirando el storyboard;
  p7 con `--par` para cada pareja de texto y fondo.
- Accesibilidad: subtítulos si hay voz; versión de movimiento reducido para páginas animadas.

## 5. Higgsfield y guiones

- Higgsfield entra por su conector de Claude o por `scripts/higgsfield.py` con la clave en el entorno o en
  `.env` (nunca en el chat). Nunca se gastan créditos sin el storyboard con su coste y un «sí» claro.
- Los guiones de Alex son la fuente: no se reescriben sin decirlo. Cada dato en pantalla lleva fuente y fecha
  («basta de ilusiones»); lo que está en desarrollo se dice en desarrollo.

## 6. Después de entregar

- Guarda brief, guion, storyboard, puntuaciones y resultados de las pruebas en el proyecto StarSeed
  (`claude/<pieza>-AAAA-MM-DD.md`). Nunca publiques en redes ni en el OS sin la palabra de Alex.
- Propón también sus variaciones (sobria, expresiva, experimental). Lo que Alex aprueba pasa a la Librería
  como variación de diseño y al artefacto del sistema de diseño «StarSeed OS»; el agente de referencias de
  diseño de MetaGenesis lo tiene en cuenta en sus propuestas.
- Interfaz del OS (widgets, orbe, menús de la Trinity): esta skill es para vídeo. Sus números de
  `references/motion-craft.md` se traducen a los tokens de interfaz del OS (140–350 ms, curvas del ADN) y a
  las skills `transitions-*`; nunca se copian duraciones de vídeo a la interfaz.

## 7. Escenas 3D con Blender

Un trabajo 3D es un DATO, no código: un `Trabajo3D` con vocabulario cerrado (`architecture/blender-3d.md` §4)
que Blender interpreta en un proceso aparte. Nunca se pega código libre de una persona o de una IA.

- **Cómo se pide:** `POST /api/3d/trabajos` en una neurona con Blender. La IA propone el trabajo y la persona
  lo confirma; importar archivos, los ámbitos `grupo`/`publica` y la calidad `final` siempre piden confirmación.
- **Cómo entra al Estudio:** el `render_mp4` y el `render_exr` que devuelve Blender entran a HyperFrames como
  cualquier otro medio (clip o fotograma para componer). El Estudio sigue componiendo; Blender solo aporta la
  escena 3D.
- **Plantillas:** viven en `servicios/blender-3d/plantillas/`; por ejemplo `intro-logo-facetado.json`, el logo
  de StarSeed facetado y lleno de luz, con la luz cálida en el ojo de la intro.
- **Sin Blender:** si ninguna neurona de la cuenta tiene Blender se dice claro y no se finge renderizar:
  «próximamente: ninguna de tus neuronas tiene Blender». La intro sigue siendo posible con three.js y
  HyperFrames; Blender es un medio que suma, nunca una dependencia.
- **Límites:** el perfil de la neurona recorta ancho, alto, muestras y fotogramas, y el trabajo se rechaza con
  su motivo en español si no cabe.
