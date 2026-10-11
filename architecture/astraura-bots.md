# Bots/dots de Astraura · la orbe es el bot (contrato, BOT1011 · 2026-10-11)

> Petición de Alex (2026-10-11), resumida fielmente: mejoras exponenciales de Astraura en todos los medios. Un
> **BOT** que observa y reacciona a la pantalla, al código, a los archivos y carpetas del cerebro y a toda la red
> (páginas, publicaciones, grupos, mensajes, notificaciones, enlaces, correos) y puede crear y modificar todo en tiempo
> real; que mejora con cada personalidad de agente y chat y con las preferencias de cada persona; **bots grupales y
> comunales democratizados**, administrados desde cada página y grupo; cada persona con **varios bots abiertos y
> sincronizados** (los de su perfil y los de sus grupos/páginas), cada uno con sus capas de conciencia colectiva,
> personalidad, capacidades, accesos y permisos; por defecto el bot **ES Astraura** con modelos locales (1.58 con Needle,
> Bonsai, Jev o Laya, capas mesh) autoactualizado, o APIs externas; también bots externos (p. ej. Grok), pero el
> predeterminado es de código abierto y local; tomar **openbot** y **OpenDots** de CopilotKit como base; **la ORBE flotante
> de Astraura es el bot** (se fusiona la actual con lo nuevo), puede haber más, totalmente personalizable (animaciones,
> avatares 2D/3D dinámicos, interactivos, emocionales, empáticos; toma avatares de la Biblioteca privada o pública);
> personalidad autoadaptable al agente y al contexto; sintetiza código en programas, widgets, objetos o animaciones 2D/3D en
> directo, también capas sobre la pantalla; manipula pizarras, dashboards, escritorios, páginas, ajustes y navegación
> multiventana 2D/3D, también en AR/VR con la Protomolécula; cada bot con **su propia computadora en la nube** y conexión a
> apps y servicios internos y externos; listas de tareas con directores y multiagentes desde **Genesis o PoliGenesis** con
> verificación profesional; capas de conciencia, memorias y recuerdos propios con almacenamiento autorregulado que se
> transfiere entre neuronas de la cuenta o del grupo; roles y personalidades configurables; autoenrutamiento de modelos;
> acceso a los sentidos (micrófono, pantallas, cámara, terminal, sensores y aparatos) con todos los permisos solicitados.

Fuente de verdad del área. Lo que no esté aquí no se inventa; lo que ya existe (§2) se reutiliza, no se duplica.

## 0 · Reglas que mandan (de `CLAUDE.md`; no se negocian)

- **Editable sí, ejecutable no.** Un bot cambia el OS con un vocabulario cerrado de acciones (§6) que se traduce a los
  módulos que ya existen (`aurora/actions.ts`, `ui-acciones`, `genesis/operaciones`, `UiSpec`, Protomolécula). El código
  que sintetiza es siempre un **candidato** aislado; nunca se ejecuta en el núcleo. Lo único que un bot «ejecuta» corre en
  **su** computadora aislada (§7), fuera del aparato de la persona.
- **El núcleo intocable** (`src/lib/nucleo/*`, `invariantes`, permisos, migraciones) no es destino de ninguna acción.
- **Exocórtex leal a la persona** (Tríada §3): propone y la persona decide; todo cambio dice su motivo, queda en el
  registro y tiene deshacer; ninguna vigilancia, ningún sentido encendido sin consentimiento y sin indicador visible.
- **Alcance de memoria** personal › perfil › grupo › pública, nunca al revés. Los bots **invitados y los de grupo nunca
  leen memoria personal** (`alcance-memoria.ts`).
- **Agentes de grupo saneados** (`agentes-grupo.ts#sanearParaGrupo`): sin memoria personal, sin claves, sin bindings
  privados, límites de fábrica restrictivos.
- **Gratis y local primero; nunca agotar créditos**: Astraura 1.58 es el sistema primario; las APIs externas son respaldo
  con reserva intocable.
- **Claves solo por NOMBRE de variable** y en el servidor o la bóveda; nunca en el cliente, el repo, el registro ni el
  prompt.
- Tareas del enjambre: **≤ 3 archivos y ≤ 120 líneas por archivo**; nada de `node:*` en código de cliente; el layout raíz no
  carga nada pesado de forma estática.

## 1 · Investigación: openbot y OpenDots (comprobado el 2026-10-11)

Método: `git clone --depth 50` de los dos repos y lectura del README, `package.json`, `docs/`, `Dockerfile` y del código
(`agent-computer/src`, `server/src`, `app/src/lib/copilot`, `src/shared/types.ts`, `src/client/Mascot.tsx`). La API de
GitHub (`gh api`) respondió 403 en esta sesión: **estrellas, forks y fecha de creación no se pudieron comprobar**. No se ejecutó
ninguno de los dos (no hay Docker aquí y la regla de la tarea prohíbe instalar paquetes).

### 1.1 Qué son

| | **openbot** (`CopilotKit/openbot`) | **OpenDots** (`CopilotKit/OpenDots`) |
|---|---|---|
| Qué es | «El asistente que tu empresa puede poseer»: plataforma de agentes autoalojada; cada *Bot* es un **coworker** con su canal, su computadora y solo las herramientas concedidas. **Plantilla, no producto**: nada se publica como paquete | Plantilla de agentes personales **siempre encendidos** («Dots») con texto, llamadas y Slack; cada Dot puede tener su computadora (la de openbot) |
| Licencia | MIT © 2026 CopilotKit | MIT © Atai Barkai (fundador de CopilotKit) |
| Versión | 0.1.2 (raíz y app de escritorio) · **alpha** | 0.1.0 · **alpha** |
| Actividad | último commit 2026-10-09 (#765); 50 commits entre 2026-10-03 y 10-09 | último commit 2026-10-07 (#81); 53 commits desde 2026-09-29 en la historia leída |
| Pila | Bun 1.3 · app React 19.2 + Vite 7 + TanStack Router · servidor Hono + `@copilotkit/runtime` 1.77 + Mastra + Drizzle/PostgreSQL+pgvector + better-auth + `cel-js` + Composio + Twilio + OpenTelemetry · `worker` de rutinas · `agent-computer` (Ubuntu 24.04 + Playwright 1.62.1/Chromium + `/workspace`) · `supervisor` (socket de Docker, un contenedor por bot, gVisor opcional) · app de escritorio **Tauri 2** · móvil · 13 arneses `agent-*` (LangGraph, Mastra, CrewAI, Pydantic AI, ADK, AG2, Agno, Strands, LlamaIndex, Langroid, Claude SDK, Microsoft, uno propio) | Node 24 + npm · Vite 8 + React 19.3 · Hono · `@copilotkit/{core,react-core,runtime}` ^1.75 · `@copilotkit/channels` · `@ag-ui/client` ^0.0.59 · `@tanstack/ai` · SDK de MCP · TipTap · Playwright · SQLite para páginas |
| Peso | ~30 MB de repo; ~215 k líneas TS en el servidor, ~97 k en la app, ~51 k en escritorio, ~14 k en la computadora | ~13 k líneas TS |

### 1.2 Arquitectura y protocolo

- **AG-UI** (MIT, `ag-ui-protocol/ag-ui`): protocolo abierto agente↔interfaz por **eventos**: ciclo (`RunStarted/
  Finished/Error`, `Step*`), texto (`TextMessageStart/Content/End`), herramientas (`ToolCallStart/Args/End/Result`), estado
  (`StateSnapshot` reemplaza, `StateDelta` = JSON Patch RFC 6902), actividad, razonamiento y subagentes. Un *Bot* de openbot
  es **cualquier endpoint que hable AG-UI**, con o sin framework.
- **Pasarela única de acciones** (openbot): toda llamada a navegador, archivo, MCP o componente vuelve al servidor, que
  resuelve el objetivo, evalúa una **política CEL** (deny antes que allow, **falla cerrada**: sin política no se permite
  nada; regla rota deniega), escribe la fila de auditoría y solo entonces actúa. Cada fila dice **quién la inició**
  (`person`, `routine`, `handoff`, `memory`…), para distinguir lo hecho «sin nadie mirando».
- **Computadora por bot**: contenedor propio con Chromium, perfil de navegador, `/workspace` persistente y shell acotada;
  token por contenedor, solo en loopback; filtro de salida de red por bot (`allow_all`, `defaults_plus_allowlist`,
  `allowlist_only`, `deny_all`); toma de control humana («tomar el volante») registrada; los secretos nunca entran en la
  transcripción (se anota la longitud, no el valor).
- **Componentes en vez de prosa**: galería compilada + componentes «sandboxed» publicados desde un *playground* y
  pintados en el sandbox del SDK de CopilotKit; catálogo declarativo **A2UI**.
- **OpenDots** añade: Dots con `{nombre, instrucciones, espacios, researchAllowed, memoryAllowed}`, herramientas MCP por
  Dot con **aprobación del dueño para todo lo que no sea de solo lectura**, tarjetas «aprobar y guardar», llamadas WebRTC con
  un agente de cómputo aparte, rutinas programadas y una **mascota** (4 PNG elegidos por hash del id).

### 1.3 Cómo «ven» y cómo «actúan» (lo importante para Alex)

- **No ven tu pantalla.** Ven la pantalla de **su propio Chromium** (screencast, instantáneas ARIA, capturas) y sus
  propios archivos de `/workspace`. No hay captura del escritorio de la persona, ni cámara; el micrófono solo en llamadas, con
  un proveedor de voz aparte. Lo de «observar tu pantalla» del OS sale de lo nuestro (§2: `screen-scanner`, `vision-sense`).
- **Actúan por llamadas a herramientas** (AG-UI) que pasan por la pasarela con política y auditoría.

### 1.4 Qué exige fuera (y por qué no se instala tal cual)

| Exigencia | Por qué choca con el OS |
|---|---|
| **CopilotKit Intelligence** obligatorio para hilos y memoria: nube de CopilotKit (la conversación sale), evaluación local (solo macOS + Docker Desktop, licencia de 30 días renovable con **inicio de sesión e internet**) o autoalojado con licencia de plan Team/Enterprise | Rompe «código abierto absoluto» e «identidad soberana»: la memoria del bot dependería de un servicio con licencia de un tercero |
| **Telemetría encendida por defecto** (UUID de instalación, eventos `oss.desktop.*`, opt-out con `DO_NOT_TRACK=1`) | Ciberdelia: nada de vigilancia por defecto |
| PostgreSQL+pgvector, Docker y **socket de Docker** en el supervisor | Solo cabe en un servidor (el A1), nunca en la app de la persona |
| Bun (openbot) / Node 24 (OpenDots); el OS va con npm y Node del repo | Dos gestores de paquetes y otra versión de Node en el mismo árbol |
| better-auth / modo `OPENBOT_SINGLE_USER` (todos administradores) | El OS ya tiene Supabase Auth, cuentas/perfiles y permisos universales |
| Parallel (búsqueda web por defecto en OpenDots), Composio, Twilio, Slack | Terceros que reciben consultas; opcionales y con permiso |
| Componentes escritos en el navegador y ejecutados en un sandbox | En el OS la interfaz es un **dato** (`UiSpec`); el código ajeno solo en iframe sin `allow-same-origin` (ya existe) |

**¿Se puede embeber?** No como librería: el README lo dice («nothing here is published as a package to depend on»).
`@copilotkit/react-core` admite React 19, pero arrastra su runtime y su modelo de hilos. Tauri: la app de escritorio de
openbot es Tauri 2 como la nuestra, pero instala y gobierna Docker y lleva telemetría: no cabe en la app nativa.

### 1.5 Decisión

1. **Se adopta el protocolo AG-UI** como la forma en que entran **bots invitados** (cualquier bot de openbot, LangGraph,
   CrewAI…): un lector propio y puro de eventos (tarea BOT1011M) sin paquetes; sus llamadas a herramientas se convierten
   en **propuestas** del vocabulario cerrado, nunca en ejecución directa.
2. **Se adoptan los patrones**, reescritos en el núcleo propio: pasarela única que decide-registra-actúa y falla cerrada
   (`permisos.ts` + `bucle.ts`), quién inició cada acción, computadora por bot con permisos de navegador/archivos/terminal
   apagados por defecto y filtro de salida, toma de control humana, aprobación del dueño para lo que no es de solo lectura,
   rutinas con piso de 15 min y corte tras 10 fallos, secretos fuera del registro, mascota estable por id.
3. **La computadora del bot** puede usar el `agent-computer` + `supervisor` de openbot (MIT) **como servicio aparte en el
   A1 de Oracle**, construido desde un commit fijado, con telemetría apagada, tras el visto bueno de Alex (BOT1011L,
   `aprobacion: true`). Nunca dentro del paquete del OS.
4. **No se instala** CopilotKit Intelligence ni su runtime: la memoria y los hilos son los del OS (cerebros, Supabase,
   malla). No hace falta ningún paquete npm nuevo para el núcleo.
5. Las dos fichas entran en la **Biblioteca** como `kind: "repo"` con su motivo a la vista (BOT1011Z).

## 2 · Mapa de lo que ya existe y se fusiona (rutas exactas)

| Pieza | Dónde | Papel en los bots |
|---|---|---|
| **Orbe de Astraura/Aurora** | `src/components/aurora/aurora-widget.tsx` (montada en `src/app/layout.tsx`, dentro de `AuroraProvider`), `aurora-orb.tsx`, `quantum-orb.tsx`, `quantum-orb-avatar.tsx`, `quantum-orb-live-talk.tsx`, `aurora-mini-player.tsx`; buses `src/lib/aurora/{aurora-orb-bus,quantum-orb-bus,quantum-orb-theme}.ts` (`QuantumOrbParams`: turbulencia, filo, simetría, matiz, respiración) | **Es el cuerpo del bot predeterminado** («Astraura» del perfil). Los demás bots abiertos son orbes hermanas (§3.3) |
| Avatares | `src/lib/aurora/{persona-avatar,persona-avatar-vivo}.ts`, `src/components/aurora/aurora-avatar.tsx`, motor «Vida StarSeed» `src/lib/avatares/movimiento/*`, `src/lib/avatares/mundo/simulacion.ts`, `/mundo-avatares` | Formas `avatar-2d`/`avatar-3d` del cuerpo |
| **Génesis de seres** | `src/lib/astraura/{genesis-types,genesis-dna,genesis-client,genesis-client-ola2}.ts` (ADN determinista → rasgos de cuerpo), Oficina 3D `src/lib/mando/oficina.ts` | Forma `ser-genesis`: el cuerpo deriva de lo que el bot es |
| Personalidades y arquetipos | `src/lib/aurora/{personalities,persona-coherence,agente-entonacion,audio-emotion}.ts`, `src/lib/aurora/types.ts#Personality` (`params`, `emotions`), `src/lib/astraura/personalidades-todas.ts` | Base de `Personalidad`; `audio-emotion` da el ánimo percibido |
| Agentes y su taller | `src/lib/agents/{model,store,sync,builtins,agentes-grupo}.ts`, `src/lib/agentes/taller.ts` | Un bot encarna agentes; `sanearParaGrupo` se aplica a todo bot de entidad |
| Enrutador de IA y fuentes | `src/ai/astraura/router.ts` (`classifyTask`, `estimateDifficulty`), `free-catalog.ts`, `presupuesto.ts`, `usage.ts`, `src/ai/providers/*` (incl. `astraura-158*.ts`), `src/lib/astraura/primary-system.ts` (agente › personalidad › cerebro › neurona › cuenta) | Las APIs externas del reparto (§9) |
| **Capas autoadaptables** | `src/lib/astraura/capas/{catalogo,perfil-medio,planificador,almacen,repartir,ambito}.ts`, `capas-conciencia.ts`, `capas-entidad.ts`; contrato `architecture/capas-autoadaptables.md` | El lado local del reparto (`planificar()`) |
| Decisión: Needle → Laya → Jev → LLM | `src/lib/astraura/{decision-hibrida,needle3-client,needle-wasm}.ts`, `src/lib/jev/*`, `scripts/puente/{decidir,jev,razonador}.py` | Reflejo y juicio del bucle |
| **Sentidos** | catálogo `src/lib/senses/senses.ts` (tabla `senses_settings`), permisos de aparato `src/lib/aurora/senses/request-permission.ts`, visión `src/lib/aurora/senses/vision-sense.ts` + `src/ai/astraura/vision.ts`, carpetas `src/lib/aurora/senses/folder-detect.ts`, **pantalla** `src/lib/aurora/screen-control/{screen-scanner,screen-actions,screen-overlay}.ts`, Sensorium 360° y Privacidad de sensores `src/components/astraura/s158/{sentidos-tab,privacidad-tab,permisos-tab}.tsx`, sentidos del cerebro `src/lib/cerebro/brain-senses.ts` | Fuentes reales de cada `Sentido` (§5) |
| Voz | `src/lib/aurora/{motor-voz,motor-local,streaming-voice,catalogo-voces,timbres}.ts`, demonio `native/astraura-voice/daemon.mjs` (VibeASR residente, OpenVoice/OmniVoice), `architecture/aurora-voz-motores.md` | Micrófono y habla del bot |
| Cerebros y memoria | `src/lib/brains/{brains,runtime,memory-types,memory-destinations,memory-offline,sync}.ts`, `src/lib/cerebro/*`, `src/lib/memory-sync/manifest.ts`, `src/lib/storage/gdrive-brain-sync.ts`, `src/lib/memory-vault.ts`; en el backend 1.58: `app/core/cerebros_manager.py` | Memoria y recuerdos del bot (§10) |
| Acciones de Aurora | `src/lib/aurora/actions.ts` (`AURORA_ACTIONS`: navegar, ir_app, agregar_widget, crear_pizarra, cambiar_ajuste, ejecutar_agente…; directiva `[[ACCION: nombre {json}]]`) | Ejecutores reales de las acciones tipadas |
| Gramática de UI | `src/lib/astraura/{ui-acciones,ui-permisos,ui-aplicador}.ts` (proponer/aplicar, bitácora con inverso) | `ajuste.proponer` |
| **Núcleo** | `src/lib/nucleo/{ui-spec,invariantes,paquete-sistema,alcance-memoria}.ts` | `UiSpec`, invariantes, secretos, alcance |
| **Permisos universales** | `src/lib/sharing/access.ts`, `src/ai/client/ai-permissions.ts` (`PermissionScope`) | Quién ve/edita cada recurso que toca un bot |
| **Genesis / PoliGenesis / MetaGenesis** | `src/lib/genesis/{operaciones,aplicar,entidades,historial}.ts`, `src/components/genesis/{mi-genesis,poligenesis,panel-operaciones}.tsx`, `/genesis`, `/poligenesis`, `/metagenesis` (`src/lib/metagenesis/*`, nodo `scripts/puente/nodo_metagenesis.py`) | Panel de bots, votaciones, tareas con director |
| **Protomolécula** | `src/lib/protomolecula/*`, contrato `architecture/protomolecula.md` (§5.1 herramienta de agente; orbe gemela) | `protomolecula.operar`; su orbe gemela pasa al anfitrión de orbes (§3.3) |
| **StarSeed XR** | `src/lib/xr/*` (intenciones de voz, espacio Trinity, privacidad), contrato `architecture/starseed-xr.md` | `xr.intencion`, cuerpo del bot en 3D |
| Salas y pizarras | `src/lib/salas/{sala,sincronia-sala,plantillas-sala}.ts`, `src/lib/canvas/*` | `pizarra.operar` con fusión determinista |
| Ejecución aislada de código | `src/lib/aurora/code-runtime.ts` + `src/components/aurora/code-runner.tsx` (iframe `sandbox` sin `allow-same-origin`) | Vista previa de candidatos (§6.2) |
| Malla y transporte universal | `src/lib/malla/*` (`transporte-universal`, `eleccion-enlace`, `canal-multitrayecto`), `src/lib/network/{malla-neuronas,webrtc-mesh,conciencia-colectiva}.ts`, `src/ai/astraura/mesh/*` | Sincronía de bots y transferencia de recuerdos entre neuronas |
| Neuronas | `src/lib/neurons/*` (una por aparato, presencia en vivo) | Dónde está abierto cada bot |
| Puerta de datos | `src/lib/datos/puerta-a1*.ts`, `servicios/puerta-datos/`, contrato `architecture/puerta-datos-a1.md` | Lecturas/escrituras de bots por el A1 cuando esté activa |
| Conectores y vínculos externos | `src/lib/connectors/*` (`/conexiones`), `src/lib/externos/{tipos,cliente,vinculos}.ts` (`vinculos.ts` solo servidor) | Apps y servicios de cada bot; claves por nombre |
| Seguridad de red | `src/lib/security/ssrf.ts` | Guardia del proxy de bots invitados |
| Preferencias sincronizadas | `src/lib/sync/user-prefs.ts#mergeUserPrefs`, `src/lib/sync/realtime-sync.ts` | Bots personales entre neuronas |

## 3 · Qué es un bot

### 3.1 Identidad y dueño (`tipos.ts#Bot`)

Un bot tiene `id`, `nombre`, **dueño** (`perfil` · `grupo` · `comunidad` · `pagina`, con la `cuentaId` responsable),
**origen** (`astraura` predeterminado · `ag-ui` · `externo`), **gobierno** (`jerarquico` · `democratico`), personalidad,
cuerpo, **sentidos habilitados** por quien lo administra y un interruptor `activo`.

- El bot de un **perfil** es personal: lo configura su dueño, lee su memoria personal y la de su perfil.
- El bot de una **entidad** (grupo, comunidad, página) es **procomún**: actor `agente-grupo` (ve grupo y público), se le
  aplica `sanearParaGrupo` y lo gobierna la entidad (§3.2).
- Un bot **invitado** (`ag-ui`, `externo`) es actor `agente-publico`: solo ve lo público y lo que la persona le pase.

### 3.2 Gobierno democrático (`permisos.ts#decidirConfiguracion`, `#decidirAccion`)

- **Jerárquico**: quien administra la entidad configura el bot; un miembro propone y lo aprueba un administrador.
- **Democrático**: todo cambio de configuración (personalidad, cuerpo, sentidos, permisos, modelo, borrar) se **vota**
  (propuesta de PoliGenesis, `genesis/entidades.ts#proponer`). El grupo puede **delegar por votación** en su bot un riesgo
  máximo (`delegado: "bajo" | "medio"`) para que aplique sin votar lo que no lo supere (p. ej. mover widgets).
- **Salida siempre**: cualquier miembro puede pedir la **pausa** del bot común (se confirma y queda en el registro); reanudar
  sigue el gobierno. Observadores e invitados no configuran.
- Borrar un bot de entidad exige copia previa y confirmación (regla de Alex: nada importante se borra sin copia).

### 3.3 Varios bots a la vez, sincronizados

- La orbe actual es el cuerpo del **bot predeterminado** («Astraura» del perfil). Cada bot abierto más (de otro perfil
  propio, de un grupo o de una página) es una **orbe hermana** en el mismo anfitrión (`orbes-bots.tsx`, BOT1011C1/C2): mismas
  reglas de arrastre/ocultar/Trinity, posiciones por bot, sin solaparse (`orbes.ts#disposicionOrbes`), como mucho 5
  visibles y el resto en «más». La **orbe gemela de la Protomolécula** (protomolecula §5) se monta en este mismo anfitrión.
- Qué bots tiene abiertos cada neurona y su estado viajan por la sincronía de cuenta (`realtime-sync`) para los personales
  y por la tabla `astraura_bots` (Realtime) para los de entidad (BOT1011Y). Abrir un bot en el móvil lo muestra abierto en el
  escritorio si la persona lo quiere así.

## 4 · Personalidad y estado emocional (`personalidad-adaptable.ts`)

- **Rasgos** en [0, 1]: calidez, energía, formalidad, curiosidad, humor, brevedad. Mezcla **determinista**: base del bot →
  35 % del agente que encarna → ajuste de la situación (trabajo, creación, aprendizaje, juego, celebración, duelo, crisis) →
  sesión pública más formal → **deriva máxima 0,25** respecto a su base (sigue siendo él) → lo que la persona fijó a mano
  gana (`sinHumor`, `brevedad`, rasgos fijos). Solo el humor puede bajar del todo en una crisis o un duelo: es cuidado.
- **Emoción expresada** (no sentida): `{emocion, valencia, activacion}` con inercia. **Empatía sin manipulación**
  (`LIMITES_HONESTOS`, congelados): refleja como mucho la mitad del ánimo ajeno, **nunca amplifica lo negativo** (ante la
  tristeza: ternura y calma, valencia ≥ −0,3, activación baja), sin urgencia falsa, sin adulación, sin culpa, discrepa con
  respeto y reconoce que es una IA. El ánimo percibido solo se usa si la persona habilita el sentido que lo mide.
- `expresionCuerpo` da tono, pulso, escala y animación; el adaptador (BOT1011D2) lo traduce a `QuantumOrbParams` y al
  avatar. `instruccionesDeTono` da las líneas del prompt y siempre termina con los límites honestos.

## 5 · Sentidos y el bucle observar → entender → proponer → actuar

### 5.1 Sentidos (`tipos.ts#SENTIDOS`)

`pantalla` (lo que pinta el OS: escáner del DOM) · `captura-pantalla` (píxeles de toda la pantalla, también otras apps) ·
`archivos` (carpetas del cerebro y de la Biblioteca que el dueño señale) · `red` (páginas, publicaciones, grupos, mensajes,
notificaciones, enlaces del OS e internet) · `correo` · `terminal` (del aparato; solo app nativa) · `camara` · `microfono` ·
`sensores` (movimiento, wearables, salud) · `ubicacion` · `portapapeles` · `aparatos` (BLE, serie, MIDI, HID, Meshtastic).
**Íntimos**: captura de pantalla, correo, terminal, cámara, micrófono, sensores y ubicación.

### 5.2 Permiso por sentido (`permisos.ts#decidirSentido`, en este orden)

1. Bot en pausa → no. 2. Sentido no habilitado por quien lo administra → no (`configuracion`). 3. Terminal fuera de la
app nativa → nunca. 4. **Invitado**: nunca captura, archivos, correo, terminal, cámara, micrófono, sensores, ubicación,
portapapeles ni aparatos; solo `pantalla` (lo que el OS pinta) y `red`, con permiso **de una hora como mucho**. 5. Bot de
entidad → nunca la terminal de tu aparato (tiene su computadora). 6. **Consentimiento de la persona cuyos datos son**
(`ConsentimientoSentido`, con caducidad o hasta revocar): en un grupo cada miembro consiente por sí mismo; un administrador
no consiente por otro. 7. **Sesión pública**: todo sentido salvo `red` exige además permiso **expreso**. 8. Permitido →
`indicador: true`.

**Indicador visible siempre** que un sentido está activo (BOT1011E2): anillo en la orbe con un icono Lucide por sentido,
que al tocarlo apaga ese sentido o pausa el bot. Los datos de salud siguen `protomolecula/permisos.ts#decidirSalud` y la
cámara del passthrough y el mapa de la habitación no salen del aparato (`xr/privacidad.ts`).

### 5.3 El bucle (`bucle.ts`)

Máquina de estados pura: `reposo → observando → (proponer) → esperando | actuando → hecho | rechazado`, con eventos
`observar`, `soltar`, `proponer`, `confirmar`, `rechazar`, `aplicada`, `fallo`, `deshacer` y `pausar`. Garantías: ningún
sentido sin `Decision` permitida; nada se aplica sin propuesta; lo que pide confirmación, votación o consentimiento
**espera a una persona**; una propuesta a la vez; cada paso al **registro** (quién, qué, motivo, deshacer; máx. 500 en
memoria, el resto en `astraura_bots_registro`); **pausar** apaga todos los sentidos y suelta lo pendiente. «Entender» es
el reparto de modelo (§9) + la decisión Needle → Laya → Jev; «proponer» es `validarAccion` + `decidirAccion`.

## 6 · Acciones sobre el OS (`acciones.ts`)

### 6.1 Vocabulario cerrado

| Acción | Riesgo | Invitado | Deshacer | Va a |
|---|---|---|---|---|
| `navegar`, `abrir-app` | bajo | sí | inverso / cerrar | `aurora/actions` (`navegar`, `ir_app`) |
| `capa-pantalla` (resaltar, nota, flecha o widget `UiSpec` sobre la pantalla) | bajo | sí | retirar | `screen-overlay` + renderizador de `UiSpec` |
| `widget.añadir/mover/quitar`, `dashboard.editar`, `escritorio.organizar` | bajo–medio | no | inverso | dashboards, escritorios |
| `pizarra.operar` | medio | no | inverso | `salas/sincronia-sala` |
| `pagina.editar` | **alto** | no | inverso | `genesis/operaciones` |
| `ajuste.proponer`, `ui.proponer` | medio | no | inverso | `ui-acciones` / `validarUiSpec` |
| `protomolecula.operar` | medio | no | inverso | Protomolécula §5.1 |
| `xr.intencion` | medio | sí | (la suya) | `xr/intenciones-voz` |
| `codigo.proponer` | bajo (es un candidato) | sí | nada | almacén de candidatos |
| `computadora.ejecutar` | medio | no | irreversible (se restaura la copia) | computadora del bot (§7) |
| `mensaje.enviar` | **alto** | no | retirar | mensajería |
| `publicacion.borrador` | medio | sí | inverso | lienzo universal (publicar es humano) |
| `tarea.crear` | medio | no | inverso | tareas con director (§8) |
| `memoria.recordar` | bajo | no | inverso (olvidar) | cerebros, con `puedeEscribirMemoria` |
| `notificar` | bajo | sí | retirar | notificaciones |

`validarAccion` desconfía: tipo desconocido → fuera; campo no declarado → descartado (y dicho); rutas solo internas (sin
`//`, `..` ni esquemas); texto que parece código → fuera salvo en `codigo.proponer.codigo` y `computadora.ejecutar.orden`;
JSON ≤ 20 000 caracteres y sin código incrustado; nada con forma de clave (`sk-`, `gsk_`, `Bearer`) ni rutas del disco
(`/Users/…`, `/home/…`); un candidato nunca apunta al **núcleo intocable** (`NUCLEO_INTOCABLE`).

### 6.2 Decisión (`permisos.ts#decidirAccion`)

Nivel por persona y bot (`nada` · **`proponer` por defecto** · `aplicar`), como `ui-permisos.ts`. Riesgo alto → siempre se
confirma. Invitado → siempre se confirma y nunca computadora ni mensajes. Observador/invitado → no cambia nada que perdure.
Bot de entidad + recurso común → gobierno (§3.2). **Síntesis en vivo**: un bot sintetiza programas, widgets, objetos o
animaciones 2D/3D como (a) `UiSpec`/`capa-pantalla` (datos, se aplican al momento si el nivel lo permite) o (b)
`codigo.proponer` (código): candidato con diff legible y revisión de secretos; se previsualiza en el iframe aislado de
`code-runtime.ts`; **aceptarlo es un gesto humano** y solo sobre código propio de la persona, nunca del núcleo.

## 7 · La computadora en la nube de cada bot

- **Qué es**: un entorno aislado POR BOT (navegador con su perfil, `/workspace` persistente, shell acotada) donde el bot
  navega, descarga, convierte y prueba lo que no debe tocar el aparato de nadie.
- **Medios, por orden** (`computadora-tipos.ts#elegirComputadora`, BOT1011K): 1) **A1 de Oracle** con el `supervisor` +
  `agent-computer` de openbot construidos desde un commit fijado (BOT1011L, visto bueno de Alex); 2) una **neurona propia**
  con Docker (servidor o escritorio de la persona) que se ofrezca; 3) **GitHub Actions** para trabajos por lotes sin
  navegador interactivo; 4) sin medio → «próximamente: falta una computadora» (nada se ejecuta en tu aparato).
- **Aislamiento**: un contenedor y un volumen por bot; token derivado por bot (el maestro solo en el servidor); solo
  loopback; gVisor (`runsc`) si el host lo tiene; **salida de red por lista** (`allowlist_only` por defecto,
  `deny_all` si el dueño lo apaga); navegador, archivos y terminal **apagados por defecto** y concedidos por separado; toma de
  control humana; cuota de CPU/RAM/disco por bot y apagado por inactividad (el A1 tiene 2 OCPU/12 GB para todo).
- **Conectores**: cada bot declara sus conexiones (apps del OS, MCP, cuentas vinculadas) **por nombre de variable o de
  vínculo** (`externos/vinculos.ts`, bóveda); las claves viven en el servidor y nunca entran al contenedor del bot salvo que
  la acción lo pida y la persona lo apruebe; el registro anota que se usó una clave, nunca su valor.

## 8 · Tareas con director (Genesis y PoliGenesis)

`tarea.crear` → `Tarea {titulo, director (bot), agentes, criterios, verificador, origen}`. Desde **Genesis** (persona) o
**PoliGenesis** (entidad, con su gobierno). El director reparte pasos entre agentes (los del taller, `agentes/taller.ts`) y
usa el reparto de modelo (§9). **Verificación profesional**: sin criterios comprobables no hay tarea; una tarea no pasa a
`hecha` sin que el verificador (`persona`, `bot` distinto del que la hizo, o `pruebas`) marque cada criterio; lo verificado
queda en el registro. Esto son tareas de las personas sobre su cuenta; **no** es el enjambre de desarrollo (MetaGenesis),
que sigue con sus propias colas.

## 9 · Modelos: Astraura local primero (`reparto-de-modelo.ts`)

Tarea → capa (`herramienta`/`juicio` → reflejo; conversación/resumen → palabra; código/plan → razón (alta: profunda);
visión/contexto largo → profunda; voz; memoria). Orden: **este aparato** → **par de la cuenta** → **servidor propio** →
**servidor StarSeed** (no si es privado) → **APIs externas** (solo si es público, gratis primero, de pago solo por encima de
la reserva; la elegida por la persona va delante). El nivelador (`capas-conciencia`) > 0,5 pone las externas delante. Sin
conexión, solo local; si falta la capa ideal, una más ligera local antes que nada; capa apagada no se usa. Herramientas:
Needle → Laya → Jev; juicios: Jev primero. Invitado → su propio modelo. El adaptador (BOT1011P) pasa el lado local a
`planificar()` para modelo, profundidad y nodo concretos.

## 10 · Memoria y recuerdos del bot

- **Capas**: memoria de trabajo (la conversación), recuerdos del bot (lo que aprende de su dueño o de su grupo), conciencia
  colectiva (lo que comparte el ámbito con permiso, `capas/ambito.ts#CompartirAprendizaje`).
- **Alcance** (`permisos.ts#memoriaVisible`, `#puedeLeerMemoria`, `#puedeEscribirMemoria`): personal y perfil solo de la
  MISMA cuenta; grupo solo del grupo al que sirve; invitado solo lo público. Antes de que un bot de grupo o público
  responda se pasa `detectarFuga` contra lo personal.
- **Almacenamiento autorregulado** (BOT1011Q): cuota por medio (web pequeño, PWA mediana, nativa mayor; editable), olvido
  por relevancia × recencia, nunca se olvida lo fijado; **transferencia entre neuronas** solo dentro de la cuenta (recuerdos
  personales) o hacia el servidor/neuronas del grupo (recuerdos del grupo), por la malla primero (`archivos-malla`,
  trozos con SHA-256) y nunca pesos por LoRa.

## 11 · Bots externos e invitados

- **AG-UI** (BOT1011M, BOT1011N): lector puro de eventos + proxy de servidor con guardia SSRF (`security/ssrf.ts`); endpoint y
  cabecera de autorización guardados de solo escritura; sus llamadas a herramientas se vuelven **propuestas** validadas.
- **Externos** (BOT1011O): Grok (xAI, `XAI_API_KEY` solo en el servidor) y cualquier API compatible con OpenAI como
  invitados; nunca predeterminados; mismos límites: sentidos mínimos, sin memoria personal, todo se confirma, ficha con su
  coste. Lo predeterminado sigue siendo Astraura, de código abierto y local.

## 12 · Cuerpo, avatares, XR y Protomolécula

- **Formas** (`Cuerpo.forma`): `orbe` (la cuántica actual), `avatar-2d` (imagen o animación de la Biblioteca), `avatar-3d`
  y `vrm` (en 3D/XR, cargados perezosamente; `@pixiv/three-vrm` llega con XR1010A), `ser-genesis` (cuerpo derivado del ADN).
  Avatares solo por **referencia a la Biblioteca** (privada o pública) o al ADN, nunca una URL suelta. Cambia de forma
  según contexto (orbe en 2D, avatar en XR) y anima con la emoción expresada.
- **XR**: cada bot abierto es un ancla en el espacio Trinity (`xr/espacio-trinity.ts`); habla y actúa por
  `xr/intenciones-voz` con tarjeta de confirmación; la Protomolécula se maneja con `protomolecula.operar`.
- **Capas sobre la pantalla**: `capa-pantalla` con resaltados, notas, flechas y widgets `UiSpec` que se retiran con un toque.

## 13 · Personalización total

Nombre, cuerpo (forma, tono, escala, avatar), personalidad (rasgos y agente por defecto), voz (catálogo existente),
sentidos habilitados, nivel por acción, modelo (reparto, nivelador, API fija), memoria (cuota, qué comparte), computadora
(medio, permisos, red) y roles. Todo editable en el panel (BOT1011I1, J1, J2); en un grupo democrático, por votación.

## 14 · Fases honestas

| Fase | Qué | Estado |
|---|---|---|
| **F0** | Contrato + núcleo puro (`tipos`, `permisos`, `personalidad-adaptable`, `acciones`, `reparto-de-modelo`, `bucle`) con 91 pruebas | **Hecho** (2026-10-11), sin integrar en `main` todavía |
| F1 | Almacén, migración, orbe-bot fusionada, indicador y consentimiento, puente de sentidos, ejecutor de acciones, tarjeta y registro, panel en Genesis, bots de entidad con votación | Cola BOT1011A–J2 |
| F2 | Computadora (cliente), AG-UI e invitados, reparto vivo, memoria por capas, tono en el chat, Protomolécula/XR, cuerpo, capas sobre la pantalla, tareas con director, sincronía, Biblioteca y lanzador | Cola BOT1011K–Z (31 tareas en total) |
| F3 | Computadora en el A1 (con visto bueno), XR/VRM, terminal del aparato en la app nativa | Depende de Alex y de XR1010A |

**Lo que NO se puede prometer**: ver la pantalla de **otras apps** en la web sin que la persona comparta pantalla cada vez
(es el navegador quien lo exige); leer el terminal del aparato fuera de la app nativa; cámara o micrófono en segundo plano en
iOS; que un bot invitado respete nuestras reglas por dentro (por eso no recibe nada íntimo); empatía «sentida» (la emoción es
expresada y tiene límites); que la computadora del A1 aguante muchos bots a la vez (2 OCPU/12 GB compartidos).

## 15 · Núcleo escrito (referencia rápida; no se modifica sin actualizar este contrato)

| Archivo | Da |
|---|---|
| `src/lib/astraura-bots/tipos.ts` | `Bot`, `Dueno`, `Gobierno`, `RolBot`, `OrigenBot`, `SENTIDOS`, `SENTIDOS_INTIMOS`, `ConsentimientoSentido`, `RASGOS`/`Personalidad`, `EMOCIONES`/`EstadoEmocional`, `Cuerpo`/`FORMAS_CUERPO`, `TipoSesion`, `Medio`, `Tarea`, guardas `esSentido`/`esRol`/…, `acotar`, `esBotDeEntidad`, `esInvitado` |
| `permisos.ts` | `decidirSentido`, `consentimientoVigente`, `NUNCA_INVITADO`, `VIGENCIA_MAX_INVITADO_MS`, `decidirAccion` (`NivelBot`, `delegado`), `actorDeBot`, `memoriaVisible`, `puedeLeerMemoria`, `puedeEscribirMemoria`, `decidirConfiguracion` (`CambioBot`), `Decision`/`Requisito` |
| `personalidad-adaptable.ts` | `mezclarPersonalidad`, `estadoEmocional`, `expresionCuerpo`, `instruccionesDeTono`, `LIMITES_HONESTOS`, `SITUACIONES`, `DERIVA_MAXIMA`, `PESO_AGENTE`, `INERCIA` |
| `acciones.ts` | `TIPOS_ACCION`, `META_ACCION`, `AccionBot`, `validarAccion`, `deshacer`/`Previo`/`ResultadoDeshacer`, `NUCLEO_INTOCABLE`, `tieneSecreto`, `tocaNucleo` |
| `reparto-de-modelo.ts` | `repartir`, `capaDeTarea`, `TAREAS_BOT`, `EntradaReparto`, `PlanReparto`, `MAX_RESPALDO` |
| `bucle.ts` | `bucleInicial`, `avanzar`, `indicadorVisible`, `EstadoBucle`, `EventoBucle`, `EntradaRegistro`, `MAX_REGISTRO` |

Pruebas: `npx vitest run src/lib/astraura-bots` (91 en verde el 2026-10-11, incluida la guardia de pureza: sin React, red,
DOM, reloj ni `node:*`; ≤ 200 líneas; solo importa del propio núcleo y de `nucleo/{alcance-memoria,ui-spec,paquete-sistema}`).
Los adaptadores con React, Supabase o red van en `src/lib/astraura-bots/adaptadores/` y `src/components/astraura-bots/`.

## 16 · Cola del enjambre y continuación

Cola `starseed_memory_root/olas/cola-bots-1011.json` (ids `BOT1011A…`), copia en `/mnt/user-data/outputs/colas/`. Cada
tarea ≤ 3 archivos y ≤ 120 líneas por archivo, con prompt autosuficiente que repite las reglas de §0. Lo que necesita a
Alex lleva `aprobacion: true` (BOT1011L: servicio de computadoras en el A1). La migración (BOT1011B) se **escribe** y se
prueba; aplicarla es un paso aparte de Genesis.

## 17 · Decisiones para Alex

1. **Computadora del bot en el A1 con el supervisor de openbot** (Docker + gVisor si se puede): ¿sí? Es la única pieza que
   ejecuta cosas de verdad; consume parte de los 2 OCPU/12 GB. Mientras no lo diga, «próximamente».
2. **Nivel por defecto** `proponer` (el bot propone y tú confirmas). ¿Quieres que tu bot personal arranque en `aplicar` para
   lo de riesgo bajo (navegar, abrir apps, capas sobre la pantalla)?
3. **Grok** como primer invitado externo: necesita `XAI_API_KEY` en el servidor (hay un `xai-proxy.js` en el repo).
4. Grupos democráticos: ¿delegación por defecto `bajo` para que el bot común mueva/organice sin votar cada vez?

## 18 · Patrones de open-dots y opendots (anexo, 2026-10-11)

Alex pidió usar también `Anil-matcha/open-dots` y `diggerhq/opendots`. Investigados en
`architecture/astraura-bots-fuentes-extra.md`: ninguno se instala ni se usa como dependencia (open-dots sin licencia
verificable y con sandboxes de pago; opendots MIT pero sobre OpenComputer, servicio de pago) y no traen conectores
propios (los reales vienen de CopilotKit, §1.5). Se adoptan sus patrones, reescritos en el núcleo propio, con esta
prioridad:

- **P1 · Reglas de permiso persistentes con caducidad y alcance por bot** → `permisos.ts` (ninguna regla sin fin ni global).
- **P2 · Clasificador de comandos de terminal sin evasiones** (salto de línea, `&`, `|&`, `$()`, comillas invertidas,
  `<()`, alias) → acciones de terminal (solo app nativa, nunca bots de grupo).
- **P3 · Preguntas con caducidad que caen en «denegar»**, respondibles con botones (también Telegram) y siempre con
  autenticación de quien responde → bucle `proponer`.
- **P4 · Crear antes de lanzar y rescate de huérfanas** → tareas del bot con director (§ tareas).
- **P5 · Rutinas con margen de retraso y pausa tras fallos seguidos** → rutinas de cada bot.

P6–P12 (credencial renovada en su sitio, login device-flow, coordinador con bots por tema, delegación idempotente, notas
con control de revisión, higiene frente a texto inyectado y entrega por evento con sondeo de respaldo) quedan descritos
en el anexo para las fases siguientes. Los fallos de seguridad de open-dots (respuestas sin autenticar, clasificador
evadible, reglas sin caducidad) son la lista de lo que este diseño NO repite.
