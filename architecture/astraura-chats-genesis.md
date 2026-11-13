# Chats de Genesis en Astraura · contrato (GEN1113 · 2026-11-13)

> **Petición de Alex (2026-11-13), literal:** «en la seccion principal de chats de astraura ai & orquestration (cambia el
> titulo a español) en las conexiones de chat añade la opcion de conectar los agentes de genesis y poligenesis (y en
> nuestro caso tambien de metagenesis por que tenemos acceso a el programa en produccion), elimina la pestaña de telegram
> y translada las configuraciones de la pestaña de esa seccion de Telegram a dentro de la de conexiones de chat como una
> opcion, en lugar de la pestaña de telegram agrega una de Genesis donde se pueda acceder y administrar a los chats de
> genesis, poligenesis y metagenesis de cada usuario o pagina. por ejemplo para probar eso y hacerlo funcional vamos a
> vincular los chats de direccion de metagenesis en esa seccion con los mismos canales y puentes vinculados de los agentes
> completos en tiempo real. y los de telegram y otros medios compatibles de vinculacion al igual que cualquier chat de
> astraura deben poder seleccionar y configurarse o transladarse a la pestaña y seccion de genesis/poligenesis/metagenesis
> y/o a la de chats, o sea puede estar en ambas el mismo chat. la pestaña de genesis deben ser chats que los usuarios o
> grupos configuren para los desarrollos de proyectos o sistemas personalizados utilizando la protomolecula y astraura
> como agentes y bots especializados con personalidades y contextos configurables y automatizados, o sea en la pestaña de
> genesis deben aparecer todas las versiones de genesis tanto personales como grupales privadas y publicas para la
> gestion y administracion de los procesos y tareas de los agentes y bots programados con las personalidades a traves del
> sistema de astraura y la protomolecula con las versiones de genesis, y pueden ser agentes, bots y chats compartibles
> sincronizables con multiples servidores y usuarios para individuos y comunidades y paginas de todo tipo. para dejarlo
> funcionando como prueba vamos a vincular los chats de direccion de todas las pestañas funciones y filtros de la
> direccion principal general de metagenesis accesible desde cualquier neurona donde use mi cuenta, y tambien vamos a
> vincular los canales de los puentes de mando de telegram de los 3 chats que tenemos vinculados y desde ahi debo poder
> hacer lo mismo que desde los chats de telegram, y sin dependencia de telegram como canales de chats con los mismos
> accesos, capacidades y permisos y contextos completos de los chats de todos los medios incluyendo telegram, hermes,
> metagenesis, claude, y los demas ide vinculados como antigravity y otras opciones disponibles funcionales de cualquier
> tipo de IDE de desarrollo de programacion. automaticamente el sistema debe con astraura detectar los chats de todas las
> IDE usadas y acomodar las sincronizaciones y conexiones de vinculos en tiempo real de los chats y procesos y contextos y
> habilidades y conexiones y herramientas de los workflows completos con los procesos de vinculacion inteligentemente
> automatizados autoadaptativos»

**Destino en el repo:** `architecture/astraura-chats-genesis.md` (copia de trabajo:
`~/.starseed/opus1031/contratos/astraura-chats-genesis-1113.md`). **Contrato escrito ANTES del código** (regla dorada):
lo que no esté aquí no forma parte del encargo. Leído contra main `37bdfbf6d` (2026-11-13). Cada afirmación sobre el código
lleva su archivo; lo que es inferencia lo dice («INFERIDO»).

---

## 0. Resumen en diez líneas

1. El título pasa a **«Astraura IA y Orquestación»**.
2. La sección «Chat Multiagéntico & Voz» queda con **Chats · Multiagente 1.58 · Conexiones de chat · Genesis**. La pestaña Telegram
   desaparece y su contenido entra en **Conexiones de chat** como una opción más.
3. **Conexiones de chat** suma tres opciones: agentes de **Genesis** (tu cuenta), **PoliGenesis** (tus grupos y páginas) y **MetaGenesis** (solo
   cuentas con acceso).
4. La pestaña **Genesis** lista los chats de los tres niveles. Un mismo chat puede estar en Chats y en Genesis a la vez: es un **vínculo**, no una copia.
5. **Primer objetivo (fase 1, GEN1113):** desde cualquier aparato con la cuenta de Alex, dentro de Genesis:
   - el chat de dirección de MetaGenesis con sus seis vistas y todos sus filtros;
   - los tres puentes de Telegram, con las mismas órdenes que en Telegram y sin pasar por Telegram.
6. **Transporte elegido: la puerta de datos del A1.** La Mac solo sale hacia ella y nadie entra en la Mac.
   - Los mensajes no gastan cuota de Supabase.
   - Con la Mac apagada, lo escrito espera en el A1 y lo dice.
7. **Seguridad:**
   - sesión de Supabase verificada en la puerta (JWKS en local);
   - pertenencia a MetaGenesis comprobada en la puerta;
   - rol **dueño** obligatorio para todo lo que pone a trabajar a un agente o cambia algo;
   - segunda comprobación en la Mac contra una lista local de cuentas;
   - registro sin contenido;
   - las órdenes caducan.
8. **Fases siguientes:**
   - chats de Genesis y PoliGenesis con Astraura y la Protomolécula como bots con personalidad (fase 2);
   - compartir y sincronizar entre servidores y personas (fase 3);
   - detección automática y local de los chats de los IDE (fase 4).
9. Seis paquetes en paralelo, sin archivos compartidos (§9).
10. Nueve decisiones que Alex puede cambiar (§11).

---

## 1. Lo que hay hoy (leído en el código)

### 1.1 La página `/agent` (`src/app/(app)/agent/page.tsx`, 2.018 líneas)

- Título fijo en la línea 1306: `<span className="truncate">Astraura AI & Orchestration</span>`. El mismo texto aparece en el
  catálogo de funciones (`src/components/funciones/funciones-index.tsx:93`) y en comentarios. Ninguna prueba lo cita.
- **Estructura del menú.**
  - El menú es `STUDIO_SECTIONS`, con 22 secciones (líneas 300 a 583).
  - Cada sección tiene ítems `{value, label, icon}`, y cada `value` tiene su propio `<TabsContent>`.
  - `VALUE_TO_SECTION` (línea 589) se deriva de las secciones.
  - `TAB_ALIASES` (596 a 725) traduce los nombres viejos de `?tab=`, y `normalizeTab` (726) solo acepta un `value` que exista.
  - En pantallas menores que lg, la lista de secciones es `MenuListaMovil` (líneas 1376 a 1383).
- **Sección `chat` («Chat Multiagéntico & Voz», líneas 300 a 314):**

| `value` | Etiqueta | Qué monta (`TabsContent`) | Qué hace |
|---|---|---|---|
| `chat` | Chats | línea 1509 | El chat unificado de Astraura y Aurora (ver §1.3). Barra lateral `src/components/agent/chat-neural-sidebar.tsx`. |
| `chat-158` | Multiagente 1.58 | `S158TabHost` | El chat multiagente del backend 1.58. |
| `conexiones-chat` | Conexiones de chat | línea 1880, `ChatConnectionsPanel` | Las tres fuentes del chat, ver §1.2. |
| `telegram` | Telegram | línea 1854, `TelegramSpacesPanel` (`src/components/exocortex/telegram-spaces-panel.tsx`) | Ver abajo. |

- **Qué hace hoy la pestaña Telegram.** **No guarda nada**: no escribe en ninguna tabla ni en `localStorage`.
  - **Bot.** Pone la tarjeta de `@starseed_nexus_bot`, que está fijado en la línea 12. Tiene un botón «Conectar mi cuenta» que abre
    el enlace profundo `https://t.me/starseed_nexus_bot?start=acc_<uid>` y un botón «Chatbot».
  - **Espacios.** Lista siete canales y grupos fijos de StarSeed (`SPACES`, con enlaces de invitación t.me).
  - **Lecturas.** Lee `telegram_links` (`handle`, `display_name`, `telegram_id`) y los últimos 40 `astraura_messages` de la cuenta.
    Usa Supabase Realtime sobre `astraura_messages` filtrado por `user_id`.
  - **Quién escribe.** El vínculo real (`telegram_links`) lo escribe el bot. Su código **no está en este repo**: no hay
    `supabase/functions`, y ningún archivo hace `getUpdates` de ese bot.
- **Choque de nombres que hay que respetar.** `TAB_ALIASES` ya tiene `genesis: "genesis-seres"` (línea 716), que lleva a la
  sección 23 «Génesis de Seres» (`value`s `genesis-seres`, `genesis-mundo` y `genesis-oficina`). Enlaces que apuntan a la
  pestaña Telegram: `funciones-index.tsx:131` (`/agent?tab=telegram`).

### 1.2 «Conexiones de chat» (`src/components/messaging/chat-connections-panel.tsx` + `src/lib/messaging/messaging-channels.ts`)

- **Modelo.** Es un modelo «tri-fuente». `ChannelScope = "terminal" | "starseed" | "external"`, y cada fuente guarda
  `{scope, provider, enabled, config, memory_enabled, context}`.
- **Proveedores externos.** `ExternalProvider` incluye `telegram`, `google_chat`, `whatsapp`, `custom`, `hermes`, `terminal`,
  `sms` y `webhook`.
- **Persistencia.** Tabla `messaging_channels` con índice único `(owner, scope)`, RLS por dueño y Realtime. La migración que
  **crea** la tabla no está en `supabase/migrations/`: solo aparece en `20260929090100_realtime_publicacion_minima.sql`. Por
  eso no se sabe si `scope` tiene una restricción CHECK (§12).
- **Tarjeta «Externo» con Telegram.**
  - Su botón «Conectar Telegram» registra en `config` lo que la persona quiere hacer (`telegram_intent`, `account_id`,
    `deep_link` y `requested_at`) y abre el mismo bot.
  - El estado lo saca de `telegram_links` (`getTelegramLink`).
  - Para los demás proveedores pide `endpoint` y `key_ref`, que es un alias de la bóveda y nunca el secreto.
- **Otra superficie.** El panel también se monta en `src/app/(app)/aurora/page.tsx`.
- **Otras superficies con Telegram que este encargo no toca:**
  - `src/components/exocortex/telegram-chats-folder.tsx`;
  - `src/components/settings/ai/aurora-channels-panel.tsx`;
  - `src/app/api/telegram/{send,test,canales}`. En estas rutas el token es **del usuario**, va en el cuerpo de cada petición y
    no se guarda.

### 1.3 Cómo se modela y guarda un chat de Astraura

- `src/lib/aurora/conversations.ts`: `useAiConversations()` y `useAiMessages(convId)`.
- **Tablas** (`supabase/migrations/20260714100000_unified_ai_conversations.sql`):
  - `aurora_conversations` con `id`, `user_id`, `profile_key`, `title`, `kind` (`aurora`, `astraura`, `multichat`…),
    `persona`, `source`, `model`, `surface`, `meta jsonb`, `archived` y `folder`;
  - `astraura_messages` con `chat_id`, `role`, `content`, `meta`, `attachments`, `client_id` (para no duplicar), `source` y
    `created_at`;
  - carpetas en `aurora_chat_folders`.
- **Permisos y tiempo real.** Por fila con `user_id = auth.uid()` y Realtime. `meta.config` guarda la configuración de cada chat.
- **Preferencias de la cuenta.** Hay una fila `user_settings.prefs` que se escribe con un parche atómico
  `mergeUserPrefs()` (`src/lib/sync/user-prefs.ts:150`).

### 1.4 El chat de dirección de MetaGenesis (contrato `architecture/chat-director-mando.md`)

- **Almacén.** Un solo archivo de solo-añadir: `starseed_memory_root/mando/director/chat.jsonl`, con registros `mensaje` y
  `entrega`. Tipos en `src/lib/mando/chat-director-tipos.ts` (`MensajeDirector`, `EntregaDirector`, `CanalId`, `CANALES`).
- **Fuentes del feed.** El feed es la fusión de cuatro colas de archivo, cada una leída como mucho en sus últimos 256 KB
  (`src/lib/mando/chat-director.ts › leerFeedDirector`):
  - `chat.jsonl`;
  - `mando/canal.jsonl`, con los directores y Telegram;
  - `olas/eventos.jsonl`, solo lo importante;
  - `relevo/bitacora.jsonl`.
- **Tamaño medido hoy** (solo cuentas):

| Archivo | Líneas | Tamaño | Líneas del 2026-11-12 |
|---|---|---|---|
| `chat.jsonl` | 17.652 | 12,9 MB | 366 |
| `canal.jsonl` | 95.909 | 22,4 MB | 939 |
| `eventos.jsonl` | 145.925 | 35,8 MB | 1.756 |
| `bitacora.jsonl` | 2.140 | 0,5 MB | 18 |

- **Pestañas y filtros.** Son lógica pura en `src/lib/mando/chat-director-feed.ts`:
  - `FiltroFeed = "todo" | "direccion" | "conversacion" | "informes" | "enjambre" | "usos"`;
  - `esDireccion`, `filtrarFeed`, `opcionesDeFiltro`, `aplicarFiltro` y `etiquetaDeFiltro`.
  - Cada pestaña tiene sus chips de filtro, recordados en el aparato (`starseed.mando.director.filtros`). Es el mismo
    contrato que en §5.
- **Interfaz.** `src/components/mando/chat-director.tsx` (529 líneas), con `chat-director-mensaje.tsx`,
  `chat-director-compositor.tsx` y `selector-canales.tsx`. Pide el feed cada 10 s con `fetch("/api/mando/director-chat?desde=…")`.
- **Ruta.** `src/app/api/mando/director-chat/route.ts`:
  - `GET` devuelve el feed;
  - `POST` acepta `decir`, `responder` y `reenviar` y publica el mensaje de Alex con `canal: "mando"`;
  - si el modelo es un motor (`director-presidente`, `claude-*`, `hermes`, `codex`), deja una entrega `pendiente` para el
    cartero (`com.starseed.cartero`, vivo);
  - si no, llama al modelo él mismo.
- **Quién entra.** La puerta es `guardianMando` (`src/lib/mando/guardian.ts`):
  - una petición de **esta** máquina (`esPeticionDeEstaMaquina`) pasa sin sesión;
  - desde fuera hace falta una sesión y `es_metagenesis()`;
  - con la consola apagada en esa instancia, 404. En Vercel `/api/mando/*` responde 404 (`mandoHabilitado`).
- **Desde otro aparato hoy.** `/metagenesis` envuelve la consola en `MetaGenesisRemoto`, que reescribe todo `/api/mando/*`
  hacia un **túnel rápido de Cloudflare** a la Mac (`com.starseed.tunel-metagenesis`, vivo) con la sesión como
  `Authorization: Bearer` (`architecture/metagenesis-remoto-tunel.md`). Con la Mac apagada no hay nada que leer.
- **El chat ya compartido por la puerta (IND1029H, `b906119f8`).**
  - `director_chat.publicar` deja una copia de cada mensaje en la puerta del A1, como latido de clase `metagenesis` con id
    `chat.<id>`.
  - `espejo_puerta.py` copia los últimos 12 mensajes, tachados, en la foto de estado.
  - **`recoger_puerta` no lo llama nadie** (`git grep`): lo que se escribe fuera de la Mac nunca llega al chat local. A medio
    hacer.

### 1.5 Los puentes de Telegram (qué puede hacer un mensaje y quién lo autoriza)

**Cómo se miró.** Se compararon los valores de las variables **sin imprimir ninguno**: solo se comprobó qué valores son
iguales entre sí. Así se ve que en la Mac hay **tres bots distintos**:

| # | Bot y variables | Quién escucha | Qué puede hacer un mensaje entrante | Autorización |
|---|---|---|---|---|
| A | **Bot de Hermes** (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`/`TELEGRAM_HOME_CHANNEL` de `~/.hermes/.env`) | **el gateway de Hermes** (el agente con sus herramientas: terminal, MCP `starseed-director`, Vercel, Supabase). `telegram-puente.py` (`com.starseed.telegram`, que carga ese mismo `.env`) va en **modo solo envío** (`STARSEED_TELEGRAM_ESCUCHA` sin poner) y manda los avisos importantes del canal y su vigilancia propia; el cartero y el buzón (`buzon_telegram.py`) entregan con `hermes send -t telegram:Maggasukha` | Con Hermes escuchando: conversación con un agente que puede ejecutar órdenes en la Mac. Las órdenes del puente (`/estado /agentes /olas /cola /puertas /ayuda /aprobar /rechazar /soltar /reasignar /decir /a`, `parsear_orden`) solo se atienden si `STARSEED_TELEGRAM_ESCUCHA=1` | Puente: solo `/aprobar /rechazar /soltar /reasignar` comprueban `_autorizado(chat)` contra `TELEGRAM_CHAT_ID`; el texto suelto y `/decir` entran al canal sin comprobar. Hermes: su propia configuración (no leída: §12) |
| B | **Bot de la síntesis, @StarSeed_Design_bot** (`TELEGRAM_SINTESIS_BOT_TOKEN`/`TELEGRAM_SINTESIS_CHAT_ID`; el `HOME_CHANNEL` de Hermes es ese mismo chat) | `peticiones_telegram.py` **en el A1** (servicio `starseed-peticiones-telegram`, `architecture/peticiones-telegram-a1.md`), sin la Mac ni Claude | Peticiones a NotebookLM, **encargos de varias horas** (Drive, investigación), ajustes, preferencias; `/estado /ayuda /encargos /pausa /sigue /cancela` | Solo `TELEGRAM_SINTESIS_CHAT_ID` (línea 311: cualquier otro chat se ignora) |
| C | **Bot de `~/.starseed/env`** (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`, otro token y otro chat) | nadie escucha (envío) | Lo usan para avisar `acciones-de-alex.py`, `desatascar.py`, `director-acciones.py`, `sintesis_telegram.py`, `oracle_nodo.py`, el enjambre | — |

- **Qué se toma como «los 3 chats».** INFERIDO: son **A** (Hermes y avisos), **B** (peticiones y encargos) y **C** (avisos de
  los directores). La alternativa es que el tercero sea `@starseed_nexus_bot`, el bot público de Astraura: su servidor no
  está en este repo y no es un puente de órdenes. Alex lo confirma (decisión D1).
- **El túnel viejo sigue vivo.** `com.starseed.mando.tunel` (`tunel-mando.sh`) sigue cargado. Según
  `metagenesis-remoto-tunel.md` «abre TODO el servidor» y manda el enlace por Telegram. No se toca aquí, pero hay que revisarlo
  (§12).

### 1.6 Accesos de MetaGenesis (la tabla y sus comprobaciones)

- **Tabla.** `supabase/migrations/20261010091000_metagenesis_accesos.sql`:
  - tabla `metagenesis_accesos(account_id, rol ∈ {dueño, desarrollador}, otorgado_por, nota)` con RLS;
  - funciones `es_metagenesis(_uid)`, `es_metagenesis_dueno(_uid)`, `metagenesis_otorgar(identificador, rol, nota)` (solo
    un dueño) y `metagenesis_revocar(account)` (MetaGenesis nunca se queda sin dueño).
- **Cliente e interfaz.** `src/lib/metagenesis/accesos.ts`: `miAccesoMetaGenesis()` devuelve `{miembro, dueno}`. La interfaz
  vive en Ajustes › Accesos.
- **Genesis y PoliGenesis** (`architecture/genesis-personas-poligenesis.md`, `src/components/genesis/*`, `src/lib/genesis/*`):
  - Genesis es por cuenta, con operaciones tipadas y deshacer;
  - PoliGenesis va por entidad, con un rango de `os_entity_roles` (≥ 2 colaborar, ≥ 3 gestionar) y el modo de gobernanza
    (en democracia, cada cambio es una propuesta);
  - `/genesis` tiene el selector de nivel `?nivel=mi|poli|meta`.

### 1.7 Los demás canales que ya existen

- **Canales del chat de dirección** (`CANALES`, el mismo orden en `director_chat.py`; una prueba falla si se separan):
  `mando`, `director-presidente`, `claude-cowork`, `claude-mac`, `hermes`, `telegram` (solo copia al móvil), `chatgpt`,
  `antigravity`, `ide` y `terminal`.
- **Puentes a los IDE.**
  - **MCP.** `scripts/puente/mcp_director.py` expone `director_leer`, `director_decir` y `director_bandeja`. Está instalado en
    Claude Code, Codex, Hermes y Antigravity (`instalar_director.py`).
  - **Bandejas.** `starseed_memory_root/mando/director/bandeja/<canal>.jsonl`.
  - **Frescura.** `GET /api/mando/ides` (`src/lib/mando/ides.ts`) mide la frescura de los punteros de cada IDE
    (`~/.codex/AGENTS.md`, `~/.hermes/PUENTE-DE-MANDO.md`, `~/.gemini/antigravity/PUENTE-DE-MANDO.md`, reglas de Cursor), y
    `sincronizar-ides.py` los reescribe.
  - **Contenido.** Ningún código lee hoy el contenido de las conversaciones de los IDE.

### 1.8 Los transportes posibles (leído)

- **La puerta de datos del A1** (`servicios/puerta-datos/`, `architecture/puerta-datos-a1.md`). Encendida desde el 2026-10-10 y
  la usa el navegador desde el 2026-10-11, que encuentra la URL en la fila `os_puerta_datos`.
  - **Pieza.** Node sin dependencias, con SQLite WAL y Caddy con TLS.
  - **Sesión.** La verifica **en local con JWKS**: sin pedir `/auth/v1/user` a Supabase.
  - **Pertenencia.** `es_metagenesis` se pregunta con el JWT de la persona y se guarda 10 min si es sí y 2 min si es no.
  - **Fichas de máquina.** Se guarda su sha256, con ámbitos
    `bus | latidos | malla | astraura | freno | metricas | metagenesis | admin`.
  - **Bus con espera larga.** Hasta 25 s (`GET /v1/bus/eventos?esperar=`).
  - **Límites.** Texto ≤ 4.000 y datos ≤ 16 KB por evento; 120 peticiones/min por cuenta.
  - **⚠ El bus no protege órdenes.** `POST /v1/bus/eventos` acepta a **cualquier cuenta con sesión**
    (`exigir.cuentaOAmbito`): no sirve para llevar órdenes sin otra comprobación.
- **El túnel rápido de Cloudflare a la Mac** (§1.4).
  - Hace falta que la Mac esté encendida.
  - La URL cambia y se guarda en `metagenesis_motor`.
  - Cloudflare termina el TLS.
- **Supabase.**
  - El proyecto tiene un presupuesto diario de 25.000 peticiones (`guardian.ts`).
  - `vigia_consumo.py` pone el freno.
  - Alex ya lo agotó y lo quiere protegido.
- **La malla entre aparatos** (`architecture/red-sin-dependencias.md`, `transporte-universal-sin-internet.md`): Bluetooth, red
  local y Wi-Fi Aware/Direct entre neuronas **cercanas** de la misma cuenta. No llega a la Mac desde cualquier sitio.
- **El patrón de órdenes firmadas** (`src/app/api/metagenesis/orden/route.ts`, `src/lib/metagenesis/remoto-orden-servidor.ts`
  y `nodo_metagenesis_logica.validar_orden`):
  - el servidor comprueba la sesión y `es_metagenesis`;
  - aplica una lista blanca y un tope de 20 por hora;
  - firma con HMAC-SHA256 (`STARSEED_LANZADOR_SECRETO`);
  - el nodo verifica firma, ventana de tiempo y nonce.

---

## 2. Diseño de destino

### 2.1 Título y pestañas

- **Título.** `Astraura AI & Orchestration` pasa a **«Astraura IA y Orquestación»** en la cabecera
  (`page.tsx:1306`) y en `funciones-index.tsx:93`. Los comentarios no se tocan.
- **Pestañas de la sección `chat`, en este orden:**

| `value` | Etiqueta | Icono |
|---|---|---|
| `chat` | Chats | Bot |
| `chat-158` | Multiagente 1.58 | Users |
| `conexiones-chat` | Conexiones de chat | Send |
| `chats-genesis` | **Genesis** | Dna |

- **Lo que se quita.** El ítem `telegram` desaparece y también su `<TabsContent>`.
- **Lo que no se borra.** `TelegramSpacesPanel` se queda: lo monta Conexiones de chat.
- **Alias:**
  - `telegram`, `tg` y `telegram-spaces` llevan a `conexiones-chat`, y la página pasa `foco="telegram"` al panel, que hace
    scroll a la opción Telegram y la abre;
  - `chats-genesis`, `genesis-chats` y `metagenesis-chats` llevan a `chats-genesis`.
- **Lo que se mantiene.** `?tab=genesis` sigue llevando a «Génesis de Seres» (decisión D2), y ningún enlace guardado se rompe.
- **`funciones-index.tsx:131`.** Pasa a `{ label: "Telegram", route: "/agent?tab=conexiones-chat&foco=telegram", … }` y se
  añade `{ label: "Chats de Genesis", route: "/agent?tab=chats-genesis" }`.

### 2.2 «Conexiones de chat»

**Opciones.** Quedan seis, en este orden:

- las tres de siempre: Terminal (dispositivo), Servidor StarSeed y Externo;
- **Telegram** (nuevo bloque propio);
- **Agentes de Genesis**;
- **Agentes de PoliGenesis**;
- **Agentes de MetaGenesis** (solo con acceso).

**Externo.** Sigue igual para Google Chat, WhatsApp y webhook. Si se elige Telegram en «Servicio», muestra un enlace «Ver la
opción Telegram» en lugar de repetir el botón.

**Telegram** (todo lo que tenía la pestaña, sin perder nada):

- **Vinculación de la cuenta.** Botón «Conectar mi cuenta» o «Reconectar», el estado de `telegram_links` y el registro en
  `messaging_channels.external.config`, igual que hoy.
- **Canales y grupos de StarSeed.** Los mismos siete.
- **Chats sincronizados desde Telegram.** Lista con Realtime, igual que hoy.
- **Configuración nueva.** Un interruptor por cada chat sincronizado: «Mostrar en Chats» y «Mostrar en Genesis» (ver §3).
- **Para MetaGenesis.** Una fila por cada puente de Telegram de §1.5 (A, B, C), con:
  - su estado: el último aviso visto y cuándo, leído del espejo de la puerta (§5);
  - el enlace «Abrir en Genesis».

  Los tokens nunca se muestran ni viajan.

**Agentes de Genesis, PoliGenesis y MetaGenesis** (una tarjeta cada uno):

| Opción | Quién la ve | Qué conecta en la fase 1 | Qué guarda |
|---|---|---|---|
| Genesis | toda cuenta con sesión | el agente de Mi Genesis (`/api/genesis/proponer`, operaciones tipadas) como interlocutor de un chat; enlace a `/genesis?nivel=mi` | `prefs.chatsGenesis.conexiones.genesis = {activo, memoria}` |
| PoliGenesis | cuentas con alguna entidad con rango ≥ 2 (`src/lib/genesis/entidades.ts`) | elegir entidades; enlace a `/poligenesis?entidad=` | `…conexiones.poligenesis = {activo, entidades: string[]}` |
| MetaGenesis | `miAccesoMetaGenesis().miembro` | los chats de dirección y los puentes de Telegram (§2.3); muestra el rol (dueño o desarrollador) y qué puede hacer con él | `…conexiones.metagenesis = {activo}` |

Las tres opciones nuevas se guardan en `user_settings.prefs` y **no** en `messaging_channels` (decisión D3: no se sabe si la
tabla acepta un `scope` nuevo, §12).

### 2.3 La pestaña «Genesis»

**Columna de la izquierda** (en móvil, `MenuListaMovil` a pantalla completa). Tres grupos:

1. **MetaGenesis.** Solo aparece para miembros. Si no hay acceso no se pinta el grupo: una línea dice «MetaGenesis es para
   cuentas con acceso; lo da un dueño en Ajustes › Accesos».
   - **Dirección**, con las seis vistas: Todo · Dirección · Conversación · Informes · Enjambre · Usos. Cada vista tiene sus chips
     de filtro, exactamente `opcionesDeFiltro`. El chip activo se recuerda en el aparato con una clave propia,
     `starseed.genesis.chats.filtros.v1`, sin pisar la de `/genesis`.
   - **Puentes de Telegram:**
     - «Hermes y avisos» (A);
     - «Peticiones y encargos» (B);
     - «Avisos de los directores» (C).

     Nunca se usa la palabra «Mando»: lo vigila `nombre-genesis.test.ts`.
2. **Genesis (mi cuenta).** Los chats de Astraura vinculados al nivel `genesis`, más la entrada «Agente de Mi Genesis». En la
   fase 1, sin vínculos, el estado vacío dice:
   - «Aún no has llevado ningún chat a Genesis. Desde Chats: menú del chat › Llevar a Genesis.»;
   - y, en su línea, «Los bots con personalidad llegan en la fase 2».
3. **PoliGenesis.** Una entrada por entidad con rango ≥ 2 y sus chats vinculados. Vacío: «Ningún grupo ni página tiene chats
   de Genesis todavía».

**Panel de la derecha.** El hilo de la vista elegida y el compositor.

- **Dirección.** El compositor es el del chat de dirección:
  - texto;
  - modelo («Director presidente» por defecto, `MODELO_PRESIDENTE`);
  - canales de `CANALES`.

  A cada mensaje se puede «Responder con» y «Enviar a». Se muestra el estado de entrega de cada canal, y el texto «vía Genesis
  en Astraura» cuando el mensaje llegó por la puerta.
- **Puentes.** El compositor acepta las mismas órdenes que el bot de ese puente (§4.4) y texto suelto. Hay botones de ayuda
  con las órdenes (`/ayuda` en cada uno).

**Cabecera del panel.** Siempre visible. Dice de dónde viene lo que se ve: «En vivo desde la Mac (copia de hace 3 s)» o «La
Mac no responde desde las 14:02: ves la última copia; lo que escribas espera en el A1».

### 2.4 Un chat en Chats y en Genesis a la vez

**Un chat no se copia.** Se le ponen **vínculos**. Los botones dependen de dónde se abre:

- **Menú del chat en Chats** (`chat-neural-sidebar.tsx`): «Llevar a Genesis…», con nivel y entidad. El chat sigue en Chats y
  aparece también en Genesis.
- **Menú de un chat en Genesis:**
  - «Mostrar también en Chats» / «Quitar de Chats»;
  - «Cambiar de nivel»;
  - «Quitar de Genesis».

  No hay ninguna acción de borrar: borrar se hace solo desde el chat original.
- **Chats de dirección y puentes.** «Añadir a Chats» los pone en la barra de Chats como una carpeta «Genesis». Abrirlos allí
  lleva a la pestaña Genesis.

**«Trasladar».** Es «Llevar a Genesis» + «Quitar de Chats».

---

## 3. Modelo de datos y persistencia

### 3.1 Tipos (en `src/lib/chats-genesis/tipos.ts`, PURO, sin `node:*`)

```ts
export type NivelGenesis = "genesis" | "poligenesis" | "metagenesis";
export type Bandeja = "chats" | "genesis";
export type PuenteTelegram = "hermes-avisos" | "peticiones" | "avisos-directores";   // A, B, C de §1.5

/** De dónde sale un chat. Un chat de Astraura vive en Supabase; los de MetaGenesis, en la Mac (espejo en el A1). */
export type FuenteChat =
    | { tipo: "astraura"; convId: string }                       // aurora_conversations.id
    | { tipo: "direccion" }                                       // chat.jsonl fundido (vistas y filtros en la interfaz)
    | { tipo: "puente"; puente: PuenteTelegram }
    | { tipo: "telegram-sincronizado"; chatId: string };          // astraura_messages.chat_id con source telegram

export interface VinculoChat {
    v: 1;
    /** Determinista: «astraura:<convId>», «direccion», «puente:<puente>», «tg:<chatId>». */
    id: string;
    fuente: FuenteChat;
    nivel: NivelGenesis;
    /** Solo en poligenesis: id de os_pages/os_groups. */
    entidad?: string | null;
    en: Bandeja[];                 // al menos una; ["chats","genesis"] = en las dos
    titulo?: string;               // ≤ 120; si falta, el del origen
    creado: string; actualizado: string;   // ISO
}

export interface PrefsChatsGenesis {
    v: 1;
    vinculos: VinculoChat[];       // ≤ 500
    conexiones: {
        genesis?: { activo: boolean; memoria: boolean };
        poligenesis?: { activo: boolean; entidades: string[] };
        metagenesis?: { activo: boolean };
    };
}
```

### 3.2 Dónde se guarda

| Qué | Dónde | Por qué |
|---|---|---|
| Vínculos y conexiones de la cuenta | `user_settings.prefs.chatsGenesis` (`PrefsChatsGenesis`), con `mergeUserPrefs` (parche atómico; nunca se pisa el resto de `prefs`) | ya existe, por cuenta, sincroniza entre aparatos, una lectura al abrir; **sin migración SQL** |
| Copia rápida en el aparato | `localStorage["starseed.chats-genesis.v1"]` (solo comodidad; la verdad es `prefs`) | arrancar sin esperar a Supabase |
| Un chat de Astraura vinculado | además `aurora_conversations.meta.genesis = {nivel, entidad?, en}` | que la barra de Chats sepa sin leer `prefs` si lo esconde (`en` sin «chats») |
| Mensajes de los chats de dirección y puentes | la Mac (archivos de §1.4) y el **espejo** en la puerta del A1 (§5) | nunca en Supabase |
| Entradas escritas desde la web | tabla `genesis_entradas` de la puerta (SQLite del A1), 7 días | cola durable hasta que la Mac o el A1 la recojan |

### 3.3 Migración de lo guardado (regla: nada se pierde al actualizar)

- **Pestaña Telegram.** No guardaba nada propio (§1.1), así que no hay datos que mover. Se migran solo los **enlaces**: el alias
  `?tab=telegram` y `funciones-index`. El botón del dock y los accesos guardados con esa ruta siguen funcionando por el alias.
  Prueba: `normalizeTab("telegram") === "conexiones-chat"`.
- **`messaging_channels`.** No cambia: ni filas ni esquema. `normalizeChannels` sigue igual. Las opciones nuevas viven en `prefs`.
- **`prefs` sin `chatsGenesis`.** Se lee como `{v:1, vinculos:[], conexiones:{}}`.
  - **Primera escritura.** La primera vez que una cuenta miembro de MetaGenesis abre la pestaña, se escribe
    `conexiones.metagenesis = {activo: true}` (una sola escritura).
  - **Versiones futuras.** `migrarPrefsChatsGenesis(crudo): PrefsChatsGenesis` es **pura** y tiene pruebas. Pasa por ella
    cualquier versión vieja o malformada:
    - descarta lo que no entiende **pero lo conserva** en `prefs.chatsGenesisDescartado` (máx. 20 entradas, con fecha);
    - nunca devuelve `null`.
- **Filtros del chat de dirección.**
  - **Primera vez.** La pestaña Genesis **copia** `starseed.mando.director.filtros` a su clave propia, sin borrar la original.
  - **Si el chip ya no deja nada.** Si al abrir un chip guardado no deja nada, se dice y se quita con un toque. Es la misma regla
    que en `/genesis`.
- **`aurora_conversations.meta`.** Se añade `meta.genesis` con un parche que **lee y fusiona**, igual que `meta.config` en
  `conversations.ts:873-876`. Nunca sustituye `meta`.

---

## 4. Seguridad (lo que no puede quedar vago)

Estos chats pueden poner a un agente a ejecutar órdenes en la Mac de Alex. Para eso existen cuatro reglas:

- **Un camino, sin entrada a la Mac.** La única vía es **navegador → puerta del A1 → Mac**, y es la Mac la que va a buscar.
  - Ningún puerto de la Mac queda abierto.
  - La Mac no sirve nada por un túnel nuevo.
  - Ningún comando nativo de Tauri entra en el camino. Se mantiene §4.8 de `permisos-y-control-del-dispositivo.md`: la web no
    ejecuta nada en el aparato.
- **La interfaz no decide nada de seguridad.** Esconder un botón es comodidad, nunca protección.
- **Dos comprobaciones en el servidor, en dos sitios:** la puerta y la Mac.
- **Igual o más fuerte que Telegram.** «Lo mismo que desde los chats de Telegram» quiere decir **las mismas capacidades con una
  comprobación igual o más fuerte**, nunca más débil.

### 4.1 Cómo prueba la web quién es

- **Credencial.** La sesión de Supabase (JWT ES256) viaja en `Authorization: Bearer`, con `credentials: "omit"`, así que sin
  cookies. CORS se limita a los orígenes del OS, como ya hace la puerta.
- **La puerta verifica** (código existente de `jwt.mjs`):
  - firma con JWKS en local, `iss`, `aud=authenticated`, `exp` y `nbf` con 30 s de margen;
  - `HS256` y `none` se rechazan siempre.
- **Pertenencia y rol** (`supabase.mjs`, con el JWT de la persona):
  - `es_metagenesis` ya existe, en caché 10 min si es sí y 2 min si es no;
  - **nuevo** `es_metagenesis_dueno`, en caché **60 s**.
- **Lo que la puerta guarda en cada entrada.** El `sub` completo del JWT verificado (`cuenta`) y el `rol` que dio Supabase. El
  cuerpo **no** puede declarar ninguno de los dos: si los trae, la puerta los ignora.

### 4.2 Quién lee y quién escribe en cada clase de chat

| Clase de chat | Leer | Escribir texto | Poner a trabajar a un agente o cambiar algo |
|---|---|---|---|
| **MetaGenesis · Dirección** | `es_metagenesis` (dueño y desarrollador), lo mismo que hoy en `/metagenesis` | dueño y desarrollador, solo al canal `mando` (queda en el hilo, ningún agente lo atiende) | **solo dueño**: elegir un motor o canal que responde (`director-presidente`, `claude-cowork`, `claude-mac`, `hermes`, `chatgpt`, `antigravity`, `ide`, `terminal`, `telegram`), `responder`, `reenviar` |
| **Puente A · Hermes y avisos** | dueño | dueño | dueño: todas las órdenes |
| **Puente B · Peticiones y encargos** (A1) | dueño | dueño | dueño |
| **Puente C · Avisos de los directores** | dueño y desarrollador (solo lectura: es un canal de avisos) | — | — |
| **Genesis (mi cuenta)** | la cuenta (RLS `user_id = auth.uid()`) | la cuenta | el agente de Mi Genesis solo **propone** operaciones tipadas, con vista previa y dos toques (contrato de Genesis); nada de órdenes ni de código |
| **PoliGenesis** | rango ≥ 1 en la entidad (`os_entity_roles`) | rango ≥ 2 | según el modo: jerárquico con rango ≥ 3 aplica; democrático pasa a propuesta y votación (`decidirAplicacion`) |

**Más estricto que hoy.** Hoy, por el túnel, cualquier miembro puede pedir a `hermes` o a `claude-mac` desde `/metagenesis`
(INFERIDO del código de `guardian.ts` y `director-chat/route.ts`). El camino nuevo lo limita al dueño. Hay que ajustar el
túnel también (decisión D5; fuera de la fase 1).

### 4.3 Dónde se comprueba, en este orden

1. **La puerta** (`chats-genesis.mjs`):
   - sesión válida;
   - `es_metagenesis` para todo lo de MetaGenesis;
   - `es_metagenesis_dueno` para la última columna de §4.2 y para los puentes A y B;
   - lista blanca de acción, orden, canales y modelo (forma y longitud);
   - límites: 30 entradas por minuto y 300 al día por cuenta, cuerpo ≤ 16 KB y texto ≤ 8.000;
   - **nonce** único de 128 bits por cuenta: un nonce repetido devuelve 409.
2. **La Mac** (`genesis_chats_puerta.py`):
   - **Primera comprobación, la cuenta.** Comprueba **otra vez** la cuenta contra la lista local
     `~/.starseed/genesis-chats/cuentas.json` (`{"duenos": [uuid], "desarrolladores": [uuid]}`, permisos 600).
     - La lista la escribe **solo** Alex en la Mac, con `python3 scripts/puente/genesis_chats_puerta.py cuentas --dueno <uuid>`.
     - Sin la lista, **no se ejecuta nada**: la entrada queda `rechazada` con el motivo «falta la lista de cuentas en la Mac».
     - Un dueño de la puerta que no está en la lista local es solo lector.
     - Con esto, una fila de Supabase cambiada no basta para mover la Mac.
     - **Límite conocido (GEN1113INT).** Una puerta **comprometida** sí basta: la cuenta y el rol los pone la
       puerta y nada viene firmado desde el aparato, así que puede presentar entradas a nombre de un dueño que
       está en la lista. La lista local solo protege de una fila de Supabase cambiada y de un dueño que Alex no
       puso. Arreglo previsto (fuera de la fase 1): que cada aparato firme sus entradas con una clave propia no
       exportable que Alex da de alta en la Mac, y que la Mac verifique esa firma (§13).
   - **Lo demás.** Después revisa de nuevo la lista blanca, la caducidad (§4.5) y el nonce, que se guarda 7 días en
     `vistos.json`.
3. **El A1, para el puente B.** `peticiones_puerta.py` hace las mismas comprobaciones con su propia lista,
   `~/.starseed/peticiones/cuentas.json`.

### 4.4 Las órdenes de cada puente (cerradas)

| Puente | Órdenes | Cómo se ejecutan |
|---|---|---|
| A | `estado`, `olas [n]`, `cola`, `puertas`, `agentes`, `ayuda` (lectura); `aprobar <ids>`, `rechazar <ids>`, `soltar <ids>`, `reasignar <id> <modelo>`, `decir <texto>`, `a <agente> <texto>`; texto suelto = **mensaje a Hermes** | lectura: `GET http://127.0.0.1:9002/api/mando/estado` (petición local, como `telegram-puente.py`); órdenes: **las mismas funciones** `puente.orden` / `puente.decir` (`scripts/puente/puente.py:392`, `:128`), con `quien="genesis-web-<8 primeros de la cuenta>"`; el análisis es `parsear_orden` de `telegram-puente.py` importado (no copiado); texto suelto → `POST /api/mando/director-chat {accion:"decir", modelo:"hermes/predeterminado", canales:["hermes"]}` |
| B | `estado`, `ayuda`, `encargos`, `pausa`, `sigue`, `cancela`; texto suelto = petición o encargo. **Hoy (GEN1113INT) el bot del A1 solo tiene `estado` y `ayuda`**: las otras cuatro pasan la puerta pero el A1 las acusa `rechazado` («esa orden aún no existe en el bot del A1») y la pestaña no las ofrece (las nombra como «aún no disponibles»); el texto suelto es una petición (los encargos de varias horas no están conectados) | en el A1, las mismas funciones del bucle de `peticiones_telegram.py` (`por_reglas`, la cola durable), con el origen marcado `genesis` |
| C | ninguna (solo lectura) | — |
| Dirección | `decir`, `responder`, `reenviar` del contrato del chat de dirección | `POST http://127.0.0.1:9002/api/mando/director-chat` en local: **la misma ruta** que el compositor de `/genesis`, así que hereda canales, cartero, presidente y entregas sin reescribirlos |

**IDs y modelos.** Los ids de `aprobar`, `rechazar` y `soltar` se validan con `^[A-Za-z0-9_.-]{2,40}$`. El modelo de `reasignar`
se valida con `^[a-z0-9._/:-]{3,120}$`. Todo lo que no esté en esta tabla se rechaza con «orden no permitida».

### 4.5 Caducidad, registro y lo que se ve cuando falta acceso

- **Caducidad.**
  - Una **orden** que cambia algo (`aprobar`, `rechazar`, `soltar`, `reasignar`, `pausa`, `sigue`, `cancela` y las de dirección
    con motor) **caduca a los 30 min** de recibirse. Si la Mac la recoge más tarde, la marca `caducada` y la interfaz dice
    «Caducó sin ejecutarse (la Mac estaba apagada); vuelve a enviarla si aún la quieres».
  - Un **mensaje** de texto no caduca. Se entrega con «escrito hace N min».
- **Registro sin contenido.**
  - En la puerta: ruta, código, primeros 8 caracteres de la cuenta y ms. Ni texto ni IP: es la regla de la puerta.
  - En la Mac: `~/.starseed/genesis-chats/registro.jsonl`, solo-añadir, una línea por entrada con `t`, `id`, `cuenta8`, `rol`,
    `fuente`, `accion`, `orden` (el nombre, nunca los argumentos de texto), `resultado` (`hecho`, `rechazado`, `caducado` o
    `fallo`) y `motivo`.
  - Cada orden ejecutada se anuncia además en `canal.jsonl` por `puente.decir`, como ya hace `puente.orden`. Así la ven los
    directores y el propio Telegram.
- **Cuando falta acceso** (siempre lo dice el servidor; la interfaz solo traduce):
  - sin sesión → 401 → «Inicia sesión para ver los chats de Genesis»;
  - no miembro → 403 → no se pinta el grupo MetaGenesis, más la línea de §2.3;
  - desarrollador que intenta una orden → 403 `solo-dueno` → «Esta orden solo la puede dar un dueño de MetaGenesis», y el
    mensaje queda en el hilo como no enviado;
  - Mac sin la cuenta en su lista → acuse `rechazado` con su motivo, visible en el mensaje;
  - Supabase sin responder para el rol → 503 → «No se pudo comprobar tu permiso; no se envió nada». **Nunca** se deja pasar
    por error.
- **Revocación.** Quitar a alguien en Ajustes › Accesos tarda **como mucho 10 min** en notarse para leer y 60 s para las órdenes
  de dueño. Se dice en Ajustes y en este contrato.

---

## 5. Transporte sin Telegram, desde cualquier aparato

### 5.1 Comparación

| Opción | Supabase por mensaje | Latencia | Con la Mac apagada | Seguridad | Veredicto |
|---|---|---|---|---|---|
| Supabase (tablas + Realtime) | 1 escritura + eventos Realtime por mensaje y por aparato; el feed fundido son ~3.000 registros/día → miles de peticiones | < 1 s | guarda; nadie atiende | RLS conocida | **No**: es justo la cuota que Alex quiere proteger |
| Túnel rápido de Cloudflare a la Mac (lo de `/metagenesis`) | ≈ 0 (el guardián recuerda el token 60 s) | 10 s (sondeo del chat) | **nada**: ni leer ni escribir | abre un camino hacia la Mac; Cloudflare termina el TLS; la URL cambia | se queda como está para `/metagenesis`; no para esto |
| Malla entre aparatos | 0 | < 1 s | — | firmada (mesh-identity v2) | solo aparatos cercanos: no cumple «desde cualquier neurona» |
| Bus de la puerta tal cual (`/v1/bus/eventos`) | 0 | ≤ 1 s (espera larga) | guarda | **cualquier cuenta con sesión puede escribir** | no, sin una ruta propia |
| **Puerta del A1 con rutas propias de chats (elegida)** | **0 por mensaje**; solo el rol (≤ 1 RPC cada 10 min por aparato para leer, ≤ 1/min mientras se mandan órdenes) | **≈ 1–2 s** ida y vuelta de transporte (espera larga ≤ 25 s en los dos lados) + lo que tarde el modelo | **guarda y lo dice**; la copia del hilo sigue legible; el puente B (A1) **sigue atendiendo** | la Mac solo sale; JWKS en local; rol en la puerta y lista local en la Mac | **Sí** |

### 5.2 Cómo funciona

```
Aparato (web publicada, app nativa, móvil)                         A1 · puerta de datos (Caddy TLS, SQLite)
  GET  /v1/genesis/chats/feed?fuente=…&desde=&esperar=25  ───────►  genesis_espejo   ◄─── POST /espejo   (Mac: ficha genesis-mac)
  POST /v1/genesis/chats/entrada {nonce, …}               ───────►  genesis_entradas ───► GET /entrada?esperar=25 (Mac o A1 según destino)
  GET  /v1/genesis/chats/acuses?ids=                      ◄───────  genesis_acuses   ◄─── POST /acuse    (Mac o A1)
```

**En la Mac: `genesis_chats_puerta.py`, servicio `com.starseed.genesis-chats`.** Hace tres cosas.

- **Espejo hacia la puerta.**
  - **Cuándo lee.** Cada segundo mira el `mtime` de los cuatro archivos de §1.4 y solo lee cuando alguno cambió. Lee
    `GET http://127.0.0.1:9002/api/mando/director-chat?desde=<último t>`, que es la misma fusión, las mismas reglas y el mismo
    tope de 256 KB.
  - **Qué sube.** Sube los registros nuevos **tachados otra vez** con `director_chat.tachar`, en lotes de ≤ 200, a
    `POST /v1/genesis/chats/espejo` con `fuente: "direccion"`.
  - **Puentes A y C.** Lo que `telegram-puente.py` mandaría (`_importa`, sin repetidos) se marca `fuente: "puente:hermes-avisos"`.
    Los avisos que los directores dejan en el feed (`tipo` `aviso` o `informe`, con `rolDeDirector` protector, restaurador o
    supervisor) se marcan `fuente: "puente:avisos-directores"`.
    - **Límite de la fase 1.** Lo que los seis scripts del bot C (§1.5) mandan **solo** a Telegram, sin pasar por el canal, no se
      ve hasta que pasen por un ayudante común (fase 1b, §6).
  - **Latido.** Escribe un latido del espejo cada 30 s, aunque no haya novedades.
- **Entradas desde la puerta.** Pide `GET /v1/genesis/chats/entrada?destino=mac&esperar=25`, como un `getUpdates`. Comprueba (§4.3),
  ejecuta (§4.4) y acusa con `POST /acuse`: `entregado` → `hecho` | `rechazado` | `caducado` | `fallo`, con un `detalle` ≤ 300
  caracteres sin rutas.
- **Ritmo.** Sin conexión, reintenta con 2 s → 5 → 15 → 60 s (techo). Nunca pierde una entrada: el acuse se manda solo después
  de ejecutar y anotar en `vistos.json`.

**En el A1: `peticiones_puerta.py`** (puente B). Hace el mismo bucle con `destino=a1`. Mete las entradas en la cola durable de
`peticiones_telegram.py` y sube sus respuestas como espejo `fuente: "puente:peticiones"`.

- **Respuestas.** Solo el texto de la respuesta y los nombres o enlaces de Drive de los entregables. Los archivos no viajan.
- **Copia en Telegram.** Las respuestas a lo que se pidió desde Genesis **no** se copian a Telegram, salvo que Alex lo active
  (decisión D6).

**Retención en la puerta:**

- espejo: 30 días o 60.000 registros;
- entradas y acuses: 7 días.

Todo es SQLite del A1, que se dimensionó para 200.000 filas de bus.

**Volumen.** Hoy son unos 3.000 registros al día, unos 2–3 MB al día.

### 5.3 Lo que se ve según el estado

| Estado (medido, nunca supuesto) | Qué dice la cabecera del hilo |
|---|---|
| último latido del espejo ≤ 90 s | «En vivo desde la Mac · copia de hace N s» |
| latido > 90 s | «La Mac no responde desde HH:MM (hace N min). Ves la última copia. Lo que escribas espera en la puerta del A1; las órdenes caducan a los 30 min» |
| la puerta no responde | «La puerta de datos del A1 no responde desde HH:MM. Desde aquí no se pueden leer ni escribir los chats de dirección; en la Mac siguen en /genesis». **No** hay respaldo a Supabase ni al túnel (decisión D4) |
| entrada en cola | en el mensaje: «En la puerta del A1 · esperando a la Mac desde HH:MM» |
| entrada hecha | estado de entrega del chat de dirección, igual que en `/genesis` |

---

## 6. Fases

### Fase 1 · GEN1113: la prueba de Alex

**Objetivo.** Desde cualquier aparato donde Alex use su cuenta, en Astraura › Chat › **Genesis**:

- el chat de dirección de MetaGenesis con sus seis vistas y todos sus filtros;
- los tres puentes de Telegram con sus órdenes.

Todo ello sin Telegram, con la seguridad de §4 y el transporte de §5. Además, el título y las pestañas de §2.1 y la opción
Telegram dentro de Conexiones de chat (§2.2). Paquetes en §9.

**Comprobaciones que puede hacer una persona.** El conjunto se da por bueno cuando pasan **todas**.

1. En el móvil, **fuera** del Wi-Fi de la Mac, con la cuenta de Alex: `/agent`.
   - La cabecera dice «Astraura IA y Orquestación».
   - La sección de chat tiene Chats · Multiagente 1.58 · Conexiones de chat · Genesis, y no hay ninguna pestaña Telegram.
2. Al abrir `/agent?tab=telegram` aparece Conexiones de chat con la opción Telegram abierta: bot, «Conectar mi cuenta», los siete
   canales y los chats sincronizados, igual que antes.
3. **Genesis › MetaGenesis › Dirección › Todo.** Los últimos 20 mensajes son los mismos (autor, hora y texto) que en `/genesis` de la Mac
   en ese momento.
   - En cada una de las seis vistas, el número de mensajes y los chips que se ofrecen coinciden con `/genesis`.
4. Escribir «Prueba GEN1113 desde el móvil» al Director presidente.
   - Antes de 5 s aparece en `/genesis` de la Mac, con autor Alex y la marca «vía Genesis en Astraura».
   - La respuesta del presidente llega al móvil antes de 10 s después de publicarse en la Mac.
5. En **Puentes › Hermes y avisos**, escribir `/estado`. La respuesta trae las mismas cuentas que el mismo `/estado` en Telegram
   (si la escucha está activa) o que el resumen del pulso de Genesis.
6. Con una cuenta **desarrollador** de prueba, `/aprobar X`: se rechaza con «Esta orden solo la puede dar un dueño de MetaGenesis».
   - El registro de la Mac (`registro.jsonl`) tiene la línea `rechazado`.
   - El archivo `control-<cola>.json` no cambia.
7. Con la cuenta de Alex, `/aprobar <id que espera>`:
   - el vigilante la recoge en menos de 20 s;
   - `canal.jsonl` la anuncia como `genesis-web-…`;
   - el acuse dice «hecho».
8. **Mac con la tapa cerrada** (sin red) y desde el móvil:
   - la cabecera dice «La Mac no responde desde…» y el hilo sigue legible;
   - un mensaje enviado queda «En la puerta del A1 · esperando a la Mac»;
   - al abrir la tapa se entrega y su estado cambia solo.
   - Una orden de `/aprobar` enviada con la Mac apagada más de 30 min queda «caducada» y **no** se ejecuta.
9. **Puentes › Peticiones y encargos, con la Mac apagada.** `/estado` lo contesta el A1 antes de 30 s.
10. Una cuenta sin acceso no ve el grupo MetaGenesis. Con su token, `curl` a `/v1/genesis/chats/feed` devuelve 403.
11. Telegram sigue funcionando igual en los tres bots (nada de este trabajo lo apaga).
12. Capturas a 360×640 y a 1440×900 de cada pantalla nueva:
    - nada cortado;
    - el hilo y el cuadro de texto siempre visibles, también con el teclado abierto;
    - las listas de muchas opciones a pantalla completa.
13. Supabase: el consumo del día con una pestaña de Genesis abierta 30 min no sube más de 10 peticiones por encima de la misma
    pestaña sin esta función (lo mide `.transfer/pda1011/medir_rutas.py` o los registros del proyecto).

**Fase 1b.** Es pequeña y va después.

- **Ayudante común `aviso_telegram()`.** Los seis scripts del bot C pasan por él, y así sus avisos también llegan al espejo.
- **El túnel por rol (D5).** El túnel de `/metagenesis` también pide «dueño» para los motores.

### Fase 2 · Chats de Genesis y PoliGenesis con Astraura y la Protomolécula como bots con personalidad

- **Cómo se guarda un chat.** Va en `aurora_conversations` con `kind = "genesis"` y
  `meta.genesis = {nivel, entidad?, bot: {base: "astraura" | "protomolecula", personalidad, contexto, automatizaciones}}`.
  - **Personalidades.** Las de `src/lib/astraura-bots/personalidad-adaptable.ts` y `directiva-bot.ts`
    (`architecture/astraura-bots.md`).
  - **Creaciones.** Pasan por ProtoGenesis (`architecture/protogenesis.md`).
- **Qué hacen los bots.** Proponen **operaciones tipadas** (`src/lib/genesis/operaciones.ts`), nunca órdenes en una máquina.
  - Las tareas programadas usan el mismo modelo de propuesta, confirmación y deshacer.
  - En PoliGenesis, los permisos los da el rango y el modo de gobernanza (§4.2).
- **«Versiones de Genesis personales y grupales, privadas y públicas».** Son filtros de la columna izquierda: Mías · Grupales ·
  Privadas · Públicas.
  - Una versión pública se publica como **variación pública** (`architecture/variaciones-publicas.md`).
- **Comprobación.** Crear un bot «Revisor de mi perfil» en Genesis, hacer que proponga un cambio, aplicarlo y deshacerlo. En un
  grupo democrático, el mismo cambio sale como propuesta para votar.

### Fase 3 · Compartir y sincronizar entre servidores y personas

- **Invitar.** Se invita a personas a un chat de Genesis o PoliGenesis con roles: lector, escritor o gestor.
- **Servidores propios.** Otros servidores, como el A1 o un servidor comunitario, se sincronizan con la **misma** puerta (otra
  instancia de `servicios/puerta-datos`) por réplica firmada:
  - sobre mesh-identity v2 con anti-reenvío (`architecture/seguridad-transporte.md`);
  - lo privado no sale nunca de su servidor sin una concesión.
- **Comprobación.** Dos cuentas en dos servidores ven el mismo hilo y una revocación corta el acceso en ≤ 10 min.

### Fase 4 · Detección automática de los chats de los IDE, en local

- **El detector.** Un detector local en cada neurona: Python en la Mac al principio y después Rust en la app nativa.
  - **Lo que mira.** Solo **la presencia y los metadatos** de los almacenes conocidos: Claude Code, Codex, Hermes, Antigravity y
    Cursor (más los que se añadan a una lista declarativa).
  - **Lo que anota.** Qué IDE está, cuántas sesiones tiene, la última actividad, el nombre del proyecto, los servidores MCP
    configurados y los nombres de las habilidades.
  - **Lo que no hace.** **Nunca abre el contenido** de una conversación.
- **Lo que sale de la máquina.** Solo esos metadatos, y solo hacia las neuronas de la **misma cuenta** (la puerta, solo para el
  dueño).
- **Lo que se ofrece.** El detector sugiere vincular: instalar el MCP `starseed-director` en ese IDE (ya existe
  `instalar_director.py`, que enseña el cambio y aplica con `--aplicar` después de una confirmación) y crear su chat en Genesis.
- **El contenido.** Una conversación de un IDE solo entra en Genesis por:
  - (a) lo que el propio IDE publica por el MCP, como hoy;
  - (b) **compartir** ese chat, una acción explícita de Alex en esa máquina (diálogo local, no un botón remoto).

  Después se espeja tachado, como la dirección.
- **Comprobación.** En la Mac aparecen los IDE detectados con sus metadatos. Los paquetes de la puerta no contienen texto de
  ninguna conversación (prueba con un almacén de mentira que contiene la cadena «SECRETO-IDE» y comprobación de que no sale).

---

## 7. Interfaces (obligatorias para todos los paquetes)

### 7.1 Rutas nuevas de la puerta (`servicios/puerta-datos/src/chats-genesis.mjs`)

**Ámbitos de ficha nuevos** en `AMBITOS` (`fichas.mjs`):

- `genesis-mac`: la Mac puede leer las entradas con `destino=mac` y escribir el espejo;
- `genesis-a1`: lo mismo con `destino=a1`.

**Fuentes válidas:** `direccion`, `puente:hermes-avisos`, `puente:peticiones` y `puente:avisos-directores`. Cuál puede escribir
cada ficha en el espejo:

- la ficha `genesis-mac`: todas menos `puente:peticiones`;
- la ficha `genesis-a1`: solo `puente:peticiones`.

| Método y ruta | Quién | Cuerpo / consulta | Respuesta |
|---|---|---|---|
| `POST /v1/genesis/chats/espejo` | ficha `genesis-mac` o `genesis-a1` | `{fuente, registros: RegistroEspejo[] (≤ 200), latido?: true}` | `{ok, n, cursor}` |
| `GET /v1/genesis/chats/feed` | sesión + `es_metagenesis`; `puente:*` salvo `avisos-directores` exige dueño | `?fuente=&desde=<cursor>&limite=≤500&esperar=≤25` | `{registros: RegistroEspejo[], cursor, latido: {t, de: "mac"\|"a1"} \| null}` |
| `POST /v1/genesis/chats/entrada` | sesión + reglas de §4.2 | `EntradaChat` | `201 {id, destino, estado: "en-cola"}` · 400 forma · 403 `{error, codigo: "no-miembro"\|"solo-dueno"}` · 409 nonce repetido · 429 límite · 503 rol sin comprobar |
| `GET /v1/genesis/chats/entrada` | ficha del destino | `?destino=mac\|a1&desde=<id>&esperar=≤25` | `{entradas: EntradaRecibida[]}` |
| `POST /v1/genesis/chats/acuse` | ficha del destino | `{id, estado: "entregado"\|"hecho"\|"rechazado"\|"caducado"\|"fallo", detalle?: string ≤ 300}` | `{ok}` |
| `GET /v1/genesis/chats/acuses` | sesión: **solo las entradas de esa cuenta** | `?ids=<≤50 ids>` | `{acuses: {id, estado, detalle?, t}[]}` |

**Tipos de la puerta:**

```ts
/** Lo que guarda el espejo: un MensajeDirector ya tachado (mismos campos que chat-director-tipos.ts) + su fuente. */
interface RegistroEspejo extends MensajeDirector { fuente: string; cursor?: number; entregas?: Record<string, { estado: string; detalle?: string }>; origen?: "genesis-web" }

interface EntradaChat {
    v: 1;
    nonce: string;                                   // ^[A-Za-z0-9_-]{22,32}$ (≥128 bits)
    t: string;                                       // ISO del aparato (informativo)
    fuente: "direccion" | "puente:hermes-avisos" | "puente:peticiones";
    accion: "decir" | "responder" | "reenviar" | "orden" | "texto";
    texto?: string;                                  // ≤ 8000
    modelo?: string;                                 // ^[a-z0-9._/:-]{3,120}$ ; solo en dirección
    canales?: CanalId[];                             // ⊂ CANALES ; solo en dirección
    respondeA?: string; reenviar?: string;           // ^md-\d{10,16}-[0-9a-f]{4}$
    orden?: { nombre: string; args: string[] };      // nombre ∈ §4.4 de su fuente; ≤ 10 args de ≤ 120
    // (GEN1113INT) `decir` lleva args: [] y su texto en `texto`; `a` lleva args: [<agente>] y su texto en `texto`;
    // las demás órdenes no llevan `texto`. `responder` no lleva texto; `reenviar` necesita ≥ 1 canal.
}
/** Lo que entrega la puerta al destino: lo de arriba + lo que solo pone la puerta. */
interface EntradaRecibida extends EntradaChat { id: number; cuenta: string; rol: "dueño" | "desarrollador"; destino: "mac" | "a1"; recibido: string }
```

**Destinos:** `fuente = puente:peticiones` va a `a1`; todo lo demás va a `mac`.

### 7.2 Cliente web (`src/lib/chats-genesis/puerta-chats.ts`)

```ts
export interface ClienteChatsGenesis {
    feed(f: { fuente: string; desde?: number; esperar?: number; limite?: number }, senal?: AbortSignal):
        Promise<{ ok: true; registros: RegistroEspejo[]; cursor: number; latido: { t: string; de: "mac" | "a1" } | null }
              | { ok: false; estado: 401 | 403 | 503 | 0; error: string }>;
    enviar(e: Omit<EntradaChat, "v" | "nonce" | "t">):
        Promise<{ ok: true; id: number } | { ok: false; estado: number; codigo?: string; error: string }>;
    acuses(ids: number[]): Promise<Record<number, { estado: string; detalle?: string; t: string }>>;
}
export function crearClienteChatsGenesis(op?: { puerta?: PuertaA1; fetch?: FetchLike; ahora?: () => number }): ClienteChatsGenesis;
export function estadoEspejo(latido: { t: string } | null, ahora: number): { vivo: boolean; haceMs: number | null };   // vivo ≤ 90 s
```

**Cómo habla con la puerta:**

- usa `puertaA1().operar({conSesion: true, …})` para `feed` y `acuses`, con `timeoutMs ≥ 30000` para la espera larga;
- **`enviar` NO usa la cola local de `operar`**, que encola los POST cuando la puerta falla (`puerta-a1.ts:241-245`): hace la
  petición directa con la URL y la sesión del mismo adaptador;
- si falla, devuelve `ok:false`, y la interfaz deja el borrador y dice que no se envió.

### 7.3 Vínculos (`src/lib/chats-genesis/vinculos.ts`, PURO salvo el adaptador final)

```ts
export function migrarPrefsChatsGenesis(crudo: unknown): { prefs: PrefsChatsGenesis; descartado: unknown[] };
export function idDeVinculo(f: FuenteChat): string;
export function vincular(p: PrefsChatsGenesis, v: Omit<VinculoChat, "v" | "id" | "creado" | "actualizado">, ahora: string): PrefsChatsGenesis;
export function cambiarBandejas(p: PrefsChatsGenesis, id: string, en: Bandeja[], ahora: string): PrefsChatsGenesis; // en vacío ⇒ quita el vínculo
export function chatsEn(p: PrefsChatsGenesis, b: Bandeja, nivel?: NivelGenesis, entidad?: string): VinculoChat[];
// adaptador (no puro):
export async function leerPrefsChatsGenesis(): Promise<PrefsChatsGenesis>;           // user_settings.prefs + copia local
export async function guardarPrefsChatsGenesis(p: PrefsChatsGenesis): Promise<void>;  // mergeUserPrefs({ chatsGenesis: p })
export async function marcarConversacionGenesis(convId: string, g: { nivel: NivelGenesis; entidad?: string | null; en: Bandeja[] } | null): Promise<void>; // lee-fusiona meta
```

### 7.4 Componentes (props exactas)

```ts
// src/components/chats-genesis/pestana-genesis.tsx
export function PestanaGenesis(props: { cliente?: ClienteChatsGenesis }): JSX.Element;
// src/components/chats-genesis/hilo-direccion.tsx — usa SOLO lógica pura de chat-director-feed.ts y chat-director-tipos.ts
export function HiloDireccion(props: { cliente: ClienteChatsGenesis; esDueno: boolean }): JSX.Element;
// src/components/chats-genesis/hilo-puente.tsx
export function HiloPuente(props: { cliente: ClienteChatsGenesis; puente: PuenteTelegram; esDueno: boolean }): JSX.Element;
// src/components/messaging/chat-connections-panel.tsx (cambia la firma, compatible)
export interface ChatConnectionsPanelProps { className?: string; foco?: "telegram" | "genesis" | "poligenesis" | "metagenesis" }
```

### 7.5 Mac (`scripts/puente/genesis_chats_logica.py`, PURO)

```python
FUENTES = ("direccion", "puente:hermes-avisos", "puente:peticiones", "puente:avisos-directores")
ORDENES_A = {"estado", "olas", "cola", "puertas", "agentes", "ayuda", "aprobar", "rechazar", "soltar", "reasignar", "decir", "a"}
CAMBIAN = {"aprobar", "rechazar", "soltar", "reasignar"}            # + dirección con motor
CADUCIDAD_S = 1800
def validar_entrada(e: dict, cuentas: dict, ahora: float, vistos: dict) -> tuple[bool, str]   # (ok, motivo)
def plan_de_entrada(e: dict) -> dict      # {"tipo": "http-local"|"puente-orden"|"puente-decir", ...} sin efectos
def fuente_de_registro(r: dict) -> list[str]                          # a qué fuentes del espejo va un registro del feed
def linea_registro(e: dict, resultado: str, motivo: str, t: str) -> dict   # sin texto ni args de texto
```

---

## 8. Texto visible, verdad y pantallas pequeñas

- **Idioma y nombres.**
  - Todo el texto visible va en español neutro.
  - `src/lib/__tests__/nombre-genesis.test.ts` rechaza «Mando», «Puente de Mando» y «Centro de Mando» en cualquier texto o
    comentario de `src/`. Por eso los puentes se llaman **«Puentes de Telegram»**, aunque Alex diga «puentes de mando», y los
    identificadores (`mando`, `/api/mando`) no se cambian.
  - Nombres propuestos: «Astraura IA y Orquestación», «Genesis», «Chats de Genesis», «Agentes de Genesis», «Agentes de
    PoliGenesis», «Agentes de MetaGenesis», «Dirección», «Hermes y avisos», «Peticiones y encargos», «Avisos de los
    directores».
- **Nada que no sea verdad** («basta de ilusiones»):
  - «En vivo» solo con un latido del espejo de ≤ 90 s;
  - una orden aparece como «hecha» solo con el acuse `hecho` de la Mac o del A1;
  - un vacío dice qué falta y desde cuándo, por ejemplo: «Sin copia de la Mac desde el 13-11 a las 02:10», «Sin chats
    vinculados todavía», «Tu cuenta no tiene acceso a MetaGenesis».
- **Pantallas pequeñas:**
  - en < lg, la columna de chats es un botón con el chat actual que abre la lista completa (`MenuListaMovil`);
  - las vistas (6) y los chips de filtro también se eligen en lista completa cuando no caben en una línea; nunca hay una tira que
    se corte;
  - el hilo es `flex-1 min-h-0` con su propio scroll y el compositor queda fijo abajo con `env(safe-area-inset-bottom)`;
  - con el teclado abierto, el cuadro de texto y el último mensaje siguen visibles;
  - los botones «Responder con» y «Enviar a» de cada mensaje pasan a un menú «⋯» en < sm.
- **Una función nueva que falla se arregla.** No se apaga por defecto.

---

## 9. Paquetes de la fase 1 (en paralelo, sin archivos compartidos)

**Reglas comunes.** Son las de `claude/reglas-comunes-agentes-1112.md`:

- se trabaja en la nube y se entrega una rama en la Mac;
- nunca `push`, ni migraciones, ni `next build` en la Mac, ni imprimir claves, IP o URL de túneles;
- los módulos tienen ≤ 120 líneas cuando sea posible y pruebas sin red.

**Cómo se coordinan.** Cada paquete lee este contrato entero. Si dos paquetes necesitan algo del otro, usan las interfaces de §7
**tal cual** y lo prueban con una versión falsa.

### GEN1113A · Rutas de chats en la puerta de datos del A1 — **modelo más fuerte**

**Archivos propios:**

- `servicios/puerta-datos/src/chats-genesis.mjs` (nuevo);
- `servicios/puerta-datos/test/chats-genesis.test.mjs` (nuevo);
- `servicios/puerta-datos/src/servidor.mjs`: solo un bloque añadido `// GEN1113A` que registra las rutas;
- `servicios/puerta-datos/src/fichas.mjs`: `AMBITOS` + `genesis-mac` y `genesis-a1`;
- `servicios/puerta-datos/src/supabase.mjs`: `esMetagenesisDueno(cuenta, jwt)` con caché de 60 s, calcado de `esMetagenesis`;
- `architecture/puerta-datos-a1.md`: filas nuevas en §4.1 y §4.2.

**Solo lectura:** `servicios/puerta-datos/src/{jwt,bus,almacen,config}.mjs`.

**Interfaces:** §7.1 completo, las reglas de §4.2 y §4.3.1, y la retención de §5.2.

**Pruebas:**

- sin sesión da 401; una cuenta no miembro, 403 `no-miembro`;
- un desarrollador puede enviar `decir` a `mando` (201), pero `decir` con `canales:["hermes"]` le da 403 `solo-dueno` y una
  `orden aprobar`, 403;
- un nonce repetido da 409;
- `cuenta` y `rol` del cuerpo se ignoran;
- la ficha `genesis-a1` no lee `destino=mac` ni escribe `fuente=direccion`;
- la espera larga responde al llegar una entrada;
- se poda la retención;
- con el RPC de rol caído, 503;
- los registros no guardan texto.

**Comprobación:** `node --test servicios/puerta-datos/test/` en verde, más una lectura de `curl` contra una puerta local de
prueba con fichas de mentira. El despliegue en el A1 lo hace la dirección, no el paquete.

### GEN1113B · Puente de la Mac (`genesis_chats_puerta.py`) — **modelo más fuerte**

**Archivos propios:**

- `scripts/puente/genesis_chats_logica.py`, `scripts/puente/genesis_chats_puerta.py`;
- `scripts/puente/test_genesis_chats_logica.py`, `scripts/puente/test_genesis_chats_puerta.py`;
- `scripts/puente/com.starseed.genesis-chats.plist`;
- `scripts/puente/instalar-servicios.py`: solo la entrada `genesis-chats`, en un bloque `# GEN1113B`.

**Solo lectura** (se importan por ruta, como hace `telegram-puente.py` con `puente.py`): `telegram-puente.py` (`parsear_orden`,
`_importa`), `puente.py` (`orden`, `decir`), `director_chat.py` (`tachar`), `puerta_datos_cliente.py` (`leer_env`, `_http`,
`tachar`).

**Interfaces:** §7.1, como cliente con la ficha `genesis-mac` (la variable `STARSEED_PUERTA_FICHA_GENESIS_MAC` en
`~/.starseed/env`; solo el nombre); §7.5; §4.3.2, §4.4 y §4.5; §5.2.

**Pruebas sin red, con relojes y puertas falsos:**

- una entrada sin lista de cuentas no ejecuta nada;
- un desarrollador con `aprobar` → `rechazado`;
- un dueño con `aprobar` llama a `puente.orden` con `quien` `genesis-web-xxxxxxxx`;
- una orden de 31 min → `caducado`;
- un nonce visto → ignorado;
- el texto suelto del puente A → `POST` local a `director-chat` con `hermes/predeterminado`;
- el espejo solo lee si cambió un `mtime`;
- el espejo tacha `sk-…` y JWT;
- el registro no contiene texto;
- el plist apunta a `python3` de Homebrew.

**Comprobación:** las pruebas en verde. En la Mac, `python3 scripts/puente/genesis_chats_puerta.py --estado` dice qué ve
(espejo, entradas pendientes y última entrega) sin URL ni claves.

### GEN1113C · Cliente web, vínculos y migración — **modelo fuerte**

**Archivos propios:**

- `src/lib/chats-genesis/tipos.ts`, `puerta-chats.ts`, `vinculos.ts` y `estado-espejo.ts`;
- `src/lib/chats-genesis/__tests__/*.test.ts`.

**Solo lectura:** `src/lib/datos/puerta-a1.ts` y `puerta-a1-tipos.ts`, `src/lib/sync/user-prefs.ts`,
`src/lib/aurora/conversations.ts`, `src/lib/mando/chat-director-tipos.ts` y `src/lib/metagenesis/accesos.ts`.

**Interfaces:** §3.1, §7.1 (como consumidor), §7.2 y §7.3.

**Pruebas:**

- `migrarPrefsChatsGenesis` con `undefined`, `{}`, una versión rota y una futura (no se pierde nada: va a `descartado`);
- un vínculo en las dos bandejas, y quitar una bandeja;
- el id del vínculo es determinista;
- `enviar` nunca encola en local cuando la puerta falla;
- `feed` respeta `esperar` y aborta;
- `estadoEspejo` en el límite de 90 s;
- ningún `node:*` en el grafo del navegador.

**Comprobación:** vitest y tsc limitado en verde.

### GEN1113D · Pestaña «Genesis» — modelo estándar

**Archivos propios:**

- `src/components/chats-genesis/pestana-genesis.tsx`, `hilo-direccion.tsx`, `hilo-puente.tsx`, `lista-chats-genesis.tsx` y
  `cabecera-espejo.tsx`;
- `src/components/chats-genesis/__tests__/*`.

**Solo lectura:**

- `src/lib/mando/chat-director-feed.ts` y `chat-director-tipos.ts`, de los que importa **solo** funciones puras;
- `src/components/mando/chat-director*.tsx` y `selector-canales.tsx`, como referencia visual: puede importar
  `SelectorCanales` si no hace `fetch`; si lo hace, se copia la forma, no la llamada;
- `src/components/ui/menu-lista-movil*`, `src/lib/metagenesis/accesos.ts`, `src/lib/genesis/entidades.ts`;
- `src/lib/chats-genesis/*` (de GEN1113C; mientras no esté, usa una versión falsa con las firmas de §7.2 y §7.3).

**Interfaces:** §7.4 (los tres primeros), §2.3, §5.3 y §8.

**Pruebas (jsdom):**

- un miembro dueño ve las seis vistas y los chips que dan `opcionesDeFiltro` sobre un feed de ejemplo;
- un desarrollador no ve el compositor de motores ni los puentes A y B;
- un no miembro no ve el grupo MetaGenesis;
- con el latido viejo, el aviso de Mac apagada;
- una entrada en cola muestra «En la puerta del A1»;
- `403 solo-dueno` deja el borrador con su motivo;
- ningún texto contiene «Mando».

**Comprobación:** capturas reales a 360×640 y a 1440×900, con datos y vacías, revisadas a ojo.

### GEN1113E · Página `/agent` y Conexiones de chat — modelo estándar

**Archivos propios:**

- `src/app/(app)/agent/page.tsx`: título, ítems de la sección `chat`, alias, `TabsContent` de `chats-genesis` y el paso de `foco`;
- `src/components/messaging/chat-connections-panel.tsx`;
- `src/components/messaging/conexion-telegram.tsx` (nuevo: monta `TelegramSpacesPanel` más los interruptores de bandeja y la
  lista de puentes);
- `src/components/messaging/conexiones-genesis.tsx` (nuevo: las tres tarjetas de §2.2);
- `src/components/funciones/funciones-index.tsx`;
- `src/components/agent/chat-neural-sidebar.tsx`: «Llevar a Genesis…», la carpeta «Genesis» y ocultar los que tienen `en` sin
  «chats»;
- sus pruebas.

**Solo lectura:** `src/components/exocortex/telegram-spaces-panel.tsx` (se monta sin cambios), `src/lib/messaging/*` y
`src/lib/chats-genesis/*` (versión falsa hasta que llegue GEN1113C).

**Pruebas:**

- `normalizeTab("telegram") === "conexiones-chat"`;
- `normalizeTab("genesis") === "genesis-seres"`, que no cambia;
- `normalizeTab("chats-genesis") === "chats-genesis"`;
- no queda ningún ítem `telegram` en la sección;
- el título en español;
- el panel con `foco="telegram"` abre la opción;
- las opciones de MetaGenesis solo aparecen con acceso;
- el menú del chat crea el vínculo y no borra nada;
- `nombre-genesis.test.ts` en verde.

**Comprobación:** las comprobaciones 1 y 2 de §6 en un arnés con el componente real.

### GEN1113F · Peticiones del A1 por la puerta — modelo estándar (con revisión del fuerte)

**Archivos propios:**

- `scripts/puente/peticiones_puerta.py` y `scripts/puente/test_peticiones_puerta.py`;
- `scripts/puente/peticiones_telegram.py`: solo un bloque `# GEN1113F` que arranca el hilo de la puerta si está
  `STARSEED_PUERTA_FICHA_GENESIS_A1` y pasa al trabajador las entradas con origen `genesis`, más un gancho de respuesta que,
  para ese origen, sube el espejo en lugar de mandar a Telegram;
- `deploy/oracle/nodo/systemd/starseed-peticiones-telegram.service`: solo `Environment`, si hace falta.

**Solo lectura:** `peticiones_reglas.py` y `peticiones_notebooklm.py`, `puerta_datos_cliente.py` y la referencia de
`architecture/peticiones-telegram-a1-referencia/`.

**Interfaces:** §7.1 (ficha `genesis-a1`) y §4.3.3, con la lista `~/.starseed/peticiones/cuentas.json`; §4.4, fila B.

**Pruebas:**

- una entrada de dueño entra en la cola durable con origen `genesis`;
- una cuenta fuera de la lista → `rechazado`;
- `/estado` contesta al espejo y no a Telegram;
- sin ficha, el bot sigue como hoy;
- el *offset* de Telegram no cambia.

**Comprobación:** la comprobación 9 de §6, cuando la dirección despliegue en el A1.

**Orden de integración:** A → C → B y F → D y E (las interfaces dejan construir los seis a la vez).

---

## 10. Límites y honestidad (después de la fase 1)

**Será real:**

- el título y las pestañas;
- Telegram dentro de Conexiones de chat, sin perder nada;
- las tres opciones de agentes;
- la pestaña Genesis con la dirección de MetaGenesis completa (seis vistas y filtros) desde cualquier aparato de la cuenta;
- escribir al presidente y a cada director con el rol de dueño;
- las órdenes del puente A y del puente B sin Telegram;
- la cola en el A1 con la Mac apagada;
- la caducidad de las órdenes;
- el registro;
- los vínculos entre Chats y Genesis para los chats de Astraura y de MetaGenesis.

**No será real todavía** (y la interfaz lo dice donde toque):

- **El historial de Hermes en Telegram.** No se espeja: vive en las sesiones de Hermes, que no se leen. Desde Genesis, el texto
  suelto del puente A habla con Hermes en **su sesión de dirección** (la del cartero), no en la de Telegram.
- **Los avisos que van solo al bot C.** Los de los scripts que no pasan por el canal (fase 1b).
- **`@starseed_nexus_bot`.** Su servidor no está en el repo.
- **Bots con personalidad, versiones públicas, compartir entre servidores y detección de IDE.** Son las fases 2 a 4.
- **Adjuntos, voz y avisos al móvil** desde la pestaña Genesis.
- **El túnel de `/metagenesis`.** Sigue permitiendo que cualquier miembro despierte motores hasta la fase 1b.
- **Revocar un acceso** tarda hasta 10 min en cortar la lectura.

---

## 11. Decisiones tomadas (Alex puede cambiarlas; entre paréntesis, la que se aplica)

- **D1.** Los «3 chats vinculados» son los bots A (Hermes), B (síntesis/peticiones) y C (avisos de los directores) de §1.5
  (*no* `@starseed_nexus_bot`).
- **D2.** `?tab=genesis` sigue llevando a «Génesis de Seres». La pestaña nueva es `?tab=chats-genesis`.
- **D3.** Las opciones nuevas de Conexiones de chat se guardan en `user_settings.prefs`, no en `messaging_channels`. Así no hay
  migración SQL.
- **D4.** Si la puerta del A1 cae, no hay respaldo por Supabase ni por el túnel: se dice y se sigue en `/genesis` de la Mac.
- **D5.** Solo el rol **dueño** pone a trabajar a un agente o da órdenes. El desarrollador lee la dirección y escribe solo al hilo
  (`mando`). El túnel se igualará en la fase 1b.
- **D6.** Lo pedido al puente B desde Genesis se contesta solo en Genesis, sin copia a Telegram.
- **D7.** Una orden que cambia algo caduca a los 30 min. Un mensaje no caduca.
- **D8.** La lista local de cuentas de la Mac (y la del A1) es obligatoria. Sin ella, nada se ejecuta.
- **D9.** Fase 4: los IDE solo comparten metadatos solos. El contenido de una conversación sale de su máquina únicamente si Alex
  la comparte en esa máquina.

---

## 12. Lo que no se pudo determinar (y cómo se resuelve)

> Ver también §13: lo que el código hace de verdad tras la integración (GEN1113INT).

- **El tercer chat (D1).** Hay tres bots, pero el código no dice cuál es el «tercer chat» de Alex. **Resuelto:** Alex confirmó
  que los tres chats son los bots A, B y C (D1 se queda).
- **La lista de usuarios de Hermes.** No se leyó la configuración del gateway de Hermes (regla: no leer sus almacenes). La
  autorización de Telegram para hablar con Hermes queda sin verificar aquí.
- **`messaging_channels`.** Su migración de creación no está en el repo, así que no se sabe si `scope` tiene CHECK (por eso D3).
- **Qué corre en el A1.** No se sabe si el A1 corre ya `peticiones_telegram.py` del repo (PET1112A/B) o la herramienta de
  referencia. GEN1113F asume el del repo. Si no, se aplica a la herramienta con el mismo bloque.
- **El cartero en el A1.** No se sabe si corre allí como líder (IND1029D). La fase 1 no depende de ello: el puente B ya vive en
  el A1.
- **`com.starseed.mando.tunel`.** Está cargado y vivo (`launchctl`), y su documento dice que abre todo el servidor. No se
  inspeccionó su alcance real. **Recomendación:** que Alex lo revise o lo descargue. Ya existe el túnel restringido
  `tunel-metagenesis`.
- **Lo que queda a medias de IND1029H.** `director_chat.recoger_puerta` existe y no lo llama nadie. GEN1113B no lo usa: la
  entrada nueva va por `/v1/genesis/chats/entrada`.

---

## 13. Lo que hace el código tras la integración (GEN1113INT · 2026-11-13)

Los seis paquetes (A puerta, B Mac, C biblioteca, D pestaña, E página, F A1) se fundieron en `opus1106/GEN1113INT`. Donde el
código y las secciones de arriba no coincidían, se arregló el lado equivocado; esto es lo que vale ahora.

**Forma de las entradas (§7.1).**
- `/decir` y `/a` llevan el texto libre en `texto` (≤ 8.000), no en `orden.args` (≤ 120 cada uno): `decir` con `args: []`,
  `a` con `args: [<agente>]` (`^[A-Za-z0-9_.-]{1,40}$`). Las demás órdenes no llevan `texto` (400).
- `responder` no exige texto (la ruta local lo arma con el mensaje original). `reenviar` exige al menos un canal.
- Un desarrollador solo puede `decir` sin `modelo` y con `canales` ausente o `["mando"]`. En la Mac eso se publica en el hilo
  con `director_chat.publicar` (plan `chat-hilo`), **sin** pasar por la ruta local, que siempre despierta a un motor.
- Cuerpo > 16 KB → 413 `grande`. Todos los errores llevan `{error, codigo}` (`forma`, `sin-sesion`, `no-miembro`,
  `solo-dueno`, `nonce-repetido`, `limite`, `rol-sin-comprobar`, `grande`).

**Espejo (§5.2).**
- La puerta guarda el registro entero menos `fuente` y `cursor` (así llega `origen: "genesis-web"`, la marca «vía Genesis en
  Astraura»). Un registro que vuelve con el mismo `id` **reemplaza** al anterior y pasa al final del cursor; la pestaña también
  reemplaza por `id`, así que se ve un solo mensaje con su entrega al día.
- `feed` sin `desde` devuelve los **últimos** `limite` registros (lo usa Conexiones de chat con `limite=1`).
- La Mac y el A1 trocean los lotes por número (≤ 200) **y por tamaño** (≤ 56 KB de JSON; la puerta corta en 64 KB) y recortan
  un registro a ≤ 40 KB (la puerta corta en 48 KB) marcándolo «recortado en la copia». Un lote que la puerta rechaza con 400/413
  se salta y se cuenta, en vez de parar el espejo.
- Si la Mac marca un mensaje como escrito desde la web después de haberlo subido (la ruta local publica antes de contestar), lo
  vuelve a subir una vez con la marca y sus entregas.

**Acuses.** La Mac y el A1 mandan `entregado` al recoger una entrada válida y el acuse final después de ejecutar y anotar. La
pestaña pasa de «En la puerta del A1 · esperando a la Mac» a «La Mac lo recogió · en marcha» y luego al estado final.

**Puente B.** El bot del A1 solo tiene `/estado` y `/ayuda` (§4.4). La pestaña solo ofrece esas dos y nombra las otras cuatro
como «aún no disponibles»; si se escriben, no se envían y se dice por qué. El aviso «Retiro de la cola tras 24 h» de una
petición hecha desde Genesis va al espejo, sin el texto de la petición, y no a Telegram (D6). La lista del A1
(`~/.starseed/peticiones/cuentas.json`) también exige permisos 600 y ser del usuario del servicio.

**La Mac por dentro.** `puente.orden` toma el «quién» de `STARSEED_IDE`; esa variable (y `sys.stdout`) se cambian solo bajo un
cerrojo del proceso que también toma el hilo del espejo mientras ejecuta código de otros guiones, así que nada se filtra de un
hilo a otro.

**Interfaz.** La primera escritura de `conexiones.metagenesis` la hace solo la pestaña con `conMetaGenesisInicial` (C);
Conexiones de chat muestra el interruptor con ese mismo ayudante. Si la cuenta no guarda, la pestaña lo dice
(«No se pudo guardar en tu cuenta…») y Conexiones de chat lo dice con un aviso y vuelve atrás.

**Fichas.** Ya existe una ficha llamada `genesis-mac` (ámbitos `metricas,metagenesis,latidos`): las nuevas se llaman
`genesis-chats-mac` (ámbito `genesis-mac`) y `genesis-chats-a1` (ámbito `genesis-a1`) para no sustituirla.

**Seguridad: límites que siguen abiertos.**
- **Puerta comprometida** (§4.3): puede hablar en nombre de un dueño de la lista, y con ello aprobar, soltar o reasignar tareas
  y escribir a Hermes, que tiene herramientas en la Mac. Arreglo previsto: entradas firmadas por el aparato (WebCrypto, clave
  no exportable) y claves públicas dadas de alta por Alex en la Mac y en el A1; la Mac y el A1 rechazan lo que no venga firmado.
- **Ficha de máquina robada** (`genesis-chats-mac` o `genesis-chats-a1`): puede leer las entradas pendientes de su destino
  (texto de Alex, ≤ 7 días), consumirlas y acusarlas con cualquier estado, y escribir registros falsos en el espejo de sus
  fuentes. No puede crear entradas ni llegar a la Mac. Se corta revocando la ficha en la puerta.
- **Texto de un desarrollador en el hilo**: no despierta a nadie, pero queda en el historial que leen los modelos y los IDE por
  el MCP del director. Debe tratarse como texto no fiable (autor `genesis-web-…`, rol `agente`).
- La puerta ve en claro las sesiones de quienes la usan (ya era así antes de este encargo).
