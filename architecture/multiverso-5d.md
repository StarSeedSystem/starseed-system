# Multiverso 5D y el motor de Ramas 4D

Contrato de la dirección (25-11-2026, petición de Alex). Lo leen todas las tareas de la ola
`multiverso-1125` (MV1125*). Memoria del área: `areas/multiverso-5d` en las memorias del proyecto.

## Qué pidió Alex

1. Mejorar mucho la UI y la UX de **todas las redes 3D** de StarSeed OS, cada una según su caso.
   Ejemplo: Educación (hub social, grupos y páginas) tiene muchos formatos y ninguno sirve de
   verdad para ramificar en 3D.
2. **Ramificaciones dinámicas e interactivas en 3D/4D**, personalizables sin límite. En una rama
   puede haber **cualquier formato**, transmutable y utilizable desde cualquier medio.
3. La **estructura visual viva de los cerebros**: carpetas, archivos y memorias como recuerdos
   vivos multiformato, en 4D.
4. Un área, sección, página y concepto principal nuevos: **Multiverso 5D**. Es la representación
   viva y relativa de cómo se interconecta todo StarSeed (sistemas, cerebros, programas,
   interacciones y registros, públicos o privados) en tiempo real, como un universo infinito en
   movimiento, con filtros por capas.
5. Diseños profesionales de ramificaciones especializadas: política, educación, cultura,
   agentes, bots e IA de Astraura, la Protomolécula, el lienzo universal de creación y MetaGenesis.
6. Organización, estructura y acomodo inteligentes, autónomos y automejorables.

## Lo que hay hoy (y por qué no basta)

Siete vistas 3D sueltas, cada una con su propio grafo y su propia física:
`education/topic-graph-3d.tsx` (solo árbol de esferas, sin formatos ni rutas),
`brains/brain-mesh-3d.tsx` (/red-3d), `cerebro-mapa/brain-mindmap-3d.tsx`,
`brains/memory-graph-3d.tsx`, `exocortex/memory-mesh-3d.tsx`, `network/harmonic-graph-3d.tsx`,
`knowledge/knowledge-network.tsx` (/conocimiento). Ninguna escala a miles de nodos, ninguna
tiene tiempo, capas, privacidad ni contenido real dentro de las ramas, y no se reutilizan.

**Decisión:** un solo motor, **Ramas 4D** (`src/lib/ramas4d/` + `src/components/ramas4d/`), y
plantillas por caso encima. Las vistas viejas se pasan al motor una a una y no se borran hasta
verificar la nueva (quedan como «vista clásica» en el menú de la vista).

## Las cinco dimensiones

| Dimensión | Qué es en la interfaz |
|---|---|
| X, Y, Z | Espacio. La distancia es afinidad: lo vinculado, lo que se usa junto y lo de la misma persona o grupo queda cerca. |
| T (4.ª) | Tiempo. Todo se mueve con la actividad real. Línea de tiempo para volver atrás, avanzar, cambiar la velocidad o seguir «en vivo». |
| C (5.ª) | Capa y perspectiva. Planos que se encienden o apagan: capas de conciencia, capacidades, señales, alcance (privado, contactos, grupo, comunidad, público), tipo de sistema (político, educativo, cultural, social, IA, creación, MetaGenesis). La perspectiva es **relativa**: el universo se centra en quien mira (yo, mi grupo, mi comunidad, una neurona). Los **universos paralelos** son las variaciones, versiones y bifurcaciones (variaciones públicas, ramas de un proyecto, versiones de una propuesta). |

## Gramática visual (Trinity Liquid Crystal)

Neurona = estrella. Cerebro = galaxia o nebulosa. Carpeta = sistema. Archivo o memoria =
planeta o luna (más brillo = más uso; los recuerdos que no se usan se enfrían despacio, nunca
desaparecen solos). Agente, bot o Astraura = cometa que viaja por las aristas mientras trabaja.
Mensaje, señal o sincronización = partícula de luz sobre la arista, del color de su medio.
Programa vivo o proceso activo = cuerpo en órbita que gira mientras corre. Grupo, página,
comunidad, partido, E.F., asamblea o evento = constelación. Protomolécula y lienzo = nebulosa de
creación. MetaGenesis = núcleo con olas y tareas en órbita. La malla se dibuja como retícula
cristalina (neurona = silicio, señal = dióxido), coherente con `areas/malla-cristalina`.
Estilo y paleta: skill `starseed-estudio-audiovisual` y los tokens del tema activo; nada de
colores sueltos.

## Modelo (src/lib/ramas4d/modelo.ts)

- **Nodo**: `id`, `tipo` (neurona, cerebro, carpeta, archivo, memoria, publicacion, entidad,
  propuesta, leccion, obra, agente, bot, habilidad, conector, proceso, proyecto, capa, ola,
  tarea…), `titulo`, `formato` (texto, imagen, video, audio, modelo3d, app, web, documento,
  tabla, pizarra, presentacion, enlace, flujo, cualquiera — abierto, no un enum cerrado),
  `ref` (cómo abrirlo: ruta del OS, id de archivo, id de memoria; nunca el contenido privado en
  el grafo), `alcance`, `dueno`, `capas[]`, `t_creado`, `t_actividad`, `peso`.
- **Arista**: `de`, `a`, `tipo` (contiene, deriva, cita, prerrequisito, sincroniza, senal,
  transmuta, variacion, vota, participa, usa), `t`, `intensidad`.
- **Evento**: `t`, `tipo`, `nodo|arista`, `alcance` — lo que mueve el universo en vivo.
- **Rama**: un nodo con hijos de **cualquier formato**. Transmutar = pedir a
  `src/lib/conversion` otra forma del mismo contenido (texto→presentación, vídeo→transcripción,
  documento→tabla…) y colgarla como rama hermana con arista `transmuta`. Abrir = ir a la app del
  OS que corresponde, en 2D, 3D o XR.

## Privacidad (innegociable)

- Cada persona ve **solo lo que ya puede ver** hoy en el OS. El motor no abre ningún permiso.
- Lo privado ajeno **no aparece** (ni como punto, ni como recuento). Lo privado propio solo en
  los dispositivos y cerebros del dueño.
- El grafo lleva referencias, nunca contenido privado; el contenido se pide al abrir, con los
  permisos normales.
- El Multiverso **no crea registros nuevos de actividad**: lee las fuentes que ya existen.
  Nada nuevo se sube a servidores públicos. Sin tablas ni migraciones nuevas en esta ola.
- Compartir una vista (pública o privada) comparte la configuración de la vista, no datos que el
  otro no pueda ver.

## Rendimiento y accesibilidad

- Nodos con `InstancedMesh`, aristas en un solo `LineSegments`, partículas en un buffer.
- Zoom semántico: lejos, una galaxia es un cuerpo; cerca se abre en sistemas, planetas y
  contenido. Etiquetas solo cerca o al pasar el cursor.
- Topes por aparato con `src/lib/perf/device-tier.ts` (alto ~5 000 visibles, medio ~1 500,
  bajo ~400) y el modo de rendimiento (`modo-rendimiento.ts`): en eco y eficiente baja los
  cuadros y pausa sin uso, pero **no quita funciones ni diseños** (regla de Alex).
- La disposición (física) corre en un Web Worker; la escena nunca bloquea el hilo principal.
- Equivalente accesible: lista y árbol 2D navegable con teclado y lector de pantalla, mismos
  filtros; respeta «reducir movimiento».
- Pantallas chicas: controles en un menú completo, nada cortado ni amontonado.

## Interacción

Buscar y volar al nodo; seleccionar y ver el panel de detalle con el contenido real; abrir en su
app; transmutar; añadir rama de cualquier formato; vincular arrastrando; filtros de capas en
chips; línea de tiempo; cambiar de perspectiva; recorridos guiados por Astraura («explícame esta
galaxia»); entrar en VR/AR con el shell XR existente (`src/components/xr/shell/`).

## Personalización ilimitada

Cada vista guarda: plantilla, capas, perspectiva, formas e iconos por tipo, colores, física
(gravedad, distancia, velocidad), fondo, sonido espacial y diseño de etiquetas. Por persona y por
grupo, con variaciones públicas (`src/lib/variaciones/`) y compartible con permiso.

## Organización autónoma y automejorable

Astraura **sugiere** agrupaciones, etiquetas, enlaces y limpiezas; el dueño acepta o descarta.
En lo propio puede activar «aceptar solo», apagado por defecto. La disposición aprende del uso
(lo que se usa junto se acerca). Los sueños profundos analizan el área `multiverso`
periódicamente y proponen mejoras (dirección de diseño).

## Plantillas especializadas

| Plantilla | Qué ordena |
|---|---|
| Educación | Rutas de aprendizaje, prerrequisitos, progreso propio y del grupo, ramas de cualquier formato (lección, vídeo, ejercicio, proyecto, sesión en vivo, evaluación). |
| Cerebros | Carpetas, archivos y memorias como recuerdos vivos; fusionar y telepatía como aristas. |
| Política (PoliGenesis) | Propuesta → enmiendas → debates → votos → decisión → ejecución; partidos, asambleas, alineaciones. |
| Cultura | Obras, autores, corrientes, influencias, lugares y épocas. |
| IA | Astraura, agentes, bots, habilidades y conectores; quién llama a quién, en vivo. |
| Creación | Protomolécula y lienzo universal: proyectos, capas, recursos, versiones, colaboradores. |
| MetaGenesis | Olas, tareas, agentes, medios, sueños y publicaciones. |

## Página /multiverso

Todas las fuentes juntas, con la perspectiva relativa. Fuentes con un adaptador cada una
(`src/lib/ramas4d/fuentes/`): leen las librerías que ya existen (`brains`, `knowledge`,
`education`, `social`/`feed`, `entidad-espacio`, `governance`, `senales`, `network`,
`astraura-bots`, `agentes`, `protomolecula`, `canvas`, `metagenesis`, `events`, `variaciones`).
Entra en el dock y en las acciones rápidas; la configuración ya guardada de cada persona se
migra para que la vea (regla de propagación de mejoras).

## Puertas de la ola

tsc y pruebas de cada archivo; sin dependencias npm nuevas (three, @react-three/fiber, drei,
uikit y xr ya están); sin tocar las vistas viejas hasta que la nueva esté verificada; nada de
cambios de base de datos.
