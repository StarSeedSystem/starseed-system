# Fondos con Shaders: capas, sets en la Biblioteca, elección al crear el perfil y rediseño sugerido por Astraura

> **Petición de Alex (2026-10-18), resumida:** añadir https://github.com/shader-effects-inc/shaders a las opciones de
> fondos de todos los usuarios. Al crear cada perfil, una ventana para elegir su fondo o fondos (y que vuelva a salir
> a los perfiles ya registrados y con las actualizaciones); en los ajustes del perfil, de fondos y de diseño de
> perfiles, mensajes, grupos, páginas, comunidades, publicaciones, apps y contenido, en el lienzo de creación universal
> y en la Protomolécula. Fondos por página, app o sección, o para todo el perfil, guardables en las neuronas que elija
> o en el perfil completo. Al poner un fondo, Astraura sugiere un rediseño del resto (página o perfil) adaptado al fondo,
> con cualquier IA, habilidad y herramienta de diseño, según lo aprendido por sus capas de conciencia (privadas y
> públicas) y su cerebro; los diseños se editan al instante describiéndolos, rediseñables desde el código pero
> manteniendo todo visible, funcional, seguro, privado y adaptado a cada pantalla y aparato. **El fondo actual sigue
> siendo la opción principal.** Integrado en la Librería, con sus opciones siempre actualizadas, guardables en
> cualquier carpeta de su Biblioteca (o la de una página, grupo, mensaje o publicación) o aplicadas directamente. Cada
> configuración admite varias capas con varios fondos, transparencias y posiciones ajustables, incluidas capas de
> difuminado (transparente, borroso, blanco, negro o de cualquier tono y textura), guardables como sets.

Amplía `background-layers.ts` (la pila de capas sobre el motor base), `theme-engine.ts` (temas como paquetes de
tokens compartibles), `entity-theme-scope.ts` (tema por entidad), `director-diseno.md` (memoria, brief y
verificación de diseño), `protomolecula.md` y `libreria-biblioteca-sync.md`.

## 1. Qué es Shaders (comprobado el 2026-10-18)

- **Qué es:** efectos WebGPU como componentes (React, Vue, Svelte, Solid y JavaScript). Más de 200 efectos:
  degradados, ruido, vidrio, metal, luz, distorsiones, transiciones, desenfoques, partículas, efectos de cursor,
  texto. Se apilan como capas que se mezclan en la GPU.
- **Licencia: MIT** (motor, componentes y enlaces del paquete npm `shaders`). **Lo de shaders.com (editor visual,
  1.000+ presets «Pro», secciones, render HD) tiene sus propios términos y no se usa:** los presets de StarSeed los
  hacemos nosotros, Astraura o cada persona.
- **Versión:** `shaders` 4.0.4 (09-10-2026) con su dependencia `typegpu` (MIT). **Ya está en el OS** (commit
  c5b0c305a, añadió 5 paquetes, 29,5 MB).
- **Formato guardable:** un preset es JSON `{ components: [{ type, id, props, children }], structureVersion }` y se
  pinta con `createShader(canvas, preset, opciones)` de `shaders/js` (se actualiza en vivo con `update(id, props)`).
  `shaders/registry` da el catálogo (nombre, categoría, descripción, propiedades) de la versión instalada: **cada
  versión nueva trae sus efectos nuevos al catálogo sin tocar código**.
- **Solo WebGPU** (no tiene camino WebGL): sin WebGPU, ahorro de batería o «reducir movimiento» se muestra una imagen
  fija del set o el fondo actual.
- **Telemetría:** el paquete envía a shaders.com, en el 5 % de las sesiones, dominio, navegador, tipo de aparato y
  rendimiento. **En StarSeed siempre `disableTelemetry: true`.**
- **Cámara:** `WebcamTexture` y `ObjectTracker` usan la cámara: solo con permiso explícito, nunca en un fondo
  compartido, de grupo o público por defecto.
- **Skill para agentes:** `skills/shaders/` del repo (MIT) enseña a componer presets; se copia a
  `vendor/habilidades/shaders/` para que Astraura genere fondos describiéndolos.

## 2. El modelo: capas, difuminado y sets

- **El motor base de hoy (Spline por defecto) sigue siendo la opción principal** y la capa de abajo.
- **Capas nuevas en la pila** (`background-layers.ts`, versión 4, con migración): `shader` (un preset JSON) y
  `difusion` (modo transparente, desenfoque, blanco, negro o cualquier tono; intensidad, opacidad y textura: ninguna,
  grano, papel, escarcha). Toda capa gana posición, tamaño, rotación y máscara opcional, además de su opacidad, modo
  de mezcla y visibilidad de siempre.
- **Set de fondos** (`.starseed-fondo.json`): nombre, motor base, capas, autoría, licencias de lo que usa y una vista
  previa fija (para aparatos sin WebGPU). Se guarda en cualquier carpeta de la Biblioteca propia o de una página,
  grupo, mensaje o publicación, o se aplica directamente.

## 3. Dónde se aplica

- **Alcance con herencia:** perfil completo › app › página › sección; las entidades (grupo, página, comunidad,
  publicación, mensaje) usan su propio set con `entity-theme-scope`. Lo más concreto gana.
- **Neuronas:** se guarda en todas las neuronas del perfil o solo en las elegidas (las imágenes y vídeos viajan
  por `archivos-malla`).
- **Primera vez:** al crear un perfil, un paso «Elige tu fondo» (se puede saltar; si se salta, queda el actual). A
  los perfiles ya registrados les sale una vez, y otra cuando el catálogo trae fondos nuevos («novedades»), sin
  bloquear nunca.
- **Lienzo universal y Protomolécula:** átomo «fondo» para crear y editar sets como cualquier otra pieza.

## 4. Astraura sugiere el rediseño (sin romper nada)

1. **Paleta del fondo:** de los colores del preset y de una muestra del fotograma.
2. **Tres propuestas de diseño** (tokens de tema: colores, superficies, tipografía, radios, sombras, movimiento)
   para la página o el perfil, con la escala armónica y el ADN de diseño del Director de diseño, y la memoria de
   gustos de la persona. Lo privado del cerebro se usa solo en sus neuronas; en contextos compartidos, solo lo que
   ese contexto ya comparte.
3. **Editar describiéndolo:** «más cálido», «botones redondos», «estilo vidrio»… → un parche de tokens validado.
4. **Guardas que no se saltan:** solo se tocan tokens y variantes permitidas (nunca se oculta ni se desactiva un
   control esencial); contraste AA mínimo, objetivos táctiles ≥ 44 px, comprobación en los tamaños de pantalla
   del OS; si una propuesta no pasa, se descarta y se dice por qué. Siempre se puede deshacer.

## 5. Rendimiento

Un único dispositivo GPU para todas las capas shader de la pantalla; pausa con la pestaña oculta; 30 fps como
máximo con batería; vista previa fija si no hay WebGPU. Rendimiento real por aparato: **sin medir** (se medirá en
la verificación de la Ola 1018F).

## 6. Tareas (Ola 1018F, `cola-fondos-shaders-1018.json`)

| Bloque | Tareas |
|---|---|
| Biblioteca | A ficha de Shaders y categoría Fondos con sets oficiales StarSeed |
| Modelo | B capas shader y difusión con posición y máscara · C formato `.starseed-fondo.json` · D catálogo automático desde `shaders/registry` |
| Pintar | E capa shader (WebGPU, telemetría apagada, respaldo fijo) · F capa difusión · G la pila pinta las capas nuevas |
| Alcance y guardado | H alcance con herencia · I guardar sets en la Biblioteca · P sincronía con las neuronas elegidas |
| Primera vez y ajustes | J paso «Elige tu fondo» y su reaparición · K editor de capas en Ajustes |
| Rediseño | M paleta del fondo · L tres propuestas de diseño · N editar describiéndolo con guardas · Q habilidad de Shaders para Astraura |
| Creación | O átomo «fondo» en la Protomolécula y el lienzo |

Cada tarea toca como mucho 3 archivos y 120 líneas por archivo. Las escribe el enjambre; Claude dirige y verifica en
localhost (Ajustes → Apariencia → Fondo, bienvenida de un perfil nuevo, una página con su propio fondo).
