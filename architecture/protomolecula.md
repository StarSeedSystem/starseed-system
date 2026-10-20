# Protomolécula · la función universal de creación y edición (2026-10-10)

> Petición de Alex del 2026-10-10 (resumida). **Contrato escrito ANTES del código** (regla dorada).
> Núcleo puro ya escrito y probado: `src/lib/protomolecula/{tipos,parametros,dictado,vinculos-control,permisos}.ts`
> (120 pruebas verdes). El catálogo de herramientas (`catalogo-herramientas.ts`) lo escribe otra sesión;
> aquí las herramientas se citan **por id**. La cola del enjambre: `starseed_memory_root/olas/cola-protomolecula-1010p.json`
> (ids `PM1010F<fase><letra>`, §12).
>
> **ProtoGenesis** (Alex, 2026-10-13): toda creación con la Protomolécula pasa por el proceso
> multiagéntico de `architecture/protogenesis.md` —encargo con criterios, director que planifica
> los pasos sobre los átomos, varios agentes a la vez, verificador distinto del autor y decisión
> de quien manda en el ámbito (Genesis, PoliGenesis o, si hace falta código del OS, MetaGenesis)—.

## 0 · Las reglas que mandan (de `CLAUDE.md`, no se tocan)

1. **Editable sí, ejecutable no.** El núcleo del OS jamás ejecuta código ajeno. Lo de terceros corre
   **aislado**: iframe con `sandbox` y puente `postMessage` con origen verificado, WASM en un Worker, app
   nativa o servicio aparte. La interfaz del OS sigue siendo un dato declarativo (`src/lib/nucleo/ui-spec.ts`,
   `invariantes.ts`, `paquete-sistema.ts`); la Protomolécula **no añade ningún camino que ejecute código en el núcleo**.
2. **La Protomolécula propone, una persona acepta.** Los cambios de código son **candidatos** revisables (§8).
3. **Nada de ilusiones.** Una herramienta que no corre aún se marca «próximamente» con su motivo (falta SHA,
   falta app nativa, falta permiso…). Un botón sin efecto real no se pinta.
4. Nada de `node:*` en código de cliente. Claves solo por **nombre de variable**. Español claro.
5. Salud de wearables: **local por defecto**, consentimiento por métrica, jamás en sesión pública sin permiso
   expreso, y **sin afirmaciones médicas** (§8.3).

## 1 · Mapa de lo que ya existe (se lee, no se reescribe)

| Pieza | Dónde está | Qué aporta a la Protomolécula | Qué le falta |
|---|---|---|---|
| **Lienzo Universal / Centro de Creación** | `architecture/centro-creacion-sync-permisos.md`, `src/app/(app)/crear/page.tsx`, `src/components/creation/{lienzo-composer,creation-blocks,creation-center}.tsx`, `src/lib/creation/post-blocks.ts` (`PostBlockType`), render en `src/components/social/post-blocks-renderer.tsx` | Bloques de publicación con metadata `ss:meta`; el código de una publicación ya corre SIEMPRE en iframe aislado (`post-blocks.ts` ~l.279) | Un bloque `protomolecula` |
| **Pizarras / ventanas** | `src/lib/canvas/canvas.ts` (`BlockKind`: text, file, vault, memory, app, link, widget, browser, image), `src/components/canvas/canvas-board.tsx` (motor «starseed») y `tldraw-board.tsx` (motor «tldraw»), `src/lib/canvas/board-engine.ts`, `workcenters.ts` (`CanvasEdge` = enlace entre ventanas) | Ventanas ajustables y **aristas entre bloques**: ya son el grafo de convergencia | Un `BlockKind` `protomolecula` |
| **Salas compartidas** | `src/lib/salas/sala.ts` (5 tipos, roles dueño/editor/comentarista/observador, `elegirTransporte`), `sincronia-sala.ts` (`fusionarEstados` determinista con lápidas, prioridades P0–P3), `plantillas-sala.ts` | Roles, transporte «malla primero» y fusión sin perder trabajo | Una sala `molecula` (usar `pizarra`/`escena3d` mientras tanto) |
| **Escritorios, dashboards, widgets** | `src/app/(main)/escritorios`, `src/components/desktop/*`, `src/components/dashboard/{dashboard-types,widget-manifest,widget-registry}.tsx`, launcher `apps/app-catalog.ts` (`APP_CATALOG`, modos `embed|window|popup|tab|route|installed`) | Cómo se registra un widget (`WidgetType` + `WIDGET_MANIFEST` + `case` en el registro) y una app de ventana | Widget y app `protomolecula` |
| **Orbe flotante de Astraura** | `src/components/aurora/aurora-widget.tsx` (montado en `src/app/layout.tsx`), `aurora-orb.tsx`, `quantum-orb.tsx`, bus `src/lib/aurora/aurora-orb-bus.ts` (claves `starseed.aurora.orb.pos.v1`, `…orb.hidden.v1`, `starseed.aurora.fab.enabled.v1`, sincronizadas por `settings-sync.ts`) | Posición arrastrable recordada, descarte, preferencia sincronizada | Una orbe gemela |
| **Agentes y herramientas de agente** | `src/lib/aurora/actions.ts` (`AURORA_ACTIONS`, protocolo `[[ACCION: nombre {json}]]`, `actionsSystemPromptSection`), `src/ai/client/ai-permissions.ts` (`PermissionScope`), `src/lib/agentes/taller.ts` (catálogo de recursos del agente), `src/lib/agents/{builtins,store}.ts`, `src/lib/agents/agentes-grupo.ts` (`sanearParaGrupo`) | Cómo un agente actúa en el OS y con qué permisos | La acción `protomolecula` |
| **Mensajes de agente** | `src/components/aurora/message-renderer.tsx` (`CodeBlock` → `CodeRunner` de `code-runner.tsx`, que ya corre código en iframe aislado con consola vía `postMessage`) | Un bloque ```` ```lang ```` puede pintarse como programa vivo | Un bloque ```` ```protomolecula ```` |
| **Voz y dictado** | `src/lib/aurora/dictation.ts` (Web Speech), `src/lib/aurora/stt-oss/vibeasr-local.ts` (VibeASR local), `src/lib/aurora/voz-starseed/*`, Jev `src/lib/jev/*` (decisión barata por opciones), Needle `src/lib/astraura/{needle-wasm,needle3-client}.ts` | Texto dictado ya llega; la gramática de órdenes la cubre `dictado.ts` | Conectarlo a la barra/orbe |
| **Estaciones** | `src/lib/estaciones/{transmision-parametrica,reloj-comun,mezclador,puente-omnifrecuencias,estudio-escenas}.ts`; `architecture/estaciones-en-vivo-parametricas.md` | **Ya es** «viajan parámetros, no audio»; reloj común tipo NTP con precisión honesta; puente `postMessage` con origen verificado (la plantilla del nuestro) | Adaptar `ParametrosSesion` al esquema `Parametro` |
| **Transporte universal y llamadas** | `src/lib/malla/{transporte-universal,eleccion-enlace,canal-multitrayecto,llamada-directa,emparejar-sin-internet}.ts` (`enviarMensaje(canal)`, `alRecibirMensaje`, `enviarArchivo`, `abrirFlujo`; LoRa 200 B) | P2P primero, sin internet; canal de datos `ll.*` en llamadas | Canal de aplicación `protomolecula` |
| **Permisos universales** | `src/lib/sharing/access.ts` (ámbitos `private|profile|account|custom|public`, roles `view|comment|edit|admin`, `ShareAccessDialog`) | Compartir molécula como cualquier recurso | `ResourceType` `molecula` |
| **Núcleo intocable** | `src/lib/nucleo/{invariantes,ui-spec,paquete-sistema,alcance-memoria}.ts` | Invariantes; `revisar()` de paquetes; ámbitos personal › perfil › grupo › pública | — (no se modifica) |
| **Biblioteca** | `src/lib/library/{packages,actualizaciones,fuentes-decision,oss-catalog-bridge}.ts`, `src/lib/oss-library.ts` (`OssCategory` incluye `creation`), `src/app/api/library/actualizaciones/route.ts` (consulta sin claves, caché 6 h), autoactualización `starseed.library.autoupdate.v1` | Fichas con enlace al repo, versión instalada vs remota | Categorías de la Protomolécula y su script de refresco |
| **Actualizaciones por capas** | `architecture/actualizaciones-por-capas-y-niveles.md` (niveles MetaGenesis/PoliGenesis/Genesis, capas `datos|interfaz|sw|servicios|modelos|nativa`, ramas `estable|beta|propia`, canaria, vuelta atrás) | Política de actualización y ramas | Aplicarla a cada herramienta |
| **Genesis / PoliGenesis** | `src/lib/genesis/{operaciones,aplicar,historial}.ts`, `architecture/genesis-niveles-malla-universal-estaciones.md` | Patrón «la IA solo PROPONE operaciones tipadas; vista previa; aplicar con deshacer; en modo democrático es una propuesta que se vota» | — (mismo patrón, otro dominio) |
| **Neuronas** | `src/lib/neurons/*` (`neuron_devices.capabilities`: núcleos, memoria, GPU; presencia; señales por medio), `src/lib/astraura/perfil-hardware.ts`, `architecture/{neuronas-un-aparato,neuronas-capacidades-modelos,gestion-por-neurona}.md` | Qué tiene cada aparato | «NAS/procesador» para terceros: **pedido, no hecho** |
| **Oracle** | `architecture/oracle-nube.md` | A1 = **2 OCPU y 12 GB** (no 4/24), ya con Caddy, Astraura 1.58, Postgres, malla y MediaMTX | Poca holgura; sin GPU |
| **3D y XR** | `src/components/vivo/espacial/*` (`escena-compartida`, `lienzo-escena`, `objeto-3d`, `cargar-modelo.ts` glTF, `texturas.ts`, `use-sesion-xr.ts`, `agarre-xr.tsx`), `src/components/dashboard/apps/immersive/use-webxr.ts`, rutas `/escena`, `/sala-xr`, `/xr`, `/immersive`, `/red-3d`, `/memorias-3d`; `three` y React-Three-Fiber están en el repo | Escena 3D compartida con avatares y WebXR | Otra sesión escribe el contrato XR: **coordinar, no duplicar** |
| **Generación audiovisual** | `architecture/generacion-audiovisual-astraura.md` (`src/ai/astraura/media/media-gen.ts`, imagen gratis primero), `architecture/director-produccion.md` | Router gratis-primero y límites honestos | Conectar a átomos |
| **Sensores** | Cámara/micrófono/ubicación/pantalla en `src/lib/senses/senses.ts`; Bluetooth, serie y Meshtastic en `src/ai/astraura/mesh/{signals,meshtastic-adapter}.ts`, `src/lib/neurons/senales-medio.ts` | Permisos del navegador ya gestionados | **Nada** de MIDI, gamepad, HID, OSC ni wearables: no hay una sola línea (comprobado) |

**Patrones del repo que se imitan:** dependencias del navegador **inyectadas** (`estaciones/mezclador.ts`), fusión determinista con
lápidas (`salas/sincronia-sala.ts`), puente `postMessage` con origen verificado (`estaciones/puente-omnifrecuencias.ts`),
catálogo declarativo + ficha de Biblioteca (`oss-catalog-bridge.ts`), «capas sin SHA no se usan» (`config/capas-astraura.json`).

## 2 · Qué es (en palabras de Alex)

**Protomolécula = una función universal de creación y edición, ejecutable desde cualquier medio por cualquier
IA o app del OS.** Fusiona las herramientas profesionales de producción audiovisual y 3D (imagen, audio, vídeo,
sonido, síntesis, escenarios 3D con texturas programables en tiempo real, arquitectura, prototipos con físicas,
videojuegos, VR/AR). Se controla **a mano o por la IA de Astraura con dictado en tiempo real de cada parámetro**
(valor exacto o relativo). Está en el lienzo universal, en la edición y réplica de archivos de la biblioteca
privada y de ramas de versiones públicas en cualquier servidor vinculado, en pizarras con varias ventanas cuyos
resultados convergen, dashboards, widgets, escritorios, páginas de política/educación/cultura, estaciones y
canales, llamadas mesh P2P y sesiones 3D, y en los mensajes de respuesta de cada agente; como widget o como orbe
junto a la orbe de Astraura; privada o pública, compartible y sincronizada en tiempo real (malla P2P primero);
con controles vinculables a mandos externos o internos (MIDI, mezcladoras, equipos de audio, entradas directas
de audio/vídeo, cualquier dispositivo) y medidores de wearables; con autoactualización de cada herramienta y
Biblioteca por categorías; e incluyendo **todas las apps del catálogo de getarcraft.com/apps** usando su código
abierto, más lo mejor de GitHub. Puede leer y proponer código y convertir entre formatos y lenguajes, siempre
dentro de los límites de seguridad y privacidad del OS.

**Lo que NO es:** no es «un Blender dentro del navegador» ni un mismo editor gigante. Es **una capa que une
programas abiertos** (cada uno en su aislamiento) bajo un modelo común, un panel común de parámetros y una
sesión común. Lo que una herramienta no pueda mover desde fuera, **se declara** (control: «solo ventana»).

## 3 · Modelo único: molécula y átomos

### 3.1 La molécula (`tipos.ts#Molecula`)

Un **documento vivo** con id, título, ámbito (personal › perfil › grupo › pública), `capas[]`, `atomos[]` y `valores`
(el estado de todos los parámetros, por `atomoId::parametroId`). Las capas son el contenido; los átomos son quien lo
produce o lo transforma.

| Tipo de capa | Formato de referencia | Notas |
|---|---|---|
| `escena3d` | glTF 2.0 (`.glb`) y, cuando haga falta, USD | glTF ya se carga (`vivo/espacial/cargar-modelo.ts`); USD solo vía conversión |
| `linea-tiempo` | OpenTimelineIO (JSON) | montaje de vídeo/audio como lista de clips con referencias; OTIO es abierto (Apache-2.0) |
| `grafo-audio` | grafo de Web Audio (JSON declarativo de nodos y conexiones) | no es audio: son nodos y parámetros; el audio se genera en cada medio |
| `lienzo2d` | SVG / PNG / lienzo del OS | |
| `codigo` | texto + lenguaje | **candidatos**, nunca ejecutados por el núcleo (§8) |
| `datos` | JSON / CSV | tablas, MIDI como datos, curvas de automatización |

Cada capa trae `referencia: ReferenciaEntidad | null` (tipo, id, versión opcional) a una **Entidad Única** de la
Biblioteca o de un servidor vinculado. **La molécula cita, nunca copia**: sin referencia, la capa es contenido propio
de la molécula; con referencia, es una vista de la entidad (si se edita, se crea una **rama**, §6.4).

### 3.2 Los átomos y los tres grados de integración

Un `AtomoEnUso` = una instancia de una herramienta del catálogo (`herramientaId`), con su capa, dónde corre (`Computo`)
y su estado. Dos instancias de la misma herramienta no se pisan: los parámetros se direccionan con `ParametroRef{atomoId, parametroId}`.

El catálogo (otra sesión) declara por herramienta su `integracion`. Honestidad sobre lo que cada una **puede**:

| `integracion` | Cómo corre | Qué control universal ofrece | Ejemplo de patrón |
|---|---|---|---|
| `libreria-js` | Librería abierta dentro del bundle del OS (como ya se hace con `three`) | **Total**: nosotros escribimos el envoltorio y declaramos sus parámetros | sintetizador Web Audio, texturas WebGL, escena three.js |
| `wasm-en-worker` | WASM en un Worker, sin DOM | Total (parámetros por mensajes al Worker) | ffmpeg.wasm, motores de físicas, conversores |
| `iframe-aislado` | Página en iframe con `sandbox` y puente `postMessage` | **Total solo si hay envoltorio propio** (página nuestra con SRI que importa la librería). Una **app ajena completa** se embebe tal cual y su control es «solo ventana» + archivos de entrada/salida | editor 3D de three.js, Excalidraw |
| `app-nativa-puente` | App de escritorio (Blender, Krita…) lanzada por la app nativa del OS | Por lo que la app ofrezca (MIDI/OSC/CLI/Python) y solo con confirmación | Blender, Kdenlive |
| `servicio-local` | Servicio en `127.0.0.1` de una neurona (ComfyUI, Ollama, ffmpeg) | Por su API; el OS guarda solo el **nombre** de la variable del token | ComfyUI, difusión local |
| `servidor-remoto` | Servidor vinculado (Oracle, el de un grupo) | Por su API y el ámbito del servidor | render en la nube |
| `solo-enlace` | No corre en el OS | Ninguno: ficha con descripción y enlace; **«próximamente: <motivo>»** | apps cerradas o sin código abierto |

> **Esto resuelve «incluir TODAS las apps de getarcraft».** Todas entran en el catálogo y la Biblioteca el
> mismo día (con licencia, enlace y su `integracion` real). Que cada una **se mueva por parámetros** depende de
> su grado: las que solo se pueden embeber o lanzar lo dicen. No se finge control que no existe.

### 3.3 Cómo convergen los resultados de programas distintos

Dos programas de formatos distintos no se mezclan «dentro»: **intercambian exportaciones intermedias** y la molécula
las **referencia**.

1. Cada átomo declara qué **entradas** acepta y qué **salidas** da, con formato (`glb`, `wav`, `svg`, `otio`, `json`…).
2. Una salida se guarda como **entidad** (Biblioteca/archivo del servidor vinculado) y la capa de destino recibe una
   `ReferenciaEntidad`; no se copian bytes entre átomos.
3. Si el formato de salida de A no es el de entrada de B, el **registro de convertidores** (F2) busca la cadena
   más corta (`obj→glb`, `pcm→wav`, `csv↔json`, `srt↔vtt`, `svg→png`…), cada paso con su `via`: JS puro, WASM o servicio.
   Si no hay cadena, se dice («no hay conversor de X a Y») en vez de fingir.
4. En una pizarra, **las aristas ya existentes** (`CanvasEdge`) entre ventanas son las dependencias: la arista A→B
   significa «la salida de A alimenta a B». Se detectan ciclos y se ordena topológicamente.
5. Una ventana «Resultado» (capa de salida) compone la vista final: audio mezclado en el grafo, escena 3D con
   texturas generadas por otra ventana, línea de tiempo con clips de las demás.

## 4 · Superficie de control universal

La idea central: **un mismo parámetro lo mueve cualquiera** (mano, IA, dictado, MIDI, gamepad, sensor, agente) por la
misma puerta, y todo cambio es una **`Operacion` reversible con autor y origen**. Es lo que hace posible el
dictado en tiempo real, el deshacer colaborativo y la auditoría.

### 4.1 Esquema de parámetro (`Parametro`)

`id`, `nombre`, `sinonimos[]` (para dictar), `tipo` (`numero|entero|booleano|opcion|disparo`), `min`, `max`, `paso`,
`unidad` (`% dB Hz kHz s ms bpm grados px m cm x semitonos fps K lux`), `opciones[]`, `defecto`. Lo declara la
herramienta (su envoltorio o el puente `postMessage`, que **sanea** lo que declare un tercero: máx. 64 parámetros,
textos acotados, sin HTML).

### 4.2 Operación (`Operacion`)

`{ id, objetivo:ParametroRef, accion, autor:{tipo,id,nombre?}, origen, t, fuente?, texto? }`

- `accion`: `exacta{valor}` · `relativa{cantidad, modo}` · `alternar` · `disparo`. Modos relativos: `delta` (en la
  unidad del parámetro), `porcentaje-valor`, `porcentaje-rango`, `pasos`.
- `origen`: `mano · ia · dictado · midi · gamepad · hid · osc · sensor · agente`.
- Reglas numéricas (`parametros.ts`, con pruebas):
  - **Exacta no se ajusta al paso**: «brillo exactamente en 1,2» queda en 1,2 aunque el paso sea 0,5. Solo se acota al
    rango (y se redondea si el parámetro es entero). Si se acotó, `Cambio.acotado` lo dice.
  - **N % relativo = N % del valor actual**, siempre en el sentido pedido (también con negativos). Si el valor es 0 o
    el parámetro va en dB, el N % se toma sobre el **rango** y el cambio lo avisa en `nota`.
  - En parámetros que **ya van en %**, «un 10 %» son 10 **puntos**.
  - Las opciones se mueven por pasos sin dar la vuelta; un botón (`disparo`) no guarda estado y no se deshace.
- **Deshacer** (`deshacerCambio`, `deshacerUltimo`, `rehacerUltimo`): cada autor deshace **lo suyo**; si otra persona o un
  mando tocó el valor después, no se pisa su cambio (salvo forzar).

### 4.3 Dictado (`dictado.ts`)

`entenderDictado(frase, candidatos, ctx)` y `entenderVarias(...)` («…y baja los graves 3 dB»). Gramática (sin tildes ni mayúsculas):

| Familia | Verbos / formas | Resultado |
|---|---|---|
| Relativa | sube · baja · aumenta · reduce · incrementa … + `un N %`, `N dB`, `N pasos`, `un paso` | `relativa` |
| Destino | pon · fija · ajusta · deja · cambia … `en/a N <unidad>`; `sube/baja … A N` también es destino | `exacta` |
| Límites | `al máximo` · `al mínimo` · `a tope` · `a la mitad` (también sin verbo: «brillo al mínimo») | `exacta` |
| Opciones | `pon el filtro en paso alto` | `exacta` (nombre canónico) |
| Interruptor | activa · enciende · desactiva · apaga · alterna | `exacta` / `alternar` |
| Botón | dispara · lanza · pulsa · ejecuta | `disparo` |
| Números | cifras `1,2` `1.2` `-3`; palabras `veinticinco`, `treinta y cinco`, `ciento veinte`, `dos mil quinientos`, `uno coma cinco`, `tres y medio`, `menos tres` | |
| Unidades | `kHz→Hz`, `ms↔s`, `cm↔m` se convierten; `50 %` de un parámetro sin % = mitad del **rango** | |

**No adivina.** Devuelve `{ok:false, razon, sugerencia, candidatos?}` si: falta la cantidad («¿cuánto subo?»), la cantidad es
vaga («un poco»), el nombre no existe (lista los controles) o se parece pero no es igual («¿Quisiste decir Reverberación?» y
**no se aplica**), hay dos controles con el mismo nombre («del bajo» desambigua), la unidad no cuadra («Frecuencia va en
Hz y no sé pasar dB a eso»), o sobran palabras. La sugerencia está escrita para leerse en voz alta.

El motor de voz es el que ya existe (Web Speech `dictation.ts`, VibeASR local); la gramática no necesita un modelo, pero
Needle/Jev pueden **ayudar a elegir candidatos** cuando haya muchos controles (F7), siempre devolviendo una `Operacion`
que pasa por `decidirOperacion` y se puede deshacer.

### 4.4 Vínculos de control (`vinculos-control.ts`)

`FuenteControl`: MIDI (CC · nota · pitch, canal, dispositivo) · gamepad (eje/botón) · HID (byte de un informe) · OSC
(dirección) · sensor (id, eje). `Vinculo`: fuente → parámetro, `modo` (`absoluto · relativo · alternar · disparo`) y `Curva`
(zona muerta → forma `lineal|log|exp` → invertir; suavizado en el estado). Los mandos absolutos respetan el `paso`; los
cambios menores que medio paso (o el 0,1 % del rango) no se emiten; los encoders MIDI relativos (1–63 suma, 65–127 resta)
se leen como pasos; alternar y disparo actúan solo al **pulsar**.

**Modo «aprender»** (máquina de estados pura): tocas un parámetro → «escuchando» (15 s) → mueves el mando → se da por
detectado tras **3 mensajes con al menos el 15 % de recorrido** (un botón, a la primera pulsación) → confirmas o cancelas.
El ruido de otro control no engaña. **Los sensores no se aprenden moviéndolos**: se eligen de una lista, porque exigen
consentimiento (§8.3).

Lo que falta es la parte con hardware: los adaptadores (Web MIDI, Gamepad API, WebHID/WebSerial, puente OSC) que llaman a
`procesar` (F6). Hoy el núcleo está probado con entradas simuladas; **ningún mando real está conectado aún**.

## 5 · Dónde aparece y cómo la abre un agente

Un único componente de panel (`PanelProtomolecula`) se monta en todas las superficies; cambia solo el marco.

| Superficie | Cómo se monta | Integración existente |
|---|---|---|
| **Orbe gemela** | Orbe arrastrable junto a la de Astraura; claves `starseed.protomolecula.orbe.pos.v1` / `….enabled.v1` (sincronizadas, con migración de defaults: regla de `starseed-os-update-propagation`) | `AuroraWidget` en `src/app/layout.tsx`; posiciones de `aurora-orb-bus.ts` como referencia |
| **Widget** | `WidgetType` `PROTOMOLECULA` + entrada en `WIDGET_MANIFEST` + `case` en `widget-registry.tsx` | dashboards, escritorios (`desktop-widget-host.tsx`) |
| **App de ventana** | Entrada en `APP_CATALOG` (`open: {primary: "window"}`) | escritorios, launcher |
| **Lienzo universal (publicaciones y mensajes)** | `PostBlockType` `protomolecula` serializado en `ss:meta` | `lienzo-composer.tsx`, `creation-blocks.tsx`, `post-blocks-renderer.tsx` |
| **Pizarras con varias ventanas** | `BlockKind` `protomolecula`; cada bloque es un átomo; las `CanvasEdge` son la convergencia | `canvas.ts`, `canvas-board.tsx` (motor «starseed»; el motor «tldraw» queda fuera de F0–F2: **honesto**) |
| **Biblioteca (edición y réplicas)** | Abrir un archivo de la Biblioteca privada o de una rama pública en un átomo adecuado; editar crea **rama**, no pisa | `entity-library.ts`, `media-library.ts`, ramas de `actualizaciones-por-capas-y-niveles.md` |
| **Páginas de política/educación/cultura** | Mismo bloque en el compositor de cada sección (`/publish?area=…`) y widget en la página | `architecture/centro-creacion-sync-permisos.md` §2 |
| **Estaciones y canales** | Adaptador `ParametrosSesion → Parametro[]`: la entonación de una estación se mueve con el mismo panel | `estaciones/transmision-parametrica.ts` |
| **Llamadas mesh P2P** | Canal de datos `pm.*` junto a `ll.*` de la llamada directa | `malla/llamada-directa.ts` |
| **Sesiones 3D y XR** | Parámetros como asas en la escena y panel en el visor | `vivo/espacial/*`, `use-sesion-xr.ts`; **contrato XR de otra sesión** |
| **Mensajes de agentes** | Bloque ```` ```protomolecula ```` (JSON de molécula mínima) en `message-renderer.tsx#CodeBlock` | mismo patrón que `CodeRunner` |

### 5.1 La herramienta de agente `protomolecula`

Entrada nueva en `AURORA_ACTIONS` (`src/lib/aurora/actions.ts`), llamada con `[[ACCION: protomolecula {json}]]`:

| `accion` | Efecto | Permiso |
|---|---|---|
| `abrir` | Abre/crea una molécula (en orbe, ventana o bloque) con los átomos pedidos | `act.navigate` |
| `estado` | Lista átomos y parámetros (nombre, rango, unidad, valor) | `read.system` |
| `mover` | `Operacion` exacta/relativa sobre un parámetro | `decidir(...mover-parametro)`: rol editor o dueño |
| `dictar` | Pasa una frase por `entenderVarias` y aplica o devuelve «no entendido» | ídem |
| `deshacer` | Deshace lo último **del propio agente** | ídem |
| `proponer-codigo` | Crea un **candidato** de código/conversión (nunca lo ejecuta) | cualquiera salvo observador |

El prompt del agente recibe un resumen compacto de los controles abiertos (nombre, rango, unidad, valor actual) con tope
de tamaño; el agente **no ve** valores de salud ni datos de otros ámbitos que su rol no alcance (`alcance-memoria`).
Un agente público no usa la Protomolécula de su creador: `sanearParaGrupo` ya recorta sus límites de fábrica.
**Candidato para Alex:** un `PermissionScope` propio (`edit.creacion`) en `ai-permissions.ts`; hasta que lo decida se
reutilizan los existentes.

## 6 · Sincronía

### 6.1 Sesiones y roles
Una `Sesion` ata una molécula a un ámbito, un anfitrión, miembros con **los roles de sala** y un transporte. **Privada**
(solo yo / mis perfiles), **de grupo** o **pública**; se comparte con `ShareAccessDialog`. Una sesión privada prefiere
servidor privado o **malla P2P antes que el servidor público, aunque haya internet** (`salas/sala.ts#elegirTransporte`).

### 6.2 Qué viaja y cómo se fusiona
| Cosa | Cómo viaja | Fusión |
|---|---|---|
| Valor de un parámetro | `ElementoSala` tipo `parametro` (prioridad P1: contenido) | último gana (tiempo → dispositivo alfabético → lápida), **idéntico en todas las neuronas** |
| Estructura (capas, átomos) | `ElementoSala` tipo `capa`/`atomo`; el `orden` de capas es un número fraccionario | ídem, con **lápidas** (nunca borrado físico) |
| **Gesto** (arrastrar un fader a 60 Hz) | Mensaje **efímero** (P0), solo el último valor cada ≥ 16 ms; **no se guarda** | al soltar, un único `Operacion` confirmado |
| Cursores, presencia, selección | P0 | descartable |
| Escena (cámara, posición) | P2 | |
| Texturas, modelos, adjuntos | P3 (solo bajo orden o por la malla) | |
| Texto y **código colaborativo** | **no resuelto con LWW**: dos personas escribiendo a la vez necesitan un CRDT de texto (Yjs, MIT, es el candidato) | **pendiente de decidir** (F3) |

Una `Operacion` completa cabe en una **forma corta** de < 200 B para LoRa (`LORA_MAX_BYTES` en `eleccion-enlace.ts`); por LoRa solo viajan
confirmaciones, nunca gestos.

### 6.3 Latencias para tiempo real (objetivos a MEDIR, no cifras demostradas)
- Mi gesto → mi pantalla: **optimista**, en el mismo fotograma (≤ 16 ms); la red nunca bloquea la mano.
- Enlace local P2P (WebRTC en la misma red, sin internet): objetivo **< 30 ms** de ida.
- Malla por internet / relé cifrado: objetivo **< 150 ms**.
- LoRa: segundos; solo confirmaciones.
- **Audio sincronizado**: no se manda audio, se mandan **parámetros + reloj común** (`reloj-comun.ts`, que enseña su precisión y su cota,
  y no inventa una sin muestras). Cada medio genera el sonido y lo programa en el instante común. Si se necesita el audio real
  de otra persona, es una llamada/flujo (`abrirFlujo`).
- La interfaz **enseña** la latencia medida y por qué enlace va. Si no hay enlace, dice «solo en este aparato».

### 6.4 Biblioteca privada y ramas de versiones
Editar un archivo de la Biblioteca produce una **rama** (`estable|beta|propia`, según `actualizaciones-por-capas-y-niveles.md` §2) que
referencia la versión base; la persona puede proponer volver a la original. En un servidor vinculado, la réplica es una
referencia + las diferencias, no una copia completa, salvo sin conexión (entonces se pide permiso para copiar).

## 7 · Cómputo: la neurona elige dónde corre cada átomo

`Computo`: `navegador · app-nativa · neurona-nas · neurona-procesador · oracle-a1 · nube`. Un planificador **puro** (F5) recibe los
requisitos del átomo (memoria, GPU, latencia, privacidad) y las capacidades de las neuronas (`neuron_devices.capabilities`) y devuelve el
destino **con el motivo**:

1. **Privado** → solo neuronas de la misma cuenta. **De grupo/público** → las del grupo o servidores vinculados con permiso.
2. **Latencia crítica** (audio en vivo, gestos) → el mismo aparato, o la misma red local.
3. **Pesado** (render, transcodificar, difusión) → neurona con GPU/CPU libres que **haya consentido** ser procesador; si no, nube con
   cupo y solo si el ámbito lo permite.
4. **Oracle A1 solo para lo ligero** (ffmpeg, conversiones, servicios): son 2 OCPU/12 GB ya repartidos; **no tiene GPU**. El planificador
   lee el consumo real, no el nominal.
5. Siempre se **enseña dónde corre y por qué**, y se puede forzar otro destino (dentro de los permisos).

Hoy no existe «neurona como NAS/procesador para terceros» (Alex lo pidió el 2026-10-10 para las apps nativas): es F5, y va con
consentimiento explícito por neurona.

## 8 · Seguridad y privacidad

### 8.1 Ejecución
- Herramienta aislada = iframe, WASM en Worker, app nativa o servicio. **Dos clases de marco, dos formas de comprobar quién habla:**
  1. **Páginas-envoltorio propias** (las escribe el OS, vía `srcdoc`): `sandbox="allow-scripts"` **sin** `allow-same-origin`. Su origen es opaco
     (`event.origin === "null"`), así que el origen no identifica nada: la identidad es `event.source === frame.contentWindow` **más un token
     aleatorio de 128 bits por marco** (`canal`) que el OS inyecta en el documento (marcador `__PM_CANAL__`) y que viaja en cada mensaje. Al
     contestar el destino es `"*"`, y es seguro porque el mensaje solo se entrega a ese `contentWindow`.
  2. **Apps ajenas completas** (`vista: externa`): solo `https`, nunca del origen del OS, con su propio origen real; se verifica `event.origin`
     contra el origen declarado y `event.source`. Se muestran tal cual: el control es «solo ventana» (§3.2).
  En ambos casos el puente limita tamaño (64 KB por mensaje; 2 MB un `exportar`) y frecuencia (120 mensajes/s por marco), valida el tipo del valor
  contra el parámetro declarado y **ignora tipos desconocidos**.
  - **El tamaño se mide sobre JSON puro** (objetos planos, listas sin propiedades extra, texto, números finitos, booleanos y `null`; un `undefined` dentro de un objeto se omite, pero su clave sí cuenta: `postMessage` la clona). Un id o una opción que el saneo de `<`/`>` cambiaría se descarta, no se reescribe.
    `postMessage` clona mucho más y `JSON.stringify` lo mediría mal (un `ArrayBuffer` o un `Map` pesarían `{}`), así que `BigInt`, `Map`, `Set`, `Date`,
    `RegExp`, `Blob`, `ArrayBuffer` y vistas de él, instancias de clase, funciones, símbolos, `NaN`/`Infinity` y referencias circulares se **rechazan**
    con su motivo: el binario viaja como texto (base64). Una lista con propiedades que no son índices (`lista.oculto = "…"`) también se rechaza:
    `postMessage` las clona con todo su peso y `JSON.stringify` las ignora, así que pasarían el tope sin medirse. Un marco sin ventana
    (`contentWindow` nulo) no identifica a nadie.
  - **Lo que declara un `hola` se acota con los topes del registro** (`registro-atomos.ts`, los mismos para el puente y para `registrarAtomo`): 64
    parámetros con ids únicos, nombre e ids de 80 caracteres, 32 opciones de 40, sinónimos de 80, `min < max` y solo las unidades de `PALABRAS_UNIDAD`;
    un `hola` aceptado por el puente nunca lo rechaza el registro. **Sin HTML:** el nombre, los ids, los nombres, las opciones y los sinónimos pasan por el
    mismo `sanearTexto` del registro (quita `<` y `>`). Una opción de más de 40 caracteres se **descarta**, no se recorta (recortadas, dos opciones
    distintas serían una y el OS ofrecería un texto que la herramienta no reconoce), y las repetidas cuentan una vez.
  - **Los átomos propios (`vista: documento`) hablan este mismo protocolo** y una prueba de contrato (`atomos/contrato-puente.test.ts`) ejecuta cada
    documento con un navegador simulado y le habla solo con `mensajeParaMarco`. El documento manda `hola` con **sus parámetros** (el OS pinta los
    controles de ahí, y la prueba exige que el puente devuelva los 11 y que el registro los admita) y, si no puede crear el audio (sin Web Audio,
    política del navegador, sandbox), manda `error` con el motivo en vez de `listo`: el OS siempre puede decirle a la persona por qué no suena. En el sintetizador, `sonando` sostiene el tono al volumen elegido y
    `nota` es una envolvente (`ataque` → `liberacion`) que no cambia `sonando`: el estado que ve el OS es siempre el del documento.
- Las páginas-envoltorio propias cargan su librería con versión fijada y **SRI**; sin SHA verificado, el átomo queda «próximamente: falta SHA»
  (misma regla que las capas de Astraura).
- `lanzar-externo` de una app nativa o un servicio local: **siempre confirmación**, jamás lo arranca una IA sola. Lista blanca de binarios.

### 8.2 Código: la Protomolécula PROPONE
La IA puede leer el código de un contexto (capa `codigo`, un widget propio, un archivo de la Biblioteca) y proponer cambios o convertirlo de
lenguaje. El resultado es un **candidato**: diff legible, con `revisar()`-style de secretos (`sk-`, `gsk_`, `Bearer`, rutas del disco, de
`paquete-sistema.ts`), sin ejecutarse. **Aceptar** un candidato es una acción humana, con la mano, confirmada (`aplicar-codigo`), y aun así solo
actúa sobre la **capa de código de la molécula** o un recurso propio; **nunca** sobre el núcleo (`nucleo/*`, `invariantes`) ni sobre código de
otra persona sin su permiso. Un paquete que cambie la interfaz pasa por `paquete-sistema.ts#revisar`.

### 8.3 Ámbitos y salud
- Ámbitos **personal › perfil › grupo › pública**, con consentimiento explícito para abrir (`puedeCambiarAmbito`: solo el dueño, con la mano, confirmando;
  cerrar no pide confirmación). Al abrir, se avisa de las capas que citan una entidad **más reservada** que el nuevo ámbito (`referenciasRotas`).
- Matriz (`permisos.ts#decidir`): editor/dueño mueven parámetros desde cualquier origen; una IA o agente piden **confirmación** para cambiar la estructura
  de un espacio compartido, vincular un mando, arrancar una herramienta aislada o invitar; **nadie** salvo una persona con la mano acepta código; un agente
  jamás arranca algo nativo solo; comentarista y observador miran (y comentan o proponen).
- **Wearables (relojes, anillos)**: el dato se usa **en local** (tu aparato mueve tu pantalla) siempre; **viajar a la sesión** exige un consentimiento
  **por métrica**, de esa persona, vigente (con caducidad opcional) y del ámbito justo; en **sesión pública**, además, permiso **expreso**. Una métrica de
  salud sin identificar nunca viaja. Los datos de salud no entran al prompt de ningún agente ni a la memoria. **Sin afirmaciones médicas**: la interfaz
  muestra `AVISO_SALUD` («lecturas de un dispositivo, no un diagnóstico ni un consejo médico») y nunca etiqueta estados («estrés alto», «arritmia»).
- Las operaciones de un wearable pasan por `decidirOperacion`, que devuelve `difundir: false` mientras no haya consentimiento.

## 9 · Autoactualización de cada herramienta y Biblioteca por categorías

- Cada herramienta del catálogo trae `actualizacion` (de dónde sale su última versión de código abierto). El script **`scripts/protomolecula/actualizar_catalogo.py`**
  (a escribir, cola F2) consulta el upstream (releases/tags de GitHub, sin claves, con caché), compara con lo instalado y escribe un informe y
  `config/protomolecula-versiones.json` (versión, fecha, licencia, SHA cuando el upstream lo da). **No descarga ni instala nada**: sin SHA verificado una
  versión nueva queda «disponible», no «instalada».
- En la Biblioteca, una **ficha por herramienta** agrupada por categoría (Imagen · Audio y síntesis · Vídeo · 3D y escenas · Arquitectura · Físicas y
  prototipos · Juegos · VR/AR · Código y conversión · IA generativa), con **descripción, licencia, enlaces (web, repo, documentación) y estado real**
  (integración, control, «próximamente: motivo»). Reutiliza `oss-catalog-bridge.ts` y `/api/library/actualizaciones`.
- La política de actualización de cada herramienta sigue **las capas y niveles** (`actualizaciones-por-capas-y-niveles.md`): una librería del bundle
  es capa `interfaz` (recarga suave fuera de directos), un servicio local es capa `servicios`, un binario nativo es capa `nativa` y solo la publica
  MetaGenesis. Automática / programada / manual por herramienta; neurona canaria; vuelta atrás si falla la prueba de humo; **nunca durante una
  llamada, un directo o una edición activa**.

## 10 · Fases (honestas)

| Fase | Contenido | Existe hoy | Falta |
|---|---|---|---|
| **F0** núcleo y control universal + orbe/widget | tipos, parámetros, dictado, vínculos, permisos; estado de molécula; panel de parámetros; barra de dictado; orbe gemela; widget; app de ventana; acción de agente | **Núcleo puro y probado (120 pruebas)** | Todo lo visible: estado, panel, orbe, widget, acción de agente (cola `PM1010F0A`–`F0M`, 13 tareas) |
| **F1** primeras herramientas web | puente `postMessage`; marco aislado; saneo de parámetros declarados; 3 átomos propios (sintetizador Web Audio, texturas WebGL, escena three.js); 2–3 apps ajenas embebidas | patrón del puente de estaciones; `three`/R3F | Todo lo anterior (cola `PM1010F1A`–`F1F`, 6 tareas) |
| **F2** convergencia y convertidores | grafo de entradas/salidas; registro y rutas de conversión + conversores reales (PCM↔WAV, OBJ→glTF, CSV↔JSON, SRT↔VTT); referencias de Entidad; bloque en lienzo, pizarras y mensajes; fichas de Biblioteca y script de refresco | `CanvasEdge`, `Biblioteca`, estaciones paramétricas | Cola `PM1010F2A`–`F2L`, 12 tareas |
| **F3** colaboración P2P en tiempo real | sesión, roles, gestos efímeros + confirmaciones, reloj común, medidor de latencia, presencia, adaptador de estaciones; llamadas (canal `pm.*`) | `salas`, `transporte-universal`, `reloj-comun` | CRDT de texto para código (decisión); cola `PM1010F3A`–`F3B` (esbozo) |
| **F4** XR | asas 3D, panel en visor, manos/mandos como origen | `vivo/espacial`, `use-webxr` | Depende del contrato XR de la otra sesión: **su cola la escribe esa sesión**; esta cola no reserva tareas XR (los ids `PM1010F4*` quedan libres). Aquí solo se garantiza que cualquier parámetro numérico puede ser un asa (`Operacion` con `origen: "mano"`) |
| **F5** nativas y servicios locales | planificador de cómputo; puente a servicios locales con token por variable; lanzador nativo con lista blanca; neurona como procesador/NAS con consentimiento | capacidades de neurona, Tauri | Casi todo (`PM1010F5A`–`F5B`, esbozo) |
| **F6** controles físicos y sensores | Web MIDI + aprender; Gamepad; HID/serie/OSC; wearables por Web Bluetooth (perfil estándar de ritmo cardíaco) con consentimiento; nativos (Health Connect/HealthKit) | núcleo de vínculos y de permisos de salud | **Todo el hardware** (`PM1010F6A`–`F6C`, esbozo) |
| **F7** IA generativa local/nube | candidatos de código y conversión de lenguajes; imagen/audio/3D generativos vía router gratis-primero; Needle/Jev para elegir controles | `media-gen`, router, Needle | Conectar, con revisión humana (`PM1010F7A`–`F7B`, esbozo) |

## 11 · El núcleo ya escrito (referencia rápida)

| Archivo | Líneas | Qué hace |
|---|---|---|
| `tipos.ts` | ≤ 200 | `Molecula`, `Capa`, `AtomoEnUso`, `Parametro`, `Operacion`, `Cambio`, `Sesion`, `Consentimiento`, `Rol`, `Ambito`, `Origen`, métricas de salud |
| `parametros.ts` | ≤ 200 | `calcular`, `aplicarOperacion`, `acotar`, `convertirUnidad`, deshacer/rehacer por autor, `describirCambio` |
| `dictado.ts` | ≤ 200 | `entenderDictado`, `entenderVarias`, `limpiarFrase` |
| `vinculos-control.ts` | ≤ 200 | `normalizar01`, `aplicarCurva`, `procesar`, `siguienteAprender`, `vinculoAprendido` |
| `permisos.ts` | ≤ 200 | `decidir`, `decidirOperacion`, `puedeCambiarAmbito`, `referenciasRotas`, `decidirSalud`, consentimientos |
| `__tests__/*` | 120 pruebas | incluye `pureza.test.ts`: ≤ 200 líneas, sin React/red/`node:*`/`eval`, y que las únicas dependencias externas sean `salas/sala` y `nucleo/alcance-memoria` |

### 11.1 Interfaces que escribe la cola F0–F1 (nombres fijos: las tareas dependen de ellas)

Los cinco archivos del núcleo no cambian. Encima va este runtime, en archivos nuevos (las firmas son el contrato; el detalle lo decide quien escribe):

```
registro-atomos.ts            (PM1010F0B)
  type Integracion   = "libreria-js"|"wasm-en-worker"|"iframe-aislado"|"app-nativa-puente"|"servicio-local"|"servidor-remoto"|"solo-enlace"
  type GradoControl  = "total"|"ventana"|"ninguno"
  type CategoriaAtomo= "imagen"|"audio"|"video"|"3d"|"arquitectura"|"fisicas"|"juegos"|"vr-ar"|"codigo"|"ia"
  type VistaAtomo    = {tipo:"documento"; documento:()=>string}   // HTML para srcdoc, escrito por el OS, con el marcador __PM_CANAL__
                     | {tipo:"componente"; id:string}            // se resuelve en atomos/index.ts#VISTAS_COMPONENTE
                     | {tipo:"externa"; url:string}              // app ajena, https, solo ventana
  interface VistaProps { atomoId:string; valores:EstadoValores; alCambiar?:(op:Operacion)=>void }
  interface DefinicionAtomo { herramientaId; nombre; categoria; integracion; control; parametros:Parametro[];
                              entradas:string[]; salidas:string[]; vista?:VistaAtomo; proximamente?:string;
                              ficha?:{web?:string; repo?:string; licencia?:string} }
  registrarAtomo(def):{ok:true}|{ok:false;motivo:string}; obtenerAtomo(id); listarAtomos(); limpiarRegistro()
  sanearDefinicion(bruto:unknown):DefinicionAtomo|null        // lo que DECLARA un tercero: sin HTML, topes, sin vista
  candidatosDe(m:Molecula):CandidatoParametro[]               // lo que el dictado y los vínculos reciben

molecula-estado.ts            (PM1010F0A)   funciones puras e inmutables sobre Molecula
  crearMolecula, anadirCapa, anadirAtomo, cambiarEstadoAtomo, fijarValores, aplicarEnMolecula(m, parametroDe, op, ahora)

almacen-moleculas.ts          (PM1010F0C)   persistencia local inyectable (guardar/cargar/listar/borrar, esMoleculaValida); desde PM1010F0G acepta además la forma del núcleo (esMoleculaGuardable)

controlador.ts                (PM1010F0D)
  crearControlador({molecula, rol, sesion?, ahora, nuevoId}) : Controlador
  Controlador { obtener(); suscribir(f); mover(op); dictar(frase, autor, origen?); confirmar(opId); rechazar(opId);
                deshacer(autorId); rehacer(autorId); anadirAtomo(herramientaId, titulo?) }
  controlador-activo.ts: registrarControlador(moleculaId, c) → desregistro; controladorActivo(id?); listarControladores()
sesion-molecula.ts            (PM1010F0G)   DUEÑO del controlador: abrirSesion(id?, deps) / cerrarSesion(id), recuento de referencias por molécula;
                              carga (o crea «Mi primera molécula»), registra átomos propios y controlador, guarda con 400 ms si cambia la identidad de molecula
use-molecula.ts               (PM1010F0G)   useMolecula({moleculaId}) → {cargando, error, controlador, estado, guardado}; panel-protomolecula.tsx lo monta en todas las superficies

orbe-bus.ts                   (PM1010F0K)   claves starseed.protomolecula.orbe.{pos,enabled}.v1, eventos, posición por defecto junto a la orbe de Aurora
puente-herramientas.ts        (PM1010F1A)   protocolo OS⇄marco: hola · cambio · exportar · listo · error / establecer · estado · disparar
atomos/index.ts               (PM1010F1C)   ATOMOS_PROPIOS, registrarAtomosPropios(), VISTAS_COMPONENTE
convertidores.ts              (PM1010F2B)   ConversorDef{de,a,via,costo,convertir?}, rutaDeConversion(de,a), ejecutarRuta
```

## 12 · La cola del enjambre y cómo continuar

`starseed_memory_root/olas/cola-protomolecula-1010p.json` (ids `PM1010F<fase><letra>`, 9 caracteres como máximo; yo no la lancé, pero el enjambre carga solo las tareas sin dependencias: ver §12.1). **40 tareas**, el tope del Diseñador de olas de Genesis (`TOPE_TAREAS_COLA`); `validarCola` del repo da 0 errores y 0 avisos:

| Fase | Tareas | Detalle |
|---|---|---|
| F0 | 13 (`F0A`–`F0M`) | en detalle |
| F1 | 6 (`F1A`–`F1F`) | en detalle |
| F2 | 12 (`F2A`–`F2L`) | en detalle |
| F3 | 2 (`F3A`–`F3B`) | esbozo |
| F5 | 2 (`F5A`–`F5B`) | esbozo |
| F6 | 3 (`F6A`–`F6C`) | esbozo |
| F7 | 2 (`F7A`–`F7B`) | esbozo |

Cada tarea: ≤ 3 archivos y ≤ 120 líneas por archivo, con dependencias (acíclicas; dos tareas sin relación entre sí nunca escriben el mismo archivo) y un prompt que se basta solo (contrato, reglas de la casa, qué escribir con nombres y firmas, pruebas mínimas e «integración»). Las de F3–F7 llevan `[esbozo]` en el título y empiezan comprobando que existe lo que necesitan; si falta algo **no se quedan paradas ni terminan sin cambios** (Alex, 2026-10-10: las tareas se adaptan, no se bloquean): escriben la parte que no depende de lo ausente, con lo ausente inyectado como parámetro y un tipo mínimo `// provisional`, y cierran con la línea `PENDIENTE-DE: <qué falta>` para que el director la reasigne o la reencole. Todas llevan además una PRECONDICIÓN (§12.1) que prohíbe recrear el núcleo si aún no está en su worktree. Las ids de **retry** del enjambre añaden una minúscula (`PM1010F0Ab`): por eso los ids nunca difieren solo en mayúsculas (la Mac es insensible a ellas en `refs`).

Orden recomendado al lanzar: F0 entera → verificar en localhost (`/protomolecula`, la orbe junto a la de Aurora, el widget y el dictado) → F1 → F2 → afinar F3–F7 con lo aprendido. Regla de la casa: «integrado no es aplicado»: cada tarea termina con un `grep` de que se usa fuera de su prueba, y **lo visible se verifica en `localhost:9002`** (la nube no cambia el Genesis de Alex).

**Dependencias de otras sesiones (no se escriben aquí):** `src/lib/protomolecula/catalogo-herramientas.ts` (catálogo de herramientas y apps de getarcraft; lo leen `F2K` y `F2L`) y el contrato XR espacial (F4). Si el catálogo aún no existe, `F2K` recibe el catálogo inyectado (no se bloquea) y `F2L` extrae los repositorios con una expresión tolerante (cualquier `https://github.com/<owner>/<repo>` ligado al último `id`).

### 12.1 Estado verificado el 2026-10-10 ~10:30 UTC (léelo antes de lanzar nada)

1. **El enjambre ya recogió cinco tareas solas.** Las únicas sin dependencias (`F0A`, `F0B`, `F0K`, `F2B`, `F2L`) están copiadas, con los mismos ids y el mismo contenido, en la cola viva `cola-auto-1009-233520.json` y en `cola-enjambre-1010s.json`: es una copia adelantada, no una colisión. Desde ~05:40 UTC se intentaron `F0A`, `F0B`, `F0K` y `F2B` (la hora de `eventos.jsonl` es la de la Mac, UTC-6); quedaron «pendiente» con «reintento gratuito 1/8» tras un fallo de fusión por un `index.lock` momentáneo; `F2L` apenas empezó. Nada de F0C en adelante ha arrancado.
2. **Causa de fondo: el contrato y el núcleo NO están en `main` de la Mac.** Solo existen en el contenedor. Un trabajador del enjambre solo puede leer su worktree (el arnés rechaza «cualquier ruta fuera de la raíz» y se pierde el intento), de modo que `F0A` no encontró `architecture/protomolecula.md` ni `tipos.ts` y se **inventó** `tipos.ts` y `parametros.ts` en la rama `ola/PM1010F0A` (además tocó `vincular-sin-internet.tsx` para silenciar un error de tipos ajeno). `F0K` y `F2B` subieron `@types/qrcode` en `package.json` por el mismo error ajeno: ruido, no es de esta cola.
3. **Remedio: integrar en `main` los 12 archivos de la Protomolécula** (contrato, 5 del núcleo, 6 pruebas) con `scripts/puente/commit-seguro.py` (toma el cerrojo `integrar`, no choca con el enjambre). Con el núcleo en `main`, `poner_al_dia` rebasa la rama vieja de `F0A`, choca, la **archiva** en `refs/archivo/ola/PM1010F0A/…` y la tarea arranca desde `main`. Paquete listo (sin ejecutar) en `.transfer/protomolecula-nucleo-2026-10-10/` con `aplicar.sh`.
4. **Hasta entonces** cada tarea lleva la PRECONDICIÓN: si el núcleo no está en su worktree no lo recrea, escribe solo lo suyo y cierra con `PENDIENTE-DE: núcleo de la Protomolécula en main`. Es más barato reintentar que dejar a `main` con dos versiones de `tipos.ts`.
5. **No se escribió nada en el árbol de trabajo de la Mac** (con el enjambre vivo solo escribe quien integra, con el cerrojo). Lo único entregado allí es la cola y el paquete en `.transfer/` (ignorado por git).

## 13 · Decisiones tomadas y por decidir

**Tomadas aquí (revisables por Alex):**
1. «N %» relativo es del **valor**, no del rango; en parámetros en % son puntos; con 0 o dB, del rango (avisado).
2. Exacta **no** se ajusta al paso. Los mandos físicos sí.
3. El dictado **no adivina**; sugiere. Las IA y agentes pasan por la misma puerta que la mano.
4. Gestos efímeros + confirmación al soltar (no se guarda cada milisegundo).
5. Sensores no se «aprenden»: se eligen con consentimiento.
6. Todas las apps de getarcraft entran en el catálogo; el **control por parámetros** depende de su grado de integración y se dice.
7. La **orbe gemela** y la entrada del **OmniDock** nacen **encendidas por defecto** (Alex pidió la orbe «junto a la de Astraura»); se apagan desde la propia orbe/ajustes, y en el dock quitando `protomolecula` de `DOCK_DEFAULT_ON_IDS`.
8. Una molécula en una publicación es una **instantánea** con aviso de ámbito y casilla de confirmación; quien la ve abre una **copia propia**, nunca edita la original.
9. Editar una entidad de la Biblioteca crea una **rama**; si la fuente aún no sabe hacer ramas, se dice «próximamente» y no se toca nada.
10. El motor de pizarras «tldraw» queda fuera de F0–F2.

**Por decidir (candidatas, `// candidata:` en la jerga del núcleo):**
- Un `PermissionScope` `edit.creacion` en `ai-permissions.ts`.
- CRDT de texto (Yjs) para capas de código colaborativas, o bloqueo por capa mientras tanto.
- Una sala `molecula` en `salas/sala.ts` (hoy se usaría `pizarra`/`escena3d`).
- Si el motor de pizarras «tldraw» recibe también el bloque (hoy, no).
- Qué neuronas ofrecen cómputo a terceros y con qué cupo (F5).

## Integración del 10-10 (INT1010D): el núcleo llegó después que el enjambre

Las tareas PM1010F0* empezaron con el núcleo de este contrato solo en el contenedor, así que escribieron
versiones mínimas con el mismo nombre (`tienePermiso() { return true }`, `herramientas = {}`, una `Molecula`
con `Capa {nombre}` y `AtomoEnUso {tipo}`) y construyeron encima `molecula-estado.ts` y `almacen-moleculas.ts`.
Al integrar ganó el núcleo del contrato (tipos, parámetros, dictado, permisos, vínculos y catálogo, con su
guardia de pureza) y la primera versión del enjambre quedó en `src/lib/protomolecula/molecula-estado-tipos.ts`,
que solo importan esos dos módulos y sus pruebas (489 pruebas de los dos lados en verde).

**Pendiente para la cola:** portar `molecula-estado`/`almacen-moleculas` a `tipos.ts`/`parametros.ts` y borrar
`molecula-estado-tipos.ts`. Regla: una tarea que necesita un tipo del núcleo lo importa de `tipos.ts`; si no
existe, la tarea se para y lo pide — nunca se crea un `tipos.ts` mínimo con el mismo nombre.
El actualizador del catálogo del enjambre (leía `repositorio:`, campo que el catálogo real no tiene) se guardó
en `.transfer/conflictos-1010d/` de la Mac; queda `scripts/protomolecula/actualizar_catalogo.py` del contrato.
