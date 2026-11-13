# Una identidad por chat y entradas firmadas por el aparato · contrato (GEN1114 · 2026-11-13)

> **Petición de Alex (2026-11-13), literal:** «los bots de telegram y los chats de los canales y puentes de los
> directores y produccion completa deben tener su mismo nombre y id. de chat en todos los medios activos del chat con
> las mismas configuraciones y contextos autosincronizables y configurables, tambien deben poder usarse con la orbe de
> astraura y la protomolecula y todos los medios de chats de ia publicos y privados y las multiples capas de conciencia
> y personalidades y todos los sistemas de astraura y la libreria de starseed os automaticamente»

**Qué cubre.** Tres partes que salen de esa frase y del hallazgo abierto de GEN1113INT:

- **Parte I.** Cada bot, chat, canal y puente lleva el mismo nombre y el mismo identificador en todos los medios donde
  aparece, con una sola configuración y un solo contexto que se sincronizan solos y se pueden cambiar desde cualquiera.
- **Parte II.** Las entradas que se escriben desde la web van firmadas por el aparato del dueño. Tomar la puerta, la base de
  datos o una ficha de máquina no basta para hablar en nombre de Alex ante la Mac.
- **Parte III.** Esos mismos chats se alcanzan desde la orbe, la Protomolécula, los medios de chat de IA públicos y
  privados, las capas de conciencia, las personalidades, los demás sistemas de Astraura y la Biblioteca, con los mismos
  permisos de la Parte II.

**Destino en el repo:** `architecture/astraura-chats-identidad-firma.md` (copia de trabajo:
`~/.starseed/opus1031/contratos/astraura-chats-identidad-firma-1114.md`). **Contrato escrito ANTES del código.** Lo que no
está aquí no forma parte del encargo. Leído contra la rama **`opus1106/GEN1113INT` (`86cc1767e`)** y contra main
(`b661a3e9e`). Cada afirmación sobre el código lleva su archivo. **LEÍDO** = visto en el código o en un archivo; **INFERIDO**
= deducido, sin verlo funcionar.

> **Condición previa (LEÍDO, corregido en la revisión REV1114).** Al escribir este contrato main no tenía GEN1113. En la
> revisión (2026-11-13, main en `da14cf8f8`) `git merge-base --is-ancestor opus1106/GEN1113INT main` **sí** da verdadero:
> D0 ya está hecho y los seis paquetes parten de **main**. Antes de leer el resto, lee §13 («Revisión antes de construir»):
> varias secciones cambiaron por ella y cada cambio está marcado **[REV]**.

---

## 0. Resumen en doce líneas

1. **Registro canónico de chats en la Mac**: `~/.starseed/genesis-chats/canon.json`, un solo escritor
   (`genesis_canon.py`). Se siembra con lo que ya existe: `scripts/puente/chats.json` (nombre canónico y chat principal
   de cada entorno) y `CANALES` (`chat-director-tipos.ts` / `director_chat.py`).
2. **Ids propios de StarSeed, estables**: `genesis` (la dirección), `genesis.canal.<canal>` (nueve canales de los
   directores) y `telegram.<usuario del bot>` (los tres puentes, congelado la primera vez).
   - Los ids nativos (chat de Telegram, sesión de Hermes, hilos de los IDE) **no salen nunca** de la Mac ni del A1.
   - Fuera de ellas, cada medio se reconoce por una huella de 8 caracteres.
3. **Nombres reales.** Los de los puentes son el nombre que Alex ve en Telegram (el del bot en un chat privado, el título en
   un grupo). Los lee una orden en la Mac con `getMe`/`getChat`, que imprime nombres y nunca ids. Las etiquetas de GEN1113
   («Hermes y avisos»…) pasan a ser **alias** y solo se ven como «nombre provisional» si falta el catálogo.
4. **Catálogo sin secretos**: la Mac lo sube a la puerta (`/v1/genesis/chats/canon`). La web, el A1 y los demás sistemas lo
   leen de allí. Una sola función, `nombreDeChat`, sustituye las cuatro listas de etiquetas fijas de GEN1113.
5. **Configuración y contexto**:
   - un registro por chat con versión por campo;
   - la Mac es el único punto que los ordena;
   - los cambios llegan como **propuestas firmadas** desde cualquier medio;
   - las listas se funden; un valor cambiado por dos medios a la vez se rechaza y se avisa (fase 2).
6. **Clave por aparato que no se puede exportar**: WebCrypto P-256 con `extractable: false` en IndexedDB.
   - Vale para el navegador y también para el WebView de las apps nativas, que cargan la web publicada.
   - Claves de hardware con Touch ID en las apps nativas: fase 2.
7. **Emparejar solo en la Mac, con Alex delante**:
   - el aparato muestra un código de 12 caracteres sacado de su clave **y de su cuenta** [REV];
   - Alex lo **teclea** en `genesis_aparatos.py emparejar`, en una terminal de la Mac (no por ssh, no con un botón remoto),
     que abre con un doble clic en «Emparejar aparato.command» [REV];
   - el alta en la lista exige además **la contraseña de administrador de la Mac** (la lista es de root): un programa que
     corra como Alex, un agente incluido, no puede añadir aparatos [REV];
   - cada aparato tiene un **nivel**: `texto` (por defecto) o `completo`; solo `completo` pone agentes a trabajar [REV].
8. **Lo que se firma**: los **bytes exactos** de una carga con
   - la cuenta, el aparato, un contador, la hora, la caducidad, el destino, el chat, **el nombre del chat que vio la
     persona** [REV] y la entrada entera.

   La puerta la guarda y la pasa **sin tocarla**. La firma se verifica en la **Mac** y en el **A1**; la puerta no es de
   confianza y solo comprueba la forma.
9. **Sin firma válida no se ejecuta ni se publica nada que llegue por la puerta**, tampoco para desarrolladores. Un aparato
   sin emparejar solo lee. [REV] Esto **no** cubre los caminos que no pasan por la puerta: los túneles de Cloudflare a la Mac
   (`com.starseed.mando.tunel`, `tunel-metagenesis`), Telegram y los programas locales; ver §3.11.
10. **Revocar**:
    - desde la Mac, o con una petición firmada desde cualquier aparato emparejado del dueño;
    - el A1 recibe la lista por ssh desde la Mac (`llevar-a1`), nunca por la puerta; [REV] el servicio de la Mac la lleva
      **solo** tras cualquier cambio (también una retirada pedida desde un aparato) y reintenta hasta lograrlo.
11. **Parte III**: los sistemas de Astraura leen el mismo catálogo. Escribir siempre pasa por la firma de un aparato
    emparejado. Los medios que no pueden firmar (MCP remoto, API externa, bots, orbe sin confirmación) dejan **borradores**
    que Alex firma.
12. **Fase 1 (seis paquetes en paralelo)**: nombres e ids reales de la dirección, sus nueve canales y los tres puentes, y
    escritura firmada desde un aparato emparejado.

---

## 1. Lo que hay hoy

### 1.1 Identidades de chat que ya existen (LEÍDO)

| Dónde | Qué guarda | Notas |
|---|---|---|
| `scripts/puente/chats.json` (versionado en el repo; lo leen `puente.py:186` `_chats()`, `eco-a-ides.py:27` y `genesis_renombrar.py`) | Claves de primer nivel `_lee_esto_primero`, `nombre_canonico`, `prefijo_tareas` y `proyecto`. `entornos` tiene `claude`, `codex`, `hermes`, `antigravity` y `telegram`, cada uno con `producto`, `proyecto`, `como_volver` e `id` (más `fijado`/`nota` en algunos). `telegram.temas` tiene las claves `GENESIS`, `olas` y `avisos`. | Es **el registro de los chats principales**: «Uno por entorno, con nombre fijo». El nombre canónico es «GENESIS · StarSeed OS». **Lleva identificadores de sesión versionados en el repo** (no se imprimieron). `telegram.id` y `antigravity.id` son `null`. `puente.py` también acepta una copia local en `starseed_memory_root/mando/chats.json`. |
| `src/lib/mando/chat-director-tipos.ts` `CANALES` y `scripts/puente/director_chat.py:18` `CANALES` | Diez canales en el mismo orden (una prueba falla si se separan): `mando`, `director-presidente`, `claude-cowork`, `claude-mac`, `hermes`, `telegram`, `chatgpt`, `antigravity`, `ide` y `terminal`. Cada uno tiene `id`, `nombre`, `descripcion` y `respuesta`. | Los nombres ya son reales (por ejemplo «Director presidente» o «Hermes»). `mando` se llama «Este chat (Genesis)». |
| `src/lib/mando/asistente.ts` + `/api/mando/chats` | Los chats del asistente técnico de Genesis, «los MISMOS para la orbe y para la pestaña». Viven en `starseed_memory_root/mando/chats/<id>.json`. | Solo en la Mac (`guardianMando`). Es otra familia de chats y no se toca. |
| Hermes | Sesiones propias. El principal está fijado con `hermes sessions pin` (nota de `chats.json`). En `~/.hermes/` existen `channel_directory.json`, `config.yaml` y `SOUL.md` (**solo se miraron los nombres de archivo**, no su contenido). | No se sabe si la CLI de Hermes puede poner título a una sesión (§12). |
| Punteros de los IDE | `sincronizar-ides.py` reescribe `~/.codex/AGENTS.md`, `~/.hermes/PUENTE-DE-MANDO.md`, `~/.gemini/antigravity/PUENTE-DE-MANDO.md` y las reglas de Cursor. El MCP `mcp_director.py` expone `director_leer`, `director_decir`, `director_bandeja`, `director_responder` y `produccion_*`. | Es el camino ya existente para llevar nombres y contexto a los IDE. |
| Astraura | `aurora_conversations` (`id`, `title`, `persona`, `meta jsonb`…) y `astraura_messages`. GEN1113 añade `meta.genesis` y los vínculos en `user_settings.prefs.chatsGenesis` (`VinculoChat.v = 1`, ids `direccion`, `puente:<puente>`, `astraura:<convId>` y `tg:<chatId>`). | Rama `opus1106/GEN1113INT`. |
| GEN1113 (las etiquetas inventadas) | `PuenteTelegram = "hermes-avisos" \| "peticiones" \| "avisos-directores"` (`src/lib/chats-genesis/tipos.ts:15`). Fuentes de transporte `puente:hermes-avisos`, `puente:peticiones` y `puente:avisos-directores` en `tipos.ts:70`, `chats-genesis.mjs:16` y `genesis_chats_logica.py:23`. | Las etiquetas visibles están **escritas a mano en cuatro sitios**: `lista-chats-genesis.tsx:77-79`, `conexion-telegram.tsx:38-40`, `chat-neural-sidebar.tsx:76` y `hilo-puente.tsx` (comentarios y ayudas). Además están en `genesis_chats_logica.py:358` (`AYUDA_A`). |
| Telegram | Tres bots. Lo que se sabe de ellos son **nombres de variables**: <br>• A: `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` de `~/.hermes/.env`, que escucha el gateway de Hermes; <br>• B: `TELEGRAM_SINTESIS_BOT_TOKEN`/`TELEGRAM_SINTESIS_CHAT_ID`, que atiende el A1; <br>• C: `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` de `~/.starseed/env`, solo envío. <br>`telegram-alta.sh:27` ya usa `getMe` para leer el nombre de un bot. | Nadie en el repo llama a `getChat`. Los nombres reales de A y C **no están en el repo** (§12). |

### 1.2 Seguridad y criptografía que ya hay (LEÍDO)

- **Quién pone la cuenta y el rol.** Los pone la puerta, con el JWT verificado. La Mac comprueba la cuenta otra vez contra
  `~/.starseed/genesis-chats/cuentas.json`. Nada viene firmado desde el aparato (informe GEN1113INT, punto 1; contrato
  §4.3 y §13). La escritura está **parada** por eso.
- **`validarEntrada` de la puerta** (`chats-genesis.mjs`, a partir de la línea 110) **copia solo los campos del contrato y
  normaliza**: quita repetidos de `canales` con un `Set`. Una firma sobre el JSON que manda el aparato **no sobreviviría**
  a esa ruta. Por eso aquí se firman **bytes opacos** que la puerta no toca (§3.4).
- **`mesh-identity.ts`.** Su par ECDSA P-256 se genera con `extractable: true` y se guarda como JWK en `safe-storage`
  (`localStorage`). **Se puede exportar y leer desde el JavaScript de la página**: no sirve para esto.
- **`src/lib/identidad/*`** (IDN1108A). Es una clave maestra de cuenta que firma certificados de neurona, con anclas y
  revocaciones. Se guarda en IndexedDB y la maestra se puede exportar cifrada. Es otro problema (identidad en la malla); se
  podrá enlazar en la fase 3, no en la 1.
- **`src/lib/bloqueo/passkey-registro.ts` y `passkey-verificacion.ts`.** Hay passkeys de plataforma con verificación de
  persona (`userVerification: "required"`) y una verificación ECDSA de verdad, sin servidor. Es el precedente para la
  presencia con biometría de la fase 2.
- **`permisos-y-control-del-dispositivo.md` §4, regla 2.** Prevé firmas Ed25519 por neurona publicadas en
  `neuron_devices`. **No está construido.**
- **§4.8 de ese mismo contrato.** Las apps nativas cargan la web publicada, y los comandos nativos solo se conceden a
  orígenes concretos y con diálogos nativos. Hoy no hay código de llavero ni de Secure Enclave en `native/src-tauri`.
- **Python de la Mac.** `cryptography` 50.0.2 está en `python3` y en el `python3` de Homebrew. Ningún guion lo importa
  todavía. En el A1 **no se sabe** si está (§12).

### 1.3 El resto de Astraura (Parte III, LEÍDO)

| Sistema | Dónde está | Qué hace hoy con los chats |
|---|---|---|
| Orbe de voz | `src/lib/aurora/quantum-orb-bus.ts` (solo el canal de estado); `src/app/api/astraura/conversacion/route.ts` (turno en vivo, solo en local); `asistente.ts` (la orbe de Genesis, solo en la Mac) | No conoce los chats de dirección ni los puentes. |
| Protomolécula | `src/lib/protomolecula/accion-agente.ts` (`[[ACCION: protomolecula {json}]]`, pasa por `decidirOperacion`), `registro-atomos`, `orbe-bus.ts` y `permisos.ts`; contratos `protomolecula.md` y `protogenesis.md` | Nada sobre chats. |
| Chats de IA privados | `aurora_conversations` y la pestaña Chats; los vínculos de GEN1113 | Vincula, pero sin identidad común. |
| Medios de IA externos | `src/app/api/externos/v1/[...ruta]` (fichas `ssk_…`, `POST chat` hacia la personalidad del vínculo) y el MCP remoto `src/app/api/mcp/genesis` (`HERRAMIENTAS_MCP`) | ⚠ La herramienta MCP `chat` (`src/lib/genesis/mcp/herramientas.ts`, hacia la línea 369) **devuelve «Mensaje enviado a …» sin enviar nada**. Contradice la regla de Alex y se corrige en la fase 3 (o se marca antes, §10). |
| IDE locales | `scripts/puente/mcp_director.py` | Escriben y leen la dirección en la Mac (proceso local, de confianza). |
| Capas de conciencia | `src/lib/astraura/capas-conciencia.ts` (`PreferenciaCapas`, en `IntelligenceSettings`) y `src/lib/astraura/capas/planificador.ts` | Son globales por cuenta, no por chat. |
| Personalidades | `src/lib/aurora/personalities.ts` (`Personality`), `src/lib/astraura-bots/personalidad-adaptable.ts` y `directiva-bot.ts` | Van por conversación (`aurora_conversations.persona`) o por bot. |
| Bots y orbes | `src/lib/astraura-bots/tipos.ts` (`Bot` con `dueno`, `gobierno` y `personalidad`) y `permisos.ts` (`decidirAccion`) | Un bot no pertenece a ningún chat de Genesis. |
| Biblioteca | `src/lib/library/packages.ts` (`PackageKind`, incluido `agent`) e `install.ts` (el enlace lleva a `/install`, donde la persona pulsa «Instalar») | No existe un paquete «chat». |
| Puertas de la fusión | `architecture/astraura-multicapas-fusion.md`: Juicio, Recordar, Alcance (`src/lib/nucleo/alcance-memoria.ts`), Permisos y Creación | Toda novedad entra por una puerta que ya existe. |

### 1.4 Lo que limita el diseño (resumen)

- **Parte I.**
  - Ya hay un registro de chats principales con nombre fijo (`chats.json`), pero vive en el repo y lleva ids de sesión. No
    sirve como almacén editable desde la web: cada cambio sería un cambio en git.
  - Los ids de Telegram son privados por regla.
  - Los nombres reales de dos bots no están en ningún archivo legible sin tocar secretos o la red.
  - Hermes no se lee.
  - Las etiquetas de GEN1113 están copiadas en cuatro componentes.
  - Las cadenas `puente:*` ya viajan por la puerta y están guardadas en SQLite, en prefs y en `localStorage`: **no se
    pueden renombrar sin migrar tres almacenes**, así que se conservan como claves de transporte.
- **Parte II.**
  - La puerta reescribe las entradas.
  - La única clave de aparato que existe se puede exportar.
  - Las apps nativas no tienen llavero propio y ejecutan la web publicada.
  - La Mac tiene `cryptography`; del A1 no se sabe.
- **Parte III.**
  - Casi todo existe como puerta reutilizable: `decidirOperacion`, `decidirAccion`, `PackageKind`, el MCP del director y el
    MCP remoto.
  - Lo nuevo es la pertenencia de un bot a un chat, el átomo de chat de la Protomolécula, los borradores y el paquete de
    plantilla de chat (§4).

---

## 2. Parte I · Una identidad por chat

### 2.1 Qué es un chat canónico

Un chat canónico es **una conversación con un único nombre, un único id, una configuración y un contexto**, que puede
aparecer en varios **medios**: la dirección en la Mac, Telegram, Hermes, Claude, Codex, Antigravity, la pestaña Genesis o
una conversación de Astraura. Un medio no es una copia: es otra ventana al mismo chat.

**Chats canónicos de la fase 1** (13):

| id | Tipo | Nombre (de dónde sale) | Medios | Fuente de transporte (GEN1113, se conserva) |
|---|---|---|---|---|
| `genesis` | `direccion` | «GENESIS · StarSeed OS» (`chats.json › nombre_canonico`) | `mac-direccion` (canal `mando`), `claude`, `codex`, `hermes` y `antigravity` (`chats.json › entornos`), `telegram` (tema `GENESIS` si el chat es un grupo con temas), `genesis-web` | `direccion` |
| `genesis.canal.<canal>`, uno por canal salvo `mando` (9) | `canal-director` | `CANALES[i].nombre` (p. ej. «Director presidente», «Hermes», «ChatGPT (Codex)») | el canal en la Mac y su bandeja o motor; `genesis-web` | — (se escribe por `direccion` con `canales`) |
| `telegram.<usuario>` del bot A | `puente-telegram` | el nombre que Alex ve en Telegram (§2.3) | `telegram`, `hermes` (lo escucha su gateway), `genesis-web` | `puente:hermes-avisos` |
| `telegram.<usuario>` del bot B | `puente-telegram` | igual | `telegram`, `a1-peticiones`, `genesis-web` | `puente:peticiones` |
| `telegram.<usuario>` del bot C | `puente-telegram` | igual | `telegram` (solo envío), `genesis-web` | `puente:avisos-directores` |

**INFERIDO.** El chat de dirección (`mando`) y los «chats principales» de cada entorno de `chats.json` son **la misma
conversación**, repartida por bandejas y por el MCP del director. Lo dice `chats.json` («Registro de los chats PRINCIPALES de
Genesis. Uno por entorno, con nombre fijo») y su nombre canónico coincide con el producto. Si Alex no lo ve así, los
entornos pasan a ser chats propios con el mismo esquema (decisión D2).

**«Producción completa».** Se interpreta como lo que corre fuera de la Mac:

- la web publicada;
- el A1, con la puerta y el bot B;
- los mismos 13 chats con los mismos nombres e ids allí, no solo en `/genesis` de la Mac.

Es la decisión D13.

### 2.2 Dónde vive el registro y quién escribe

| Qué | Dónde | Quién escribe | Por qué |
|---|---|---|---|
| **Registro canónico** (`CanonChats`, §5.1): identidad, medios, configuración, contexto y versiones | **`~/.starseed/genesis-chats/canon.json`** en la Mac, permisos 600, con copia rotada `canon.json.1..5` | **solo** `genesis_canon.py` (proceso local) | Un solo escritor: no hay conflictos repartidos. Vive al lado de `cuentas.json` y `aparatos.json`, fuera del repo (no hay cambios en git por editar un nombre). |
| **Semilla** | `scripts/puente/chats.json` + `CANALES` | nadie nuevo: **no se toca** en la fase 1 | Si `canon.json` falta, se rehace desde la semilla sin perder nada. |
| **Refs nativas de cada medio** (qué variable de entorno, qué clave de `chats.json`) | dentro de `canon.json`, campo `refs`, **solo nombres** de variables y de claves, nunca sus valores | `genesis_canon.py` | Así el registro puede ir en una copia de seguridad o en un informe sin filtrar ids. |
| **Sal de las huellas de medio** | `~/.starseed/genesis-chats/sal-medios` (32 bytes aleatorios, 600) | `genesis_canon.py` la crea una vez | La huella `HMAC-SHA256(sal, id nativo)[:8]` deja ver que dos medios son el mismo chat sin revelar el id. |
| **Catálogo público** (`CatalogoCanon`, §5.1) | puerta del A1, tabla `genesis_canon` (una fila) | la Mac, con la ficha `genesis-chats-mac` | Lo leen la web, el A1 y los demás sistemas. No lleva ids nativos ni tokens. |
| **Copia en el aparato** | `localStorage["starseed.chats-genesis.canon.v1"]` | el cliente web | Arrancar con nombres sin esperar a la puerta. Solo comodidad: la verdad es la puerta y, detrás, la Mac. |

### 2.3 Ids y nombres: reglas

- **Forma del id.** Es `^[a-z0-9][a-z0-9._-]{1,62}$`, en minúsculas. El id es **propio de StarSeed** y no cambia nunca
  (decisión D1).
  - `genesis` y `genesis.canal.<CanalId>` salen del código.
  - `telegram.<usuario>` sale del `@usuario` del bot **en el momento de descubrirlo**, en minúsculas y sin `@`. Si el bot
    cambia de usuario después, el id se queda y el nombre cambia.
- **Nombre.** Es la cadena que ve una persona, de 1 a 80 caracteres. Para un puente es **el nombre con que Alex ve ese chat
  en Telegram**:
  - si `getChat(<chat>).type` es `private`, el chat aparece en la app de Alex con el nombre del bot, así que el nombre es
    `getMe().first_name`;
  - si es `group`, `supergroup` o `channel`, el nombre es `getChat().title`.
  - Esta es la decisión D2b.
- **Descubrir** (`genesis_canon.py descubrir`, en la Mac):
  - lee los tres pares de variables por su **nombre** (§1.1) y llama solo a `getMe` y `getChat`;
  - **nunca a `getUpdates`**: el gateway de Hermes escucha al bot A y le robaría los mensajes;
  - imprime por cada bot:
    - el nombre de la variable;
    - el tipo de chat;
    - el nombre;
    - el `@usuario`;
    - el id canónico propuesto.
  - Nunca imprime un id numérico ni un token: una prueba comprueba que la salida no tiene ninguna secuencia de 7 o más
    dígitos.
  - Con `--aplicar`, escribe en `canon.json`.
  - Sin red o sin variable, el puente queda `nombreProvisional: true` con su alias de GEN1113, y la salida dice qué falta.
- **Alias.** Cada chat guarda en `alias[]` todo lo que lo nombró antes:
  - `direccion`, `puente:hermes-avisos`, `hermes-avisos` y las etiquetas «Hermes y avisos»… para los puentes;
  - `mando` para la dirección.

  Un alias **resuelve siempre** al id canónico, y así ningún enlace, vínculo ni prueba guardada se rompe.
- **Nombre de un medio distinto del canónico.** Por ejemplo, Alex renombra el grupo en Telegram. La siguiente pasada de
  `descubrir` lo anota en `medios[i].nombreEnMedio` con `estadoNombre: "distinto"`. El canónico **no cambia solo** (decisión
  D4). Genesis lo muestra («En Telegram se llama «X»») con dos acciones: «Usar «X» como nombre» o «Volver a poner «Y» en
  Telegram» (fase 2).

### 2.4 Cómo llegan nombres e ids a la puerta y a la web, sin exponer nada de Telegram

1. **La Mac publica el catálogo.** `genesis_canon.py subir` construye `CatalogoCanon` con `catalogo_publico(canon)`, que es
   **pura** y tiene prueba de que no deja pasar `refs` ni nada que parezca un id numérico o un token. Lo sube con
   `POST /v1/genesis/chats/canon` y la ficha `genesis-chats-mac`. Cuándo se ejecuta:
   - al cambiar `canon.json` (plist `com.starseed.genesis-canon` con `WatchPaths`);
   - y cada 10 min como latido.
2. **La puerta lo guarda tal cual.** Lo sirve en `GET /v1/genesis/chats/canon` con estas reglas:
   - **dueño**: todo;
   - **desarrollador**:
     - se quitan los chats cuyos medios solo puede leer un dueño (los puentes A y B, §4.2 de GEN1113);
     - se quita el campo `usuario` de los bots;
   - **sin acceso**: 403;
   - **ficha `genesis-chats-a1`**: todo, para el `/estado` del bot B.
3. **La web** (`canon.ts`) lo lee al abrir Genesis, Conexiones de chat o la barra de Chats, y lo guarda en la copia local.
   - Cada sitio que hoy escribe una etiqueta fija llama a `nombreDeChat(catalogo, claveOAlias)`.
   - La función devuelve `{nombre, id, provisional}`.
   - Con el catálogo ausente, devuelve la etiqueta de GEN1113 con `provisional: true`, y la interfaz añade «(nombre
     provisional: la Mac aún no ha publicado el nombre real)».
4. **Lo que nunca viaja:**
   - ids de chat de Telegram, tokens, ids de sesión de Hermes y de los IDE, rutas;
   - la sal;
   - el contenido de `chats.json › entornos.*.id` y `como_volver`.

   Lo que sí viaja:
   - `huella` (8 hex por medio);
   - `usuario` del bot (solo al dueño);
   - el nombre.

### 2.5 «La misma configuración y el mismo contexto»: qué contienen y cómo se resuelven los choques

**Qué contiene** (tipos en §5.1; se construye en la **fase 2**; en la fase 1 solo existen los tipos y la semilla vacía):

| Bloque | Campos | Quién los usa |
|---|---|---|
| `config` | `descripcion` (≤ 280); `modeloPorDefecto` (p. ej. `director-presidente/auto`); `canalesPorDefecto` (⊂ `CANALES`); `personalidad` (`{tipo: "aurora" \| "bot", id}` o `null`); `capas` (`PreferenciaCapas` o `null`); `memoria` (`{activa, alcance}`, con el alcance de `alcance-memoria.ts`); `avisos` (`{silencio, resumen}`); `bandejas` (`["chats","genesis"]`) | El compositor de cada medio, el planificador de capas y la orbe |
| `contexto` | `instrucciones` (≤ 8.000: lo que cada motor recibe al contestar en este chat); `fijados` (≤ 50 ids de mensaje); `memorias` (≤ 50 ids de cápsula); `resumen` (`{texto ≤ 4.000, t, por}`) | Los motores de la Mac (por el cartero), Hermes y los IDE (por los punteros), y Astraura (por la conversación vinculada) |
| `permisos` | Quién lee y quién escribe por rol | **Solo** se edita en la Mac por CLI (`genesis_canon.py permisos …`). Nunca desde un medio remoto |

**Cómo llega a cada medio** (fase 2; lo hace la Mac, nunca el medio):

| Medio | Cómo recibe nombre, configuración y contexto |
|---|---|
| Dirección en la Mac (`/genesis`) | lee `canon.json` en local; el `nombre` de `mando` y de cada canal sale del registro, y `CANALES` queda como semilla |
| Claude, Codex, Antigravity, Cursor | `sincronizar-ides.py` escribe en sus punteros la sección «Chats de Genesis» (nombre · id · instrucciones), como ya hace con el resto |
| Hermes | el mismo puntero `~/.hermes/PUENTE-DE-MANDO.md`; el título de su sesión solo si la CLI lo permite (§12) |
| Telegram | `setMyName`, `setMyShortDescription` y, en grupos donde el bot es administrador, `setChatTitle`: **solo** con `genesis_canon.py aplicar-nombres --telegram`, que enseña el cambio y pide confirmación a Alex en la terminal |
| Genesis web y Astraura | el catálogo; una conversación de Astraura vinculada guarda `meta.chatCanonico = <id>` |

**Choques** (decisión D4). La Mac es el único que aplica cambios, así que no hay choques repartidos, solo **cambios
concurrentes**:

- **Qué es un cambio.** Una **propuesta** `{chat, campo, valor, base}`, donde `base` es la versión del campo que vio quien
  propone. Llega como entrada firmada (`accion: "configurar"`) desde la web, por el MCP del director desde un IDE (local) o
  desde la CLI.
- **Si `base` es igual a `versiones[campo].n`.** Se aplica, sube la versión y se anota `por` (medio + `aparato8` o
  `cuenta8`).
- **Si no:**
  - `fijados`, `memorias` y `canalesPorDefecto` se **funden** (unión, conservando el orden del primero);
  - cualquier otro campo se **rechaza**. El acuse dice «Cambió en <medio> a las HH:MM; mira el valor nuevo y vuelve a
    intentarlo», y la interfaz enseña los dos valores.
- **Con la Mac apagada.** Las propuestas esperan en la puerta y se aplican en orden de llegada con la misma regla.
- **Cambios hechos dentro de un medio** (un título en Telegram). No son propuestas: se ven como «distinto» (§2.3). El
  canónico gana hasta que Alex elija.

### 2.6 Migración desde GEN1113 (regla: nada guardado se pierde)

- **Transporte.** Las cadenas `direccion` y `puente:*` **no cambian** en la puerta, la Mac ni el A1, en tablas, registros ni
  pruebas. Son claves de transporte. Cada chat canónico lleva su `fuente` y la tabla `ALIAS_GEN1113` las une a su id.
- **`prefs.chatsGenesis` v1 → v2** (`migrarPrefsChatsGenesis`, pura, ya existe y se amplía):
  - cada `VinculoChat` gana `chat?: string` (el id canónico) cuando su fuente es `direccion` o `puente`;
  - el `id` del vínculo **no cambia** (`direccion`, `puente:<puente>`), así que `cambiarBandejas` y la barra de Chats siguen
    encontrándolo;
  - `v` pasa a 2;
  - una v1 se lee siempre;
  - lo que no se entiende va a `chatsGenesisDescartado`, como hasta ahora.
- **`titulo` puesto a mano en un vínculo.** Si Alex ya lo había puesto, se respeta como nombre **local** de ese aparato, con
  la marca «Nombre puesto por ti; el del chat es «X»».
- **`localStorage`.** Las claves de filtros (`starseed.genesis.chats.filtros.v1`) y la copia (`starseed.chats-genesis.v1`)
  no cambian.
- **`aurora_conversations.meta.genesis`.** No cambia. Se añade `meta.chatCanonico` solo cuando una conversación de Astraura
  se convierte en chat canónico (fase 2).
- **Entradas v1 que queden en la puerta.** La escritura está parada, así que no debería haber. Si las hay, la Mac las acusa
  `rechazado` con el motivo «sin firma (anterior a GEN1114)» y la interfaz ofrece reenviarlas firmadas desde el borrador.
- **Etiquetas en el código.** Las cuatro listas fijas se sustituyen por `nombreDeChat`. Las etiquetas quedan **solo** en
  `ALIAS_GEN1113`, como respaldo provisional y alias.

---

## 3. Parte II · Entradas firmadas por el aparato del dueño

### 3.1 Contra qué protege y contra qué no

**Objetivo.** Tomar la puerta del A1, su SQLite, la base de Supabase o una ficha de máquina **no basta** para que la Mac o el
A1 ejecuten algo en nombre de Alex, ni para meter texto suyo en el hilo. Para eso hace falta **una clave que solo existe
dentro de un aparato que Alex emparejó en la Mac, con él delante**. Lo que sigue sin proteger está en §3.11.

### 3.2 La clave por aparato

| Dónde corre la web | Fase 1 | Fase 2 |
|---|---|---|
| Navegador (Chrome, Safari, Firefox, Edge; móvil y escritorio) | `crypto.subtle.generateKey({name:"ECDSA", namedCurve:"P-256"}, false, ["sign"])`. La `CryptoKey` privada se guarda **como objeto** en IndexedDB (`starseed-genesis-firma`, almacén `aparato`). No se puede exportar ni leer: solo se puede pedir que firme. Se pide `navigator.storage.persist()` | Opcional: passkey con verificación de persona para las órdenes que cambian algo (D5) |
| App nativa (macOS WKWebView, Android WebView, Windows WebView2, Linux WebKitGTK) | **la misma vía**: la app carga la web publicada (`permisos…md` §4.8), así que la clave vive en el IndexedDB del WebView para ese origen. Se etiqueta «app nativa (clave del navegador interno)» | Comandos de Rust `aparato_clave_crear` y `aparato_firmar`: Secure Enclave (macOS e iOS) con una ventana de Touch ID de 5 min, Android Keystore (StrongBox si lo hay) con `setUserAuthenticationParameters(300, …)`, y Windows CNG con el proveedor del TPM. Solo para el origen publicado y con un diálogo nativo que resume lo que se firma. **Construcción nueva** |

**Datos de la clave:**

- **Huella** del aparato: `sha256(SPKI DER)` en hex, 64 caracteres. La clave pública siempre se puede exportar aunque la
  privada no.
- **Código visible:** [REV] 60 bits de `sha256` de la huella **y la cuenta** en base32 RFC 4648 (A–Z, 2–7), como
  `XXXX-XXXX-XXXX` (definición exacta y vectores en §3.3). Antes eran los 60 primeros bits de la huella sola, que no ataba la
  cuenta.
- **En los registros:** `aparato8`, los 8 primeros hex.
- **Firma:** ECDSA P-256 con SHA-256. WebCrypto da `r‖s` de 64 bytes; la Mac y el A1 la pasan a DER con
  `encode_dss_signature` antes de verificar con `cryptography`.

### 3.3 Emparejar: en la Mac, con Alex delante

1. **En el aparato.** Genesis › MetaGenesis › «Emparejar este aparato para escribir». La persona pone un nombre («iPhone de
   Alex», ≤ 60).
   - La web crea la clave.
   - Envía `POST /v1/genesis/aparatos/solicitud {spki, nombre, plataforma}` con su sesión de miembro.
   - Muestra **en grande** el código `XXXX-XXXX-XXXX`, el nombre, `cuenta8` de su propia sesión y «Ahora, en tu Mac,
     haz doble clic en «Emparejar aparato» (en el Escritorio) o, en una terminal:
     `python3 scripts/puente/genesis_aparatos.py emparejar`».
   - **[REV] El código ata la clave y la cuenta**: `codigo = base32(sha256("starseed.genesis.emparejar.v1\n" + huella +
     "\n" + cuenta)[:8])[:12]`, con `huella` en hex minúscula, `cuenta` = `sub` de la sesión en minúsculas, base32 RFC 4648
     (A–Z, 2–7) y agrupado 4-4-4. La cuenta la saca el aparato de **su** sesión (el `sub` del JWT, sin verificar: es suya).
     Así, una puerta que cambie la cuenta de una solicitud (para que el aparato de un desarrollador entre como de Alex)
     hace que el código no cuadre. Vectores (sin claves; `huella` = sha256 de un texto):

     | huella | cuenta | código |
     |---|---|---|
     | `17a3b6ff31fccb5586b758b98e5cfcc2c4c4b68aa103288765360cfd0f64d80c` | `00000000-0000-4000-8000-000000000001` | `7ETY-DGGK-DY2F` |
     | la misma | `00000000-0000-4000-8000-000000000002` | `S7GP-KAWW-7Y5T` |
     | `c76ee5500e9143562f96ddaf2abbdb08c0676ce7f7a4e36edd644a9ba6cf8164` | `00000000-0000-4000-8000-000000000001` | `VYR2-W7RQ-DW2P` |

   - La solicitud caduca a los 15 min. Como mucho, 3 pendientes por cuenta.
2. **En la Mac.** Alex ejecuta `genesis_aparatos.py emparejar`. La orden **se niega** en estos casos:
   - si la entrada no es una terminal (`isatty`);
   - si hay `SSH_CONNECTION` o `SSH_TTY` («Emparejar solo se hace sentado delante de la Mac»);
   - si la llama el MCP del director: no se expone como herramienta.

   Pide a la puerta las solicitudes pendientes con la ficha `genesis-chats-mac` y, por cada una, muestra:
   - el nombre que dio el aparato (texto no fiable, sin caracteres de control, ≤ 60);
   - la plataforma y la hora;
   - `cuenta8`, y si esa cuenta está en `cuentas.json` y con qué rol.

   Después pide: «**Escribe el código que ves en la pantalla del aparato:**». [REV] La Mac, por cada solicitud:
   - carga la SPKI con `cryptography` y exige una clave pública **P-256** válida (si no, la descarta);
   - calcula ella misma `huella = sha256(SPKI)` (no usa la que diga la puerta) y el código con la `cuenta` de la solicitud;
   - normaliza lo tecleado (mayúsculas, sin espacios ni guiones; cualquier otro carácter fuera de A–Z y 2–7 → «código no
     válido») y lo compara con **todas** las pendientes.

   Casos:
   - **Coincide exactamente una** y su cuenta está en `cuentas.json`: muestra su nombre, `cuenta8` y rol y pregunta el
     **nivel** [REV]: «¿Puede este aparato poner agentes a trabajar (Hermes, motores, aprobar tareas, peticiones)? Quien
     controle la web publicada podría usarlo sin que lo notes. Escribe `completo` para sí; Intro para solo texto».
     Por defecto `texto` (§3.5, riesgo). Después escribe el alta (abajo) y notifica a la puerta
     (`POST /v1/genesis/aparatos/resultado {solicitud, estado: "emparejado", huella}`).
   - **Coincide una cuya cuenta no está en `cuentas.json`**: no empareja («esa cuenta no está en la lista de la Mac»).
   - **No coincide ninguna:** «El código no coincide con ninguna solicitud: no se ha emparejado nada. Si lo escribiste bien,
     alguien cambió la clave o la cuenta por el camino; no repitas, avisa». Apunta `codigo-distinto`. Las solicitudes no
     se tocan (pueden ser de otra persona); `emparejar --rechazar N` rechaza una a mano.
   - **La huella ya estuvo emparejada y fue retirada:** no se vuelve a dar de alta («crea una clave nueva en el aparato»).
   - **Por qué teclear y no «s/n».** Teclear obliga a mirar los dos códigos. Con 60 bits, una puerta que quisiera fabricar
     una clave (o una cuenta) con el mismo código en los 15 min de la solicitud necesitaría unas 2^60 pruebas.

   **[REV] El alta exige la contraseña de administrador.** La lista de altas `aparatos.json` es de **root**, modo 644, en
   `/Library/Application Support/StarSeed/genesis-aparatos.json` (la leen el servicio y las pruebas; solo root la escribe).
   `emparejar` escribe la lista nueva en un temporal propio y la instala con
   `sudo /usr/bin/install -o root -g wheel -m 644 <tmp> <ruta>` (sudo pide la contraseña en esa terminal). Por qué: la regla
   «solo en una terminal» **no prueba que haya una persona**. Cualquier programa que corra como Alex en la Mac (Hermes y
   los agentes con herramientas, Desktop Commander, un IDE) puede abrir una pseudoterminal (`script`, `expect`), quitar
   `SSH_*` y teclear un código que un atacante le pase por texto (un mensaje a Hermes, una línea de un desarrollador en el
   hilo). Con la lista de root, añadir un aparato pide algo que un agente no tiene. Las **retiradas** no piden contraseña:
   van a `~/.starseed/genesis-chats/aparatos-retirados.json` (de Alex, 600), que solo puede quitar poder. Un aparato vale
   si está en la lista de root **y no** está en la de retirados. Si la Mac no tiene sudo para Alex, `emparejar` se niega y
   lo dice (D15). Las pruebas inyectan las rutas y un `install` falso.

   **[REV] Doble clic.** El paquete B añade `scripts/puente/Emparejar aparato.command` (ejecutable) que abre Terminal con
   `cd <raíz del repo> && /opt/homebrew/bin/python3 scripts/puente/genesis_aparatos.py emparejar`, y la orden
   `genesis_aparatos.py acceso-escritorio`, que copia ese archivo al Escritorio de Alex. Alex no escribe órdenes: hace
   doble clic, teclea el código y la contraseña, y elige el nivel.
3. **Al A1.** [REV] `llevar-a1` copia por ssh al usuario `starseed`, en `~/.starseed/peticiones/` (600, del usuario):
   `aparatos.json` (la lista de root, tal cual), `aparatos-retirados.json` y `chat-a1.json` (`{id, nombre, alias}` del chat
   canónico del puente B, sacado de `canon.json`; el A1 lo usa para comprobar `chat` y `chatNombre`, §3.5, y para su
   `/estado`). Usa el alias ssh de los encendidos de GEN1113INT (§12) y nunca imprime la dirección. Lo hace `emparejar` al
   terminar y **el servicio de la Mac solo** tras cualquier retirada (también la pedida desde un aparato), reintentando
   cada 5 min hasta lograrlo y anotando en `aparatos.log` cuándo llegó.
4. **El aparato** consulta `GET /v1/genesis/aparatos/estado?huella=` cada 5 s mientras espera y pasa a «Emparejado en la Mac
   a las HH:MM». Es **información de la puerta**, que no es de confianza: si mintiera, la primera entrada se rechazaría y el
   mensaje lo diría. La fase 2 lo cierra con el catálogo firmado por la Mac.
5. **Desarrolladores.** Se emparejan igual, con Alex delante de la Mac. El rol lo sigue dando `cuentas.json`; la firma solo
   prueba **qué aparato** escribe. [REV] La pantalla de `emparejar` dice antes del código «Empareja solo un aparato que tengas
   en la mano o cuya pantalla veas tú mismo»: el código prueba que la clave y la cuenta no cambiaron por el camino, no que
   el aparato sea de quien dice. El nivel de un aparato de desarrollador no importa: su rol ya le impide despertar agentes.

### 3.4 Qué se firma exactamente

El aparato construye la **carga**, la serializa con `JSON.stringify` y firma **esos bytes UTF-8**. Envía:

```ts
interface EntradaFirmada {
  v: 2;
  carga: string;    // base64url (sin relleno) de los bytes UTF-8 del JSON de CargaFirmada; ≤ 32 KB decodificada [REV]
                    // (8.000 caracteres de texto pueden ser 32 KB en UTF-8; el cuerpo entero v2 ≤ 48 KB, §3.5)
  firma: string;    // base64url de r‖s (64 bytes) → 86 caracteres
  aparato: string;  // huella, ^[0-9a-f]{64}$
}
interface CargaFirmada {
  aud: "starseed.genesis.chats.v1";   // nada firmado para otro uso sirve aquí
  cuenta: string;                      // sub de la sesión con que se emparejó el aparato
  aparato: string;                     // la misma huella (atada dentro de lo firmado)
  seq: number;                         // [REV] contador del aparato, entero ≥ 1, ÚNICO por aparato (no hace falta que llegue en orden, §3.6).
                                       // Se reserva en una transacción readwrite de IndexedDB que se cierra ANTES de firmar
                                       // (crypto.subtle.sign es asíncrono y cerraría la transacción); dos pestañas nunca
                                       // reciben el mismo número; los huecos no importan.
  t: string;                           // ISO del aparato al firmar
  caduca: string;                      // ISO; la propone el aparato y la Mac la recorta (§3.6)
  destino: "mac" | "a1";               // §7.1 de GEN1113: puente:peticiones → a1; lo demás → mac
  chat: string;                        // id canónico (p. ej. "genesis", "telegram.<usuario>"); [REV] la Mac comprueba que cuadra con entrada.fuente (§3.5)
  chatNombre: string;                  // [REV] el nombre que la persona VIO en la cabecera al escribir (1..80); la Mac lo compara con canon.json
  entrada: EntradaChat;                // la de GEN1113 §7.1 y §13, entera, con su nonce y con entrada.v === 1 [REV]
}
```

**[REV] Acciones nuevas dentro de `entrada`** (la puerta las acepta en `validarEntrada` con estas formas exactas; van
siempre con `fuente: "direccion"` y `destino: "mac"`, `chat: "genesis"`):

- `{v:1, nonce, t, fuente:"direccion", accion:"revocarme"}`;
- `{v:1, nonce, t, fuente:"direccion", accion:"revocar-aparato", huella: "<64 hex>"}`: solo dueño (403 `solo-dueno` en la
  puerta); en la Mac, solo si la huella es de la **misma cuenta**.

**[REV] Cómo saca el cliente cada campo** (para que E y F no lo inventen cada uno): `cuenta` = `sub` del JWT que devuelve
`sesion()` (decodificado sin verificar, es la sesión propia); `destino` = `destinoDe(entrada.fuente)`; `chat` y
`chatNombre` los pasa el componente que tiene el hilo abierto (`HiloDireccion`/`HiloPuente`), sacados de
`chatDeFuente(catalogo, fuente)` o, para la dirección con un solo canal, de `genesis.canal.<canal>`; sin catálogo, el id
fijo de `ALIAS_GEN1113` y la etiqueta provisional que se ve en pantalla.

**[REV] La relación entre fuente y chat es fija en el código**, no la da el catálogo: `direccion` → `genesis` o
`genesis.canal.<c>` con `c` en `entrada.canales`; `puente:hermes-avisos` → el chat cuyo alias incluye
`puente:hermes-avisos` **en el `canon.json` de la Mac** (no en el catálogo que sirve la puerta); igual para los otros dos.
Así un catálogo falso puede cambiar lo que se ve, pero la Mac rechaza la entrada si el id o el nombre no cuadran.

Como se firman bytes opacos:

- la puerta **no puede** normalizar nada sin romper la firma;
- no hace falta JSON canónico entre lenguajes;
- la Mac usa **solo** lo que viene dentro de la carga. Lo que la puerta añade (`cuenta`, `rol`, `recibido`) sirve para
  comprobar que cuadra, nunca para decidir.

### 3.5 Dónde se comprueba y en qué orden

**1. La puerta** (`chats-genesis-firma.mjs`). La puerta no es de confianza: solo comprueba la forma y los límites, para
contestar pronto y para no guardar basura.

- **`v: 1`** → 400 `sin-firma` («Este aparato no está emparejado para escribir»).
- **[REV] Tamaño.** El tope de 16 KB de GEN1113 (`crearEntrada`, 413 `grande`) pasa a **48 KB para v2** (la carga en
  base64url de un texto de 8.000 caracteres no ASCII pasa de 16 KB) y `carga` decodificada ≤ 32 KB. `servidor.mjs` ya
  acepta cuerpos de hasta 64 KB (LEÍDO, `servidor.mjs:60`).
- **`v: 2`.** Comprueba:
  - las tres formas, y que `carga` se decodifica a un JSON válido;
  - `aud`;
  - `carga.cuenta === sub` del JWT; si no → 403 `firma-cuenta`;
  - `carga.aparato === aparato`;
  - que `carga.destino` corresponde a `carga.entrada.fuente`;
  - `validarEntrada(carga.entrada)`, la de GEN1113 ampliada **solo** con las dos acciones de retirada de §3.4 [REV];
  - [REV] `carga.chat` con la forma de id y `carga.chatNombre` de 1 a 80 caracteres (la puerta no sabe si cuadran: eso
    lo comprueba la Mac);
  - las reglas de rol de §4.2 de GEN1113 sobre `carga.entrada`;
  - que `t` no pase de la hora de la puerta + 5 min y que `caduca` sea posterior a ahora;
  - el nonce único (`carga.entrada.nonce`).
- **Guardado y entrega.** Guarda `carga`, `firma` y `aparato` **tal cual** en `genesis_entradas`, en columnas nuevas, y
  los entrega así al destino.
- **Lo que no hace.** No verifica la firma: no tiene por qué saber qué claves valen, y si las supiera tampoco cambiaría
  nada.

**2. La Mac** (`genesis_chats_puerta.py`, antes de cualquier otra comprobación de GEN1113). Usa
`comprobar_entrada_firmada()` de `genesis_firma_logica.py`, en este orden, y se para en el primer fallo:

1. Si falta `v:2`, `carga`, `firma` o `aparato` → `sin-firma`. [REV] **No hay ninguna opción, variable ni archivo que
   haga aceptar `v:1`**; una prueba lo comprueba buscando en el código.
2. El `aparato` tiene que estar en la lista de altas (de root, §3.3); si no → `aparato-desconocido`. Si está en
   `aparatos-retirados.json` → `aparato-revocado`.
3. Verificar ECDSA P-256 sobre los **bytes** decodificados de `carga` con la SPKI guardada; si falla → `firma-mala`.
   [REV] Después, y **solo** después, `json.loads` de **esos mismos bytes** (nunca de otra copia) da la carga; si no es un
   objeto → `firma-mala`.
4. Ya dentro de la carga, que cuadren:
   - `aud` → si no, `aud`;
   - `carga.aparato` con `aparato` → si no, `firma-mala`;
   - `carga.cuenta`, la cuenta del aparato en la lista y la `cuenta` que dice la puerta → si no, `cuenta-distinta`;
   - `carga.destino` con este destino → si no, `destino`;
   - [REV] `carga.chat` con `carga.entrada.fuente` según la relación fija de §3.4, usando el `canon.json` local (el A1, su
     `chat-a1.json`) → si no, `chat-distinto`;
   - [REV] `carga.chatNombre` igual al `nombre` de **ese** chat o a uno de **sus** `alias` (tras quitar caracteres de
     control y de dirección bidi) → si no, `nombre-distinto` («El nombre del chat que viste no es el de la Mac; puede que la
     puerta mostrara uno falso. No se ejecutó nada»). Sin `canon.json` (la Mac aún no lo sembró) se aceptan solo los alias
     fijos de `ALIAS_GEN1113`. [INT] Con los ids provisionales `telegram.<clave>` y, para un canal, el nombre de
     `CANALES` (§14.1).
5. Plazos:
   - `t` posterior a la hora de la Mac + 300 s → `futuro`;
   - ahora posterior a `caduca` recortada (§3.6) → `caducada`.
6. [REV] **Riesgo y nivel.** `riesgo_de_entrada(carga.entrada)` (§3.6) es `bajo` o `alto`. Si es `alto` y el aparato es
   de nivel `texto` → `nivel` («Este aparato solo puede escribir texto en el hilo; para poner agentes a trabajar, emparéjalo
   como completo en la Mac»). Además, un aparato no puede pasar de 20 entradas `alto` por hora → `limite`.
7. Repeticiones [REV]:
   - el par `aparato:seq` ya visto → `seq-repetido`;
   - el par `carga.cuenta:carga.entrada.nonce` ya visto → `nonce-repetido`.

   Los dos se guardan en `vistos.json` **8 días** (más que la caducidad máxima, 7 días + 5 min de adelanto): así nada que
   siga vigente puede salir de la lista. Ya **no** se exige que `seq` suba: la puerta y dos pestañas pueden desordenar, y lo
   que impide repetir es la lista de vistos más la caducidad.
8. Con la carga ya probada, la validación de GEN1113 (`validar_entrada`). [REV] Se le pasa este objeto, y ningún otro:
   `dict(carga["entrada"], id=<id de la puerta>, cuenta=carga["cuenta"], rol=<rol de la puerta>, recibido=<recibido de la
   puerta>, destino=carga["destino"])`. El `rol` de la puerta solo puede **bajar** el rol (`rol_efectivo` toma el menor
   con `cuentas.json`); `recibido` solo puede adelantar la caducidad (la del paso 5 manda). `plan_de_entrada` recibe el
   mismo objeto con `rol` = el **efectivo**.
9. Antes de ejecutar, se anotan `aparato:seq` y el nonce. Después se ejecuta y se acusa (GEN1113 §5.2). Las acciones
   `revocarme`/`revocar-aparato` no pasan por `validar_entrada`: escriben en `aparatos-retirados.json`, avisan a la puerta,
   publican una línea en el hilo («Se retiró el aparato «X» desde «Y»») y disparan `llevar-a1`.

**3. El A1** (`peticiones_puerta.py`). Las mismas funciones (importa `genesis_firma_logica.py` del mismo checkout) con su
propia lista de altas, `aparatos-retirados.json`, `chat-a1.json`, `vistos.json` y `destino = "a1"`. [REV] Mientras el bot
del A1 corra la copia suelta que no es la del repo (§12), **nada de esto existe en el A1**: ver la fase 1b de §7.

### 3.6 Repeticiones y caducidad

- **Contador.** [REV] `seq` es **único** por aparato, no creciente: cada verificador guarda los `aparato:seq` vistos 8 días
  (§3.5, paso 7). La versión anterior («estrictamente creciente») rechazaba envíos legítimos cuando dos pestañas o la red
  los desordenaban, y obligaba a reservar el número dentro de una transacción de IndexedDB que no sobrevive a la firma.
  La puerta puede **retrasar**, **reordenar** o **tirar**; no puede **repetir** ni **cambiar**.
- **Nonce.** Se guarda **8 días** [REV] (GEN1113 lo guardaba 7, y una carga podía seguir vigente hasta 5 min más).
- **[REV] Riesgo.** `riesgo_de_entrada(entrada)`, igual en Python (`genesis_firma_logica.py`) y en TS (`firma-aparato.ts`),
  con la misma tabla de pruebas:

  | `bajo` (no despierta a ningún agente) | `alto` (despierta un agente o cambia algo) |
  |---|---|
  | dirección `decir` a `mando` sin `modelo` (plan `chat-hilo`) | dirección con `modelo` o con otro canal; `responder`; `reenviar` |
  | puente A: órdenes `estado`, `olas`, `cola`, `puertas`, `agentes`, `ayuda` | puente A: **texto suelto (va a Hermes, que tiene herramientas en la Mac)**, `decir`, `a`, `aprobar`, `rechazar`, `soltar`, `reasignar` |
  | puente B: `estado`, `ayuda` | puente B: texto suelto (una petición que trabajan agentes), `encargos`, `pausa`, `sigue`, `cancela` |
  | `revocarme`, `revocar-aparato` | cualquier otra cosa (por defecto, `alto`) |

  El `cambia()` de GEN1113 dejaba el texto a Hermes y `/a` como «mensaje», con 7 días de vida: una puerta podía guardar una
  instrucción a un agente con herramientas y soltarla días después. Ya no.
- **Caducidad.** La Mac la recorta: `caduca_efectiva = min(carga.caduca, t + límite, recibido + límite)`, donde:
  - [REV] el límite es **1.800 s** para todo lo `alto`;
  - y **7 días** para lo `bajo`, que es la retención de la puerta.

  Un aparato no puede alargarla.
- **Reloj del aparato.** Uno adelantado más de 5 min ve sus entradas rechazadas con «La hora de este aparato va adelantada;
  corrígela y vuelve a enviar». [REV] Uno **atrasado** más de 30 min ve sus órdenes `caducada` al llegar; para que no sea un
  misterio, el cliente compara su hora con la cabecera `Date` de cada respuesta de la puerta y, si difieren más de 2 min,
  lo dice antes de enviar («La hora de este aparato difiere N min; las órdenes pueden caducar»). La puerta no es de
  confianza para esto: solo sirve de aviso.

### 3.7 Revocación

| Quién | Cómo | Efecto |
|---|---|---|
| Alex en la Mac | `genesis_aparatos.py revocar <código \| huella8 \| nombre>`, que pide confirmar con el código. Después, `llevar-a1` (lo hace solo) | [REV] Se añade a `aparatos-retirados.json` con la fecha (sin contraseña: retirar solo quita poder). La lista de root **no se toca**: el registro necesita saber quién fue. Se avisa a la puerta (`resultado` con `revocado`) |
| El propio aparato | «Olvidar este aparato» en Genesis: firma una entrada `accion: "revocarme"` y **después** borra su clave de IndexedDB | La Mac la atiende sin preguntar, porque retirarse a uno mismo no da poder a nadie |
| Otro aparato emparejado **de la misma cuenta dueña** | «Retirar otro aparato» (por ejemplo, un móvil perdido): entrada firmada `accion: "revocar-aparato", huella` | La Mac la atiende. Lo peor que puede hacer un aparato robado con esto es retirar otros (negación de servicio), nunca añadir uno |
| Nadie a distancia | **Añadir** un aparato | Solo `emparejar` en la Mac, con la contraseña de administrador [REV] |

**[REV] Lo que ya está en cola al retirar.** La comprobación se hace al **procesar**, no al recibir: todo lo que el aparato
firmó y espera en la puerta se rechaza con `aparato-revocado` en cuanto la Mac lo lee, aunque se firmara antes. En el A1
vale lo mismo **desde que le llega la lista** (`llevar-a1`); hasta entonces, un aparato perdido puede seguir escribiendo
en el puente B. Por eso la Mac la lleva sola y el acuse de la retirada dice si llegó al A1 («Retirado en la Mac; en el A1
desde HH:MM» o «aún no en el A1: reintentando»).

**[REV] Aparato perdido o robado.** Quien lo tenga desbloqueado puede, hasta que se retire: escribir con su nivel, y
retirar los demás aparatos de Alex (con `revocar-aparato`), dejándole sin aparato con que retirarlo a distancia. Entonces
la retirada se hace en la Mac (doble clic en «Retirar aparato.command», que B añade igual que el de emparejar). Cada
retirada queda en el hilo, así que Alex la ve en cualquier medio.

Con el aparato revocado, su siguiente entrada vuelve con «Este aparato fue retirado en la Mac el 13-11 a las 14:02. Para
volver a escribir, emparéjalo de nuevo».

### 3.8 Qué puede hacer un aparato sin emparejar

- **Lee** lo que su cuenta y su rol permiten (GEN1113 §4.2): el feed, el catálogo y los acuses.
- **No escribe.** El compositor se sustituye por la tarjeta «Este aparato aún no puede escribir» (§3.9) y no se envía nada.
- **Si lo intenta igual** (`curl` o una versión vieja): la puerta responde 400 `sin-firma`, y la Mac y el A1 rechazan.

### 3.9 Lo que ve la persona en cada paso

| Momento | Lo que dice la interfaz (español, sin cortar en 360 px) |
|---|---|
| Sin emparejar | «Este aparato puede leer, pero aún no escribir. Para escribir, emparéjalo en tu Mac: solo se hace una vez y con la Mac delante.» Botón «Emparejar este aparato» |
| Navegador sin WebCrypto o sin IndexedDB (navegación privada de algunos navegadores) | «Este navegador no puede guardar una clave propia (¿ventana privada?). Abre Genesis en una ventana normal o en la app.» |
| Solicitud enviada | Código grande `ABCD-EFGH-JKLM`, nombre del aparato, `cuenta8` [REV] y «En tu Mac, haz doble clic en «Emparejar aparato» del Escritorio (o, en una terminal: `python3 scripts/puente/genesis_aparatos.py emparejar`). Te pedirá este código y la contraseña de la Mac. Esperando desde las 14:02 (caduca a las 14:17).» |
| Caducada | «La solicitud caducó a las 14:17 sin confirmarse en la Mac. Pide otra.» |
| Emparejado | «Emparejado en la Mac a las 14:05 (según la puerta del A1). Escribe con la clave de este aparato · código ABCD-…» |
| La Mac rechaza la primera entrada por `aparato-desconocido` | «La Mac no conoce este aparato: el emparejamiento no llegó a hacerse. Vuelve a emparejarlo.» |
| Cada mensaje enviado | La marca «firmado · ABCD» junto a «vía Genesis en Astraura» |
| Rechazos (`detalle` del acuse) | `firma-mala` «La firma no cuadra: la entrada se cambió por el camino; no se ejecutó nada». `seq-repetido`/`nonce-repetido` «Esta entrada ya se había recibido; no se ejecutó otra vez». `caducada` «Caducó sin ejecutarse…». `futuro` (§3.6). `aparato-revocado` (§3.7). [REV] `nivel`, `chat-distinto`, `nombre-distinto` (§3.5) |
| [REV] Aparato de nivel `texto` en un hilo donde escribir despierta a un agente (puente A, puente B, dirección con motor) | El compositor solo ofrece lo `bajo` y dice: «Desde este aparato solo puedes escribir texto en el hilo y pedir el estado. Para hablar con Hermes, aprobar tareas o pedir trabajo, emparéjalo como completo en la Mac.» |
| [REV] Antes de enviar algo `alto` | Una línea fija, del código y no del catálogo: «Va a <descripción fija de la fuente> (p. ej. «Hermes, que puede usar herramientas en tu Mac»)», junto al nombre del chat |
| Clave perdida (datos del sitio borrados, iOS los vació) | «La clave de este aparato ya no está (se borraron los datos del sitio el …). Empareja de nuevo; el aparato viejo queda retirado en la Mac cuando lo revoques.» La fecha es la última vez que se vio la clave, guardada en `localStorage` |

### 3.10 Qué se registra

- **Mac**, `registro.jsonl`. Los campos de GEN1113 más:
  - `aparato8`;
  - `firma`: `ok` o el motivo;
  - `seq`.

  Nunca la carga, la firma ni el texto.
- **Mac**, el registro propio de `aparatos.json` en `~/.starseed/genesis-chats/aparatos.log` (solo añadir). Cada
  `emparejado`, `codigo-distinto`, `revocado` y `revocarme` con `t`, `aparato8`, `cuenta8` y el nombre.
- **A1.** Lo mismo en su registro de peticiones.
- **Puerta.** Lo de siempre (ruta, código, `cuenta8`, ms) más los códigos nuevos: `sin-firma`, `firma-cuenta`,
  `solicitud-limite`.

### 3.11 Lo que esta firma NO protege (dicho tal cual)

1. **Un aparato emparejado comprometido**, o **la web publicada comprometida** mientras está abierta en un aparato
   emparejado (despliegue ajeno en Vercel, dependencia maliciosa, XSS).
   - Ese código puede **pedir firmas** a la clave sin exportarla, y en la fase 1 la firma es silenciosa.
   - [REV] **Esto incluye a cualquier persona que pueda publicar la web**: una cuenta de desarrollador con permiso para
     llevar código a main (que se despliega solo) o a Vercel puede publicar un JavaScript que, en la siguiente carga de
     la página en el móvil de Alex, firme lo que quiera con su clave. Con un aparato de nivel `completo` eso es hablar a
     Hermes, que tiene herramientas en la Mac: **un desarrollador pasaría a controlar la Mac**. Por eso el nivel por
     defecto es `texto` (§3.3) y solo Alex, en la Mac, da `completo` sabiendo esto. La fase 2 lo cierra con presencia
     (passkey o Touch ID por orden `alta`).
   - [REV] Una sola carga mala de la página basta: no necesita quedarse. Lo que firme mientras está abierta vale
     30 min (`alto`) o 7 días (`bajo`).
   - Lo mitigan en la fase 2:
     - presencia con Touch ID en las apps nativas;
     - passkey en el navegador para las órdenes que cambian algo.
   - Por lo mismo, **el hilo debe mostrar el texto del feed como texto**: nunca HTML que venga de la puerta. Lo vigila una
     prueba de GEN1114F.
2. **La confidencialidad.** La puerta sigue viendo en claro las entradas, el espejo y el catálogo, y la base de Supabase
   sigue sabiendo quién es miembro.
3. **La integridad de lo que se lee.** En la fase 1, una puerta comprometida puede mostrar un feed falso, acuses falsos
   («hecho») o un «emparejado» falso. Fase 2: la Mac firma el espejo, el catálogo y los acuses con su clave (la pública se
   guarda en el aparato al emparejar), y la web los verifica.
4. **El retraso, el bloqueo o el reordenamiento** de entradas por la puerta: es negación de servicio. La firma impide
   repetir y cambiar, no tirar.
5. **La Mac misma.** Si la toman, se acabó: tiene la lista de aparatos y ejecuta.
6. **El camino ssh** de la Mac al A1 para llevar la lista: vale lo que valgan esa clave ssh y el A1.
7. **Telegram.** Los bots siguen autorizando por id de chat (`_autorizado`, `TELEGRAM_SINTESIS_CHAT_ID`) y Hermes con su
   propia configuración. Este contrato no cambia esas vías.
8. **El texto de un desarrollador** emparejado sigue entrando en el historial que leen los modelos. La firma prueba quién lo
   escribió, no que sea inofensivo.
9. **La pérdida de la clave.** Si el navegador borra IndexedDB (Safari sin la web instalada puede hacerlo tras días sin uso),
   hay que emparejar otra vez.
10. [REV] **Los programas que corren en la Mac como Alex.** Hermes, los agentes con herramientas, los IDE, Desktop
    Commander o cualquier guion pueden llamar en local a `/api/mando/director-chat`, escribir en `cuentas.json`,
    `canon.json`, `vistos.json` o `aparatos-retirados.json`, y abrir una terminal falsa. La firma no cambia eso. Lo único
    que se les quita es **añadir aparatos** (lista de root, §3.3). Por eso importa tanto que ningún texto remoto llegue a
    un agente con herramientas sin firma (punto 11).
11. [REV] **Caminos a los agentes que no pasan por la puerta**, y que por tanto esta firma no cierra:
    - el túnel de Cloudflare `com.starseed.mando.tunel` (`tunel-mando.sh`, hacia :9002) y, INFERIDO por su nombre y su
      SOP, `tunel-metagenesis`: por ahí cualquier miembro podía pedir a `hermes` o a `claude-mac` (GEN1113 §4.2,
      INFERIDO). **La fase 1 exige que estén apagados**, y el instalador deja de encender `com.starseed.mando.tunel` solo
      (GEN1114C, hecho de operaciones 2: lo volvía a cargar aunque Alex lo hubiera apagado). Mientras uno esté encendido,
      la pestaña Genesis no dice «firmado» como si fuera la única vía: `--estado` de la Mac lo avisa («hay un túnel abierto
      a la Mac: la firma no lo cubre»);
    - Telegram (punto 7);
    - el texto que escribe un desarrollador emparejado en el hilo (punto 8): queda en el historial que leen los modelos
      cuando Alex los despierta, y puede intentar darles instrucciones. Se marca `rol: agente`, autor `genesis-web-…`;
    - el bus de la puerta (`/v1/bus/eventos`), que cualquier sesión puede escribir (GEN1113 §5.1): no se pudo determinar si
      algún proceso de la Mac actúa sobre lo que lee de allí (§12).
12. [REV] **Nombres falsos al leer.** En la fase 1 la puerta puede mostrar nombres falsos en el catálogo. Lo que impide
    que eso haga escribir en el chat equivocado es que la carga lleva el id y el nombre que vio la persona y la Mac los
    compara con su `canon.json` (§3.5); lo que se **lee** sigue sin estar protegido (punto 3).
13. [REV] **El A1 hasta la fase 1b.** El bot de peticiones corre una copia suelta distinta del repo (hecho de operaciones
    3). Hasta que se sustituya por el checkout con GEN1114D, el A1 no verifica firmas: el puente B no admite escritura
    (§7, fase 1b). Requisito para ello: **ningún código del A1 lee `/v1/genesis/chats/entrada?destino=a1`** con la copia
    suelta (si la copia tuviera el `peticiones_puerta.py` de GEN1113, aceptaría `v:1` de una puerta tomada). Se comprueba
    en el A1 antes de dar por buena la fase 1a; si no se puede comprobar, se revoca el ámbito `genesis-a1` de la ficha
    `genesis-chats-a1` (el espejo del puente B deja de verse, y se dice).

---

## 4. Parte III · Los mismos chats desde el resto de Astraura

**Regla común.** Todos los sistemas:

- **leen** el mismo catálogo (`canon.ts`), con el rol de la cuenta, y nunca piden el catálogo a otro sitio;
- para **escribir**, o firman con el aparato emparejado en el que está la persona, o dejan un **borrador** que la persona
  firma.
- [REV] **Ningún sistema firma `alto` sin que la persona lo vea en pantalla**: la orbe y la Protomolécula, que corren en
  el aparato y podrían usar su clave, solo firman tras confirmación lo `bajo` (§3.6); lo `alto` siempre pasa por un
  borrador que la persona abre y firma. Los bots y agentes no tienen clave (abajo).
  El «sí» hablado de la orbe no basta para lo `alto` (cualquier audio de la sala puede decir «sí»).
- [REV] **Un borrador se firma tal como se ve.** La tarjeta «Firmar y enviar» muestra el texto **entero** (sin recortes ni
  HTML), el nombre del chat y la descripción fija de la fuente (§3.9), y firma exactamente eso. Los borradores viven en la
  puerta, que puede cambiarlos antes de que Alex los abra: lo que protege es que Alex lee lo que firma, no el borrador.

Ningún bot, agente, orbe, MCP remoto ni ficha externa tiene clave de aparato. Esto es lo que hace «automático» el acceso:
un chat canónico nuevo aparece en todos a la vez porque todos leen el mismo catálogo, y escribir sigue pidiendo una
persona.

**Borradores** (construcción nueva, fase 3):

- **Dónde viven.** Tabla `genesis_borradores` de la puerta: `{id, cuenta, chat, origen, texto ≤ 8.000, propuesta?, t,
  caduca 24 h}`.
- **Quién los crea:**
  - un sistema con la sesión de la cuenta: la orbe sin confirmación, un bot o la Protomolécula;
  - o una ficha externa con el permiso `chats:proponer`: el MCP remoto o la API externa.
- **Dónde se ven.** En Genesis, en cada aparato emparejado de esa cuenta: «Hermes (MCP) propone escribir en «X»: … ·
  Firmar y enviar / Descartar».
- **Lo que no hacen.** Nunca se ejecutan solos.

| Sistema | Qué es hoy (LEÍDO) | Cómo alcanza un chat canónico | Tamaño | Fase |
|---|---|---|---|---|
| **Chats de Astraura** (privados) | `aurora_conversations`, barra `chat-neural-sidebar.tsx`, vínculos de GEN1113 | La carpeta «Genesis» de la barra muestra `nombreDeChat` y el id. Una conversación de Astraura puede **hacerse canónica**: la Mac la registra en `canon.json`, con `meta.chatCanonico` y el medio `astraura` | Adaptador pequeño (la barra, en la fase 1) + nuevo (convertir, en la fase 2) | 1 y 2 |
| **Orbe de voz** | `quantum-orb-bus.ts` (estado), `/api/astraura/conversacion` (solo en local), `asistente.ts` (la orbe de Genesis en la Mac) | La intención «escribe en <nombre o alias>: …» se resuelve con `nombreDeChat` contra el catálogo. **Lee en voz alta** destino y texto y espera un «sí» hablado o un toque. Después firma con el aparato si está emparejado; si no, deja un borrador. «Léeme <chat>» lee los últimos N del feed. **Nunca** da órdenes que cambian algo (`aprobar`…) por voz (D11) | Adaptador (cliente y firma ya existen) + intérprete de la intención (nuevo, pequeño) | 3 |
| **Protomolécula** | `accion-agente.ts` (`[[ACCION: protomolecula {json}]]` → `decidirOperacion`, deshacer por autor), `registro-atomos`, `permisos.ts` | Un **átomo `chat-genesis`** cuyos `Parametro` son los campos de `ConfigChat` y `ContextoChat`. Cada operación se convierte en una propuesta `configurar` (§2.5): firmada si la hace la persona, borrador si la hace un agente. Crear un chat nuevo pasa por ProtoGenesis (`protogenesis.md`) | Nuevo (el átomo) sobre una puerta que ya existe | 3 |
| **Medios de IA externos**: MCP remoto `/api/mcp/genesis` y API externa `/api/externos/v1` | Fichas por ámbito (`tokens-externos`, `ssk_…`). Herramienta `chat` **falsa** (dice que envía y no envía) | Herramientas nuevas: `chats_listar` (catálogo), `chat_leer` (feed, con el permiso `chats:leer`) y `chat_proponer` (borrador, con `chats:proponer`). La herramienta `chat` actual pasa a decir la verdad: «Aún no envía: deja un borrador» (y desde la fase 3, lo deja). Nunca escriben directo | Adaptador mediano (rutas existentes + lectura de la puerta) | 3 (la herramienta `chat` se corrige antes, §10) |
| **IDE locales** (Claude Code, Codex, Hermes, Antigravity) | `mcp_director.py` (proceso en la Mac) | Herramienta nueva `director_chats` (el registro, desde `canon.json` en local), y argumento `chat` (id canónico o alias) en `director_leer` y `director_decir`. Son locales a la Mac, que es la frontera de confianza, así que no firman | Adaptador pequeño | 2 |
| **Capas de conciencia** | `capas-conciencia.ts` (`PreferenciaCapas`, global por cuenta), `capas/planificador.ts` | `ConfigChat.capas`, si existe, **sustituye** a la preferencia global cuando Astraura contesta dentro de ese chat. El planificador lo recibe ya resuelto. No afecta a los motores de la Mac (Claude, Hermes), que no usan capas | Adaptador mediano (hay que pasar el chat hasta donde se resuelven las preferencias) | 3 |
| **Personalidades** | `personalities.ts` (`Personality`), `personalidad-adaptable.ts`, `directiva-bot.ts` | `ConfigChat.personalidad`. Con Astraura, se usa como `persona` de la conversación. Con un motor de la Mac, su directiva entra como prefijo de `contexto.instrucciones`. Esto lo hace la Mac al entregar (el cartero), nunca la web | Adaptador mediano | 3 |
| **Bots y orbes** | `astraura-bots/tipos.ts` (`Bot`), `permisos.ts#decidirAccion`, `acciones.ts` | `Bot.chats?: string[]` (pertenencia). Acción nueva `chat.escribir` con riesgo `alto`: pide confirmación y acaba en borrador, porque el bot no tiene aparato. En una entidad democrática, la pertenencia es una propuesta (`decidirConfiguracion`) | Nuevo (pequeño) | 3 |
| **Biblioteca** | `library/packages.ts` (`PackageKind`), `install.ts` (`/install` con confirmación) | `PackageKind` nuevo, `"chat-plantilla"`: `ConfigChat` + `ContextoChat` **sin** `medios`, `refs`, ids ni permisos. Al instalarlo se crea un chat nuevo de Genesis o PoliGenesis (fase 2 de GEN1113), **nunca** un puente. Los chats de MetaGenesis no se pueden publicar como plantilla | Nuevo (pequeño o mediano) | 3 |
| **Demás puertas de la fusión** (Juicio, Recordar, Alcance) | `astraura-multicapas-fusion.md`, `alcance-memoria.ts` | `contexto.memorias` apunta a cápsulas dentro del alcance del chat. Recordar las busca con el alcance de quien pregunta, y nada sube de alcance | Adaptador pequeño | 3 |

---

## 5. Modelo de datos y migración

### 5.1 Tipos (TS en `src/lib/chats-genesis/canon.ts`, PURO; Python con los mismos nombres de campo)

```ts
export type TipoChatCanonico = "direccion" | "canal-director" | "puente-telegram" | "astraura";
export type MedioChat =
  | "mac-direccion" | "claude" | "codex" | "hermes" | "antigravity" | "ide" | "terminal"
  | "telegram" | "a1-peticiones" | "genesis-web" | "astraura";
export type EstadoNombre = "igual" | "distinto" | "sin-comprobar" | "no-se-puede";

/** Lo que viaja (catálogo). Nada de ids nativos, tokens, rutas ni `refs`. */
export interface MedioPublico {
  medio: MedioChat;
  nombreEnMedio: string | null;      // ≤ 80
  estadoNombre: EstadoNombre;
  comprobado: string | null;         // ISO de la última comprobación
  huella: string | null;             // ^[0-9a-f]{8}$ = HMAC-SHA256(sal, id nativo)[:8]
  usuario?: string;                  // "@bot", solo puentes y solo para el dueño (la puerta lo quita al resto)
}
export interface ChatCanonicoPublico {
  v: 2;
  id: string;                        // ^[a-z0-9][a-z0-9._-]{1,62}$
  nombre: string;                    // 1..80
  nombreProvisional: boolean;        // true mientras un puente no se haya descubierto
  tipo: TipoChatCanonico;
  padre?: string;                    // genesis.canal.* → "genesis"
  fuente: FuenteEspejo | null;       // clave de transporte de GEN1113 (direccion, puente:*), null si no tiene
  alias: string[];                   // ≤ 20
  medios: MedioPublico[];            // ≤ 16
  config?: ConfigChat;               // fase 2
  contexto?: Pick<ContextoChat, "fijados" | "resumen">;   // fase 2; `instrucciones` NO viaja a la web en la fase 2 salvo al dueño
  version: number;                   // sube con cualquier cambio del registro
  actualizado: string;               // ISO
}
export interface CatalogoCanon { v: 2; chats: ChatCanonicoPublico[]; version: number; t: string }

export interface ConfigChat {
  descripcion: string;
  modeloPorDefecto: string | null;
  canalesPorDefecto: CanalId[];
  personalidad: { tipo: "aurora" | "bot"; id: string } | null;
  capas: PreferenciaCapas | null;
  memoria: { activa: boolean; alcance: AlcanceMemoria };
  avisos: { silencio: boolean; resumen: "nunca" | "diario" };
  bandejas: Bandeja[];
}
export interface ContextoChat {
  instrucciones: string;
  fijados: string[];
  memorias: string[];
  resumen: { texto: string; t: string; por: string } | null;
}
export interface VersionCampo { n: number; t: string; por: string }   // por = "<medio>:<aparato8|cuenta8|mac>"

export const ALIAS_GEN1113: Readonly<Record<string, { fuente: FuenteEspejo; etiqueta: string }>>;
export function nombreDeChat(cat: CatalogoCanon | null, clave: string): { nombre: string; id: string | null; provisional: boolean };
export function chatDeFuente(cat: CatalogoCanon | null, f: FuenteEspejo): ChatCanonicoPublico | null;
export function catalogoValido(x: unknown): CatalogoCanon | null;   // tolerante; nunca lanza
```

**En la Mac.** `canon.json` es `CanonChats = { v: 2, chats: ChatCanonico[], version, actualizado }`, donde
`ChatCanonico = ChatCanonicoPublico + { refs: RefMedio[]; versiones: Record<string, VersionCampo>; permisos?: … }`. Cada
`RefMedio` es `{medio, clave}` con **nombres** de variables o de claves:

- `{"medio":"telegram","clave":"TELEGRAM_SINTESIS_CHAT_ID"}`;
- `{"medio":"claude","clave":"chats.json:entornos.claude"}`.

**Lista de altas** [REV] (Mac: `/Library/Application Support/StarSeed/genesis-aparatos.json`, root, 644, solo la
escribe `emparejar` con sudo; A1: `~/.starseed/peticiones/aparatos.json`, 600, del usuario del servicio):

```json
{"v": 1, "aparatos": [{"huella": "<64 hex>", "spki": "<base64url>", "cuenta": "<uuid>", "nombre": "…", "plataforma": "navegador|app-nativa", "nivel": "texto|completo", "alta": "<ISO>"}]}
```

**`aparatos-retirados.json`** [REV] (Mac: `~/.starseed/genesis-chats/`, 600; A1: `~/.starseed/peticiones/`, 600):
`{"v": 1, "retirados": [{"huella": "<64 hex>", "t": "<ISO>", "por": "mac|aparato:<huella8>"}]}`. Solo crece.
[INT] En la Mac, además, `/Library/Application Support/StarSeed/genesis-aparatos-retirados.jsonl` (una fila por
línea, de Alex, 600, marca `sappnd`): §14.3.

**`vistos.json`** [REV] (Mac y A1; sustituye a `seq.json`, que ya no existe): las claves `aparato:<huella>:<seq>` y
`<cuenta>:<nonce>` con `{"t": <época>}`, podadas a 8 días.

**`chat-a1.json`** [REV] (solo A1, lo lleva `llevar-a1`): `{"v": 1, "id": "telegram.<…>", "nombre": "…", "alias": [...]}`.

### 5.2 Puerta (SQLite del A1, solo añadir)

- **`genesis_entradas`.** Columnas nuevas `carga TEXT`, `firma TEXT` y `aparato TEXT` (NULL en las filas viejas).
  `EntradaRecibida` v2 = `{id, cuenta, rol, destino, recibido, v: 2, carga, firma, aparato}`. [REV] En las filas v2,
  `nonce` = `carga.entrada.nonce` (sigue el `UNIQUE (cuenta, nonce)`), `datos` = la entrada validada (solo uso interno de
  la puerta; **no** se entrega) y `cambia` = `riesgo_de_entrada === "alto"`, para que la puerta caduque a los 30 min lo
  mismo que la Mac. Lo entregado no lleva los campos de `datos` en primer nivel: el verificador no tiene otra copia que
  la carga.
- **`genesis_aparatos_solicitudes`.** Columnas `id INTEGER PK`, `cuenta`, `spki`, `nombre`, `plataforma`, `t`, `caduca`,
  `estado ∈ {pendiente, emparejado, rechazado, caducada, revocado}`, `huella`, `resuelto`, `nivel` [REV]. Retención: 30
  días. [REV] La puerta guarda la `huella` que ella calcula de la SPKI; la Mac no se fía de ella y la recalcula.
- **`genesis_canon`.** Una sola fila: `catalogo TEXT` (≤ 64 KB), `version INTEGER` y `t`.

### 5.3 Migración, en orden y sin pérdidas

1. **Puerta (A).** Las tablas y columnas son añadidas, y las filas v1 se quedan. Deshacer: desplegar la versión anterior;
   las columnas sobrantes se ignoran.
2. **Mac (B, C).**
   - [REV] **Hasta que el servicio de la Mac corra el código de B**, la escritura sigue parada como hoy: no se crea
     `~/.starseed/genesis-chats/cuentas.json` (sin él, el `genesis_chats_puerta.py` de GEN1113 no ejecuta nada). Crear la
     lista antes de B devolvería el hallazgo abierto de GEN1113INT (la Mac aceptaría `v:1` de una puerta tomada).
   - `canon.json` no existe → `genesis_canon.py descubrir --aplicar` lo siembra.
   - `aparatos.json` no existe → con lista vacía, nada se ejecuta. Es el mismo comportamiento que hoy con la escritura
     parada: no se pierde capacidad.
   - [REV] **Deshacer B** = primero apartar `cuentas.json` (`genesis_chats_puerta.py cuentas --quitar`), después volver al
     código anterior. En el orden contrario se reabre `v:1`.
3. **Web (E).** `migrarPrefsChatsGenesis` lee la v1 y escribe la v2 (§2.6) solo cuando hay algo que guardar, en un parche
   de `mergeUserPrefs`. Una v1 escrita por un aparato todavía viejo se vuelve a migrar.
4. **A1 (D).** Sin `aparatos.json` no atiende nada de Genesis; es el mismo comportamiento que hoy sin `cuentas.json`.

---

## 6. Seguridad (resumen operativo)

| Quién | Lee | Escribe | Dónde se comprueba | Qué se registra | Lo que ve cuando falta |
|---|---|---|---|---|---|
| Sin sesión | nada | nada | puerta (401) | ruta y código | «Inicia sesión para ver los chats de Genesis» |
| Cuenta sin MetaGenesis | nada de MetaGenesis | nada | puerta (403 `no-miembro`) | `cuenta8` | La línea de GEN1113 §2.3 |
| Desarrollador, aparato sin emparejar | dirección, puente C y catálogo sin A ni B | nada | puerta (`sin-firma`) | `cuenta8` | Tarjeta de §3.9 |
| Desarrollador, aparato emparejado | lo mismo | `decir` al hilo, solo a `mando` | puerta (forma y rol), **Mac** (firma, `cuentas.json` y rol) | `aparato8`, `firma: ok` | «Esta orden solo la puede dar un dueño de MetaGenesis» |
| Dueño, aparato sin emparejar | todo | nada | puerta y Mac | — | Tarjeta de §3.9 |
| Dueño, aparato emparejado | todo | [REV] nivel `texto`: solo lo `bajo` (§3.6); nivel `completo`: todo lo de GEN1113 §4.2 (y el puente B solo desde la fase 1b) | puerta (forma), **Mac** o **A1** (firma, lista y caducidad) | `aparato8`, `seq`, resultado | Acuses de §3.9 |
| Ficha `genesis-chats-mac` / `-a1` robada | las entradas pendientes de su destino (texto, ≤ 7 días) | espejo y catálogo falsos (fase 1); **no puede crear entradas válidas**: no tiene ninguna clave de aparato | puerta (ámbito) | — | Se corta con `ficha revocar` (GEN1113INT) |
| Puerta, SQLite o Supabase tomados | todo lo que pasa por ellos | **nada que la Mac o el A1 acepten**; [REV] sí puede retrasar, reordenar o tirar entradas, mostrar nombres y acuses falsos (lo escrito bajo un nombre falso se rechaza con `nombre-distinto`) y llenar las 3 solicitudes de emparejar de una cuenta | Mac y A1 | `firma-mala`, `aparato-desconocido` | Los rechazos de §3.9 |
| [REV] Quien puede publicar la web (cuenta de desarrollador con acceso a main o a Vercel), o una carga de página comprometida | lo que vea la persona en esa carga | lo que el aparato abierto pueda firmar: con nivel `texto`, solo lo `bajo`; con `completo`, también hablar a Hermes y a los motores | nada lo distingue en la Mac (la firma es buena) | `aparato8` de cada entrada | §3.11.1; fase 2 |
| [REV] Programa local de la Mac (agente con herramientas, IDE) | todo lo de la Mac | todo lo de la Mac **salvo añadir aparatos** (lista de root) | — | — | §3.11.10 |
| Sistemas de Astraura, MCP y API externa | catálogo y feed según su rol o permiso | solo borradores | puerta (rol o permiso de ficha) | origen del borrador | «Propuesto por <origen>: firma para enviarlo» |

---

## 7. Fases

### Fase 1 · GEN1114: nombres e ids reales y escritura firmada desde un aparato

**Objetivo:**

- los 13 chats de §2.1 con su id y su nombre real en:
  - la Mac (CLI y punteros de los IDE);
  - la puerta (catálogo);
  - la web: pestaña Genesis, Conexiones de chat › Telegram, carpeta Genesis de la barra de Chats y cabecera de cada hilo;
  - el bot B (`/estado`, `/ayuda`);
- escritura firmada desde un aparato emparejado, verificada en la Mac y en el A1;
- las entradas sin firma, rechazadas.

**[REV] La fase 1 se enciende en dos pasos:**

- **1a (esta noche):** puerta (A), Mac (B, C), web (E, F). Escritura firmada **solo hacia la Mac** (dirección y puente A).
  El puente B se lee pero **no** se escribe: la pestaña lo dice («Escribir a Peticiones llega cuando el A1 tenga la
  versión nueva») y la puerta (A) rechaza `destino: "a1"` con 403 `destino-cerrado` mientras la variable de la puerta
  `PUERTA_GENESIS_A1_ESCRITURA` no valga `1` (comodidad: lo que protege es que ningún código del A1 lea entradas, §3.11.13).
  Requisitos antes de encender: los túneles a la Mac apagados (§3.11.11) y `cuentas.json` creado **después** de que el
  servicio de la Mac corra B (§5.3).
- **1b (cuando se sustituya la copia suelta del bot de peticiones del A1 por el checkout del repo con GEN1114D):**
  `llevar-a1`, variable de la puerta a `1`, y las comprobaciones 5 y 9 (parte del A1). No se enciende antes, y el informe
  de integración no puede darla por hecha (hecho de operaciones 3).

**[REV] Tiempos.** La página de la sala de control de la Mac tarda unos **15 min** en reconstruirse tras un cambio en main
(hecho de operaciones 4): las comprobaciones de la web en la Mac (3, 7, 12) esperan a que la página nueva esté servida
(mirar la hora del último build en `--estado` o esperar 15 min) antes de dar nada por fallido.

**Comprobaciones que puede hacer una persona** (el conjunto vale cuando pasan todas):

1. En la Mac, `python3 scripts/puente/genesis_canon.py descubrir` imprime los tres bots, cada uno con el nombre de la
   variable, el tipo de chat, el nombre real, el `@usuario` y el id propuesto.
   `python3 scripts/puente/genesis_canon.py descubrir | grep -E '[0-9]{7,}'` no imprime nada.
2. `… descubrir --aplicar` y luego `… estado` listan 13 chats con id y nombre. `ls -l ~/.starseed/genesis-chats/canon.json`
   muestra `-rw-------`.
3. `… subir`. En el móvil, **fuera** del Wi-Fi de la Mac, Genesis muestra los tres puentes con **los mismos nombres** que la
   app de Telegram de Alex. «Información del chat» enseña «Id del chat: telegram.<…>», y Conexiones de chat › Telegram y la
   carpeta Genesis de Chats dicen lo mismo. Ninguna pantalla dice «Hermes y avisos», «Peticiones y encargos» ni «Avisos de
   los directores», salvo con la marca «nombre provisional» si se borra el catálogo de la puerta (y esa también se
   comprueba).
4. Tras `python3 scripts/puente/sincronizar-ides.py`, los tres punteros (`~/.codex/AGENTS.md`,
   `~/.hermes/PUENTE-DE-MANDO.md`, `~/.gemini/antigravity/PUENTE-DE-MANDO.md`) tienen la misma sección «Chats de Genesis»
   con los 13 nombres e ids.
5. En Telegram, `/estado` al bot B empieza con «Este chat: <nombre> · id telegram.<…>».
6. Emparejar, en el móvil:
   - «Emparejar este aparato» muestra el código.
   - En la Mac, `genesis_aparatos.py emparejar` lista la solicitud con su nombre y `cuenta8`.
   - Teclear un código con un carácter cambiado → «El código no coincide», y no queda nada en la lista de altas.
   - [REV] Repetirlo bien → pide la contraseña de la Mac y el nivel; con Intro queda `texto`. El móvil lo dice antes de
     15 s. `ls -l "/Library/Application Support/StarSeed/genesis-aparatos.json"` muestra `-rw-r--r--  root`.
   - `genesis_aparatos.py emparejar` lanzado por ssh se niega. [REV] Lanzado con `script -q /dev/null …` sin contraseña de
     sudo no da de alta nada.
   - [REV] El doble clic en «Emparejar aparato» del Escritorio abre Terminal en esa orden.
7. Desde el móvil emparejado como `texto`: [REV]
   - «Prueba GEN1114 firmada» al hilo (`mando`, sin motor) aparece en `/genesis` de la Mac con «vía Genesis en Astraura»;
     `registro.jsonl` tiene `firma: "ok"` y el `aparato8`; el mensaje lleva «firmado · <código>»;
   - un texto a Hermes (puente A) no se ofrece; forzado con la consola del navegador vuelve `nivel` y Hermes no recibe nada.

   Retirarlo, emparejarlo otra vez como `completo` (clave nueva) y mandar «Prueba GEN1114 firmada» al Director presidente:
   llega y contesta.
8. **Simulación de puerta tomada** (prueba cruzada automática, `test_genesis_firma_cruce.py`, con la puerta real en
   127.0.0.1 y fichas de mentira). Se meten en la cola, con una sesión válida de dueño [REV] y, para simular la puerta
   tomada, **escribiéndolas directamente en su SQLite** cuando la puerta honrada las rechazaría (a, e, h, i); el resto,
   por la ruta normal:
   - (a) una entrada sin firma;
   - (b) una firmada por una clave no emparejada;
   - (c) una carga válida con un byte cambiado;
   - (d) una carga válida repetida;
   - (e) una carga válida de otra cuenta;
   - (f) un `/aprobar` firmado con `t` de hace 31 min;
   - [REV] (g) un **texto a Hermes** firmado con `t` de hace 31 min (antes vivía 7 días);
   - [REV] (h) una carga válida con `chat` del puente B y `fuente: "puente:hermes-avisos"`;
   - [REV] (i) una carga válida con `chatNombre` = el nombre del puente B y `chat`/`fuente` del puente A;
   - [REV] (j) un texto a Hermes firmado por un aparato de nivel `texto`;
   - [REV] (k) la misma carga válida entregada dos veces con **ids de puerta distintos**;
   - [REV] (l) dos cargas válidas del mismo aparato entregadas en orden inverso (`seq` 8 antes que 7): **las dos** se
     ejecutan;
   - [REV] (m) una carga firmada antes de retirar el aparato y entregada después.

   La Mac acusa, en este orden: `sin-firma`, `aparato-desconocido`, `firma-mala`, `seq-repetido`, `cuenta-distinta`,
   `caducada`, [REV] `caducada`, `chat-distinto`, `nombre-distinto`, `nivel`, `seq-repetido` (la segunda), `hecho` y
   `hecho`, `aparato-revocado`. `control-<cola>.json` y `canal.jsonl` no cambian salvo por (l).
9. `genesis_aparatos.py revocar <código>` (o doble clic en «Retirar aparato») [REV]:
   - el siguiente envío del móvil a la dirección vuelve con «Este aparato fue retirado en la Mac el …»;
   - [REV] `aparatos.log` dice cuándo llegó la lista al A1 sin que nadie lance `llevar-a1`;
   - (fase 1b) uno a Peticiones (bot B) vuelve igual, antes de 60 s.
10. Un segundo navegador sin emparejar lo lee todo según su rol y no tiene compositor.
    `curl -X POST …/v1/genesis/chats/entrada` con una entrada v1 → 400 `sin-firma`.
11. Una cuenta con vínculos de GEN1113 guardados (un puente llevado a Chats) los sigue viendo, ahora con el nombre real.
    `prefs.chatsGenesis.v === 2`, los ids de vínculo no cambian y `chatsGenesisDescartado` no crece.
12. Capturas a 360×640 y 1440×900 de: la tarjeta sin emparejar, el código, la espera, emparejado, retirado, la información
    del chat y un nombre de 80 caracteres. Nada cortado y el compositor visible con el teclado abierto.
    `nombre-genesis.test.ts` en verde.
13. Un registro del feed con `<img src=x onerror=…>` se ve como texto en el hilo (prueba de GEN1114F).

### Fase 2 · Configuración y contexto comunes; integridad de lectura; claves de hardware

- Propuestas `configurar` (§2.5), con la edición desde Genesis, desde los IDE (`mcp_director.py`) y desde la CLI.
- Los nombres y el contexto llegan a cada medio (§2.5): punteros, `/genesis` y `CANALES` desde el registro, Telegram con
  `aplicar-nombres` y confirmación.
- La Mac firma el espejo, el catálogo y los acuses. El aparato guarda la clave pública de la Mac al emparejar (la ve en el
  código, que se amplía) y verifica.
- Claves de hardware en las apps nativas (Secure Enclave, Keystore, TPM) con presencia, y passkey en el navegador para lo que
  cambia algo (D5).
- Convertir una conversación de Astraura en chat canónico (`meta.chatCanonico`).
- **Comprobación.** Cambiar la descripción de «GENESIS · StarSeed OS» desde el móvil y verla en los tres punteros y en
  `/genesis` antes de 1 min. Cambiarla a la vez desde el IDE con la misma `base` → uno gana y el otro recibe «Cambió en…».

### Fase 3 · Parte III

- Borradores.
- La orbe (escribir y leer en voz alta).
- El átomo `chat-genesis`.
- MCP remoto y API externa: leer y proponer.
- Pertenencia de bots, capas y personalidad por chat.
- Plantilla de chat en la Biblioteca.
- **Comprobación.** «Escribe en GENESIS: prueba de voz» → lectura en voz alta → «sí» → llega firmado. La herramienta MCP
  `chat_proponer` desde Claude.ai deja un borrador que aparece en el móvil y solo se envía tras «Firmar y enviar». Instalar
  una plantilla crea un chat de Genesis con su personalidad y sus capas.

---

## 8. Interfaces (obligatorias para todos los paquetes)

### 8.1 Puerta (`servicios/puerta-datos/src/`)

| Método y ruta | Quién | Cuerpo / consulta | Respuesta |
|---|---|---|---|
| `POST /v1/genesis/chats/entrada` | sesión + reglas de GEN1113 §4.2 | `EntradaFirmada` (§3.4) | `201 {id, destino, estado:"en-cola"}` · 400 `forma`/`sin-firma` · 403 `no-miembro`/`solo-dueno`/`firma-cuenta`/`destino-cerrado` [REV] · 409 `nonce-repetido` · 413 `grande` (v2: cuerpo > 48 KB o carga > 32 KB [REV]) · 429 `limite` · 503 `rol-sin-comprobar` |
| `GET /v1/genesis/chats/entrada` | ficha del destino | como en GEN1113 | `{entradas: EntradaRecibida[]}` con `v:2, carga, firma, aparato` |
| `POST /v1/genesis/aparatos/solicitud` | sesión + `es_metagenesis` | `{spki: string (base64url, ≤ 200 B decodificada, P-256 SPKI), nombre: string 1..60, plataforma: "navegador" \| "app-nativa"}` | `201 {solicitud: number, caduca: ISO, huella}` · 400 · 403 · 429 `solicitud-limite` (≤ 3 pendientes por cuenta) |
| `GET /v1/genesis/aparatos/solicitudes` | ficha con ámbito `genesis-mac` (la `genesis-chats-mac` [REV]) | — | `{solicitudes: {id, cuenta, spki, nombre, plataforma, t, caduca}[]}` (solo pendientes no caducadas) |
| `POST /v1/genesis/aparatos/resultado` | ficha con ámbito `genesis-mac` (la `genesis-chats-mac` [REV]) | `{solicitud?: number, huella: string, estado: "emparejado" \| "rechazado" \| "revocado", nivel?: "texto" \| "completo"}` [REV] | `{ok}` |
| `GET /v1/genesis/aparatos/estado` | sesión: **solo su cuenta** | `?huella=` | `{estado: "pendiente" \| "emparejado" \| "rechazado" \| "caducada" \| "revocado" \| "desconocido", t: ISO \| null, nivel?: "texto" \| "completo"}` [REV] (informativo: lo dice la puerta) |
| `POST /v1/genesis/chats/canon` | ficha con ámbito `genesis-mac` (la `genesis-chats-mac` [REV]) | `{catalogo: CatalogoCanon}` (≤ 64 KB) | `{ok, version}` · 400 si `catalogoValido` falla o si hay ≥ 7 dígitos seguidos en algún texto, salvo `huella`, `version` y fechas (defensa) |
| `GET /v1/genesis/chats/canon` | sesión + `es_metagenesis`, o ficha con ámbito `genesis-a1` (la `genesis-chats-a1`) | — | `{catalogo: CatalogoCanon \| null}` filtrado por rol (§2.4) |

Funciones exportadas (puras, con pruebas):

- `validarEntradaFirmada(cuerpo, sub, ahora)` → `{carga, entrada}` o lanza `ErrorChats`;
- `validarSolicitud(c)`;
- `filtrarCatalogo(cat, {dueno})`;
- [REV] `riesgoDeEntrada(entrada)` → `"bajo" | "alto"`, con la tabla de §3.6 (copia en `.mjs` de la de Python y TS; las tres
  pruebas usan la misma lista de casos, escrita en cada prueba a partir de esa tabla);
- [REV] `escribirArchivoFichas(ruta, datos)` (ya existe en `fichas.mjs`) pasa a ser **atómica y conservadora**: escribe en
  un temporal **en el mismo directorio**, le pone **el dueño, el grupo y el modo del archivo que sustituye** (si existe;
  si no, `0o640`), hace `fsync` y `rename`. Hecho de operaciones 1: `ficha nueva` ejecutado como root dejaba el archivo de
  root con un modo que el usuario de la puerta no podía leer y rompió todas las fichas de máquina durante 4 min. Prueba:
  con un archivo de dueño/grupo/modo dados, una escritura los conserva (en la prueba se comprueba con `statSync`; el
  cambio de dueño se prueba inyectando `chownSync` cuando la prueba no corre como root).

### 8.2 Mac (`scripts/puente/genesis_firma_logica.py`, PURO salvo `cryptography`)

```python
AUD = "starseed.genesis.chats.v1"
MAX_ADELANTO_S = 300
LIMITE_CAMBIA_S = 1800
LIMITE_MENSAJE_S = 7 * 86400
MOTIVOS = ("sin-firma", "aparato-desconocido", "aparato-revocado", "firma-mala", "aud", "cuenta-distinta",
           "destino", "chat-distinto", "nombre-distinto", "futuro", "caducada", "nivel", "limite",
           "seq-repetido", "nonce-repetido")                                         # [REV] cuatro nuevos
VISTOS_S = 8 * 86400                                                                 # [REV]
RUTA_ALTAS = "/Library/Application Support/StarSeed/genesis-aparatos.json"          # [REV] inyectable en pruebas
# [REV] Firmas nuevas o cambiadas (sustituyen a las de abajo con el mismo nombre):
def codigo_de(huella: str, cuenta: str) -> str                   # §3.3, con los vectores de §3.3
def normalizar_codigo(tecleado: str) -> str | None               # None si hay caracteres fuera de A–Z, 2–7 (tras quitar espacios y guiones)
def riesgo_de_entrada(entrada: dict) -> str                      # "bajo" | "alto" (§3.6); desconocido → "alto"
def chat_cuadra(carga: dict, canon: dict | None) -> str | None   # None si cuadra; si no, "chat-distinto" o "nombre-distinto"
def aparato_valido(huella: str, altas: dict, retirados: dict) -> tuple[dict | None, str | None]   # (fila, motivo)
def comprobar_entrada_firmada(e: dict, altas: dict, retirados: dict, canon: dict | None, vistos: dict,
                              ahora: float, destino: str) -> tuple[bool, str, dict | None]       # (ok, motivo, carga)
def entrada_para_gen1113(e: dict, carga: dict) -> dict           # el objeto exacto del paso 8 de §3.5
def anotar(vistos: dict, carga: dict, ahora: float) -> None      # aparato:seq y cuenta:nonce
# Ya no existen: seqs / seq.json; codigo_de_huella (sustituida por codigo_de).
def b64url_dec(s: str) -> bytes
def huella_de_spki(spki_der: bytes) -> str                       # sha256 hex; exige P-256 válida (si no, ValueError)
def aparatos_validos(crudo) -> dict                              # {"v":1,"aparatos":[…]} tolerante
def verificar_firma(spki_der: bytes, datos: bytes, firma_rs: bytes) -> bool   # nunca lanza
def caduca_efectiva(carga: dict, recibido: float, riesgo: str) -> float       # [REV] por riesgo, no por cambia()
```

`genesis_firma_logica.py` no importa nada del resto del puente (el A1 lo usa solo con `cryptography`). Se ejecuta con el
`python3` de Homebrew en la Mac y con el del sistema en el A1.

CLI `scripts/puente/genesis_aparatos.py`: `pendientes` · `emparejar [--rechazar N]` · `listar` · `revocar <código|huella8|nombre>` · `llevar-a1` · `acceso-escritorio` [REV] · `--estado` (incluye [REV] si hay un túnel a la Mac cargado en launchd y cuándo llegó la última lista al A1).
Archivos ejecutables [REV]: `scripts/puente/Emparejar aparato.command` y `scripts/puente/Retirar aparato.command`.

### 8.3 Mac (`scripts/puente/genesis_canon_logica.py`, PURO; CLI `genesis_canon.py`)

```python
TIPOS = ("direccion", "canal-director", "puente-telegram", "astraura")
def semilla(chats_json: dict, canales: tuple[str, ...], nombres_canal: dict) -> dict      # CanonChats v2 sin puentes descubiertos
def id_telegram(usuario: str) -> str                                                         # "telegram." + minúsculas
def nombre_de_puente(me: dict, chat: dict) -> tuple[str, str]                                # (nombre, tipo_chat): privado → me.first_name; grupo → chat.title
def fusionar_descubierto(canon: dict, puente: str, descubierto: dict, ahora: str) -> dict    # nunca cambia un id existente; anota "distinto"
def migrar_canon(crudo) -> tuple[dict, list]
def catalogo_publico(canon: dict, sal: bytes, ids_nativos: dict) -> dict                     # sin refs; huellas HMAC[:8]
def sin_ids(x) -> bool                                                                       # ningún texto con ≥ 7 dígitos seguidos (salvo huella, version y fechas)
def seccion_punteros(canon: dict) -> str                                                     # markdown «Chats de Genesis»
def limpiar_nombre(s: str) -> str                                                            # [REV] quita controles y marcas bidi (U+202A–202E, U+2066–2069, U+200E/F), recorta a 80
def chat_de_fuente(canon: dict, fuente: str) -> dict | None                                  # [REV] la relación fija de §3.4 (el chat cuya `fuente` es esa)
# [REV] B NO importa este archivo: `chat_cuadra` de B hace la misma búsqueda sobre el formato de canon.json de §5.1
# (campo `fuente` de cada chat + `alias`), porque genesis_firma_logica.py debe funcionar sola en el A1. Las dos pruebas usan
# el mismo canon.json de ejemplo, escrito en el contrato abajo.
```

[REV] `catalogo_publico` **no falla** por un nombre con 7 o más dígitos (un título de grupo con un teléfono): lo sustituye
por el id del chat con `nombreProvisional: true` y lo dice en la salida de `subir`; si no, un solo nombre bloquearía todo el
catálogo con el 400 de la puerta. `semilla`, `fusionar_descubierto` y `catalogo_publico` exigen ids y alias **únicos**
entre chats y que ningún alias de un chat sea el id o el nombre de otro.

[REV] **`canon.json` de ejemplo compartido** (C lo produce con esta forma; B, D, E y F lo usan en sus pruebas; los
usuarios de bot son inventados):

```json
{"v": 2, "version": 1, "actualizado": "2026-11-13T00:00:00Z", "chats": [
 {"v": 2, "id": "genesis", "nombre": "GENESIS · StarSeed OS", "nombreProvisional": false, "tipo": "direccion", "fuente": "direccion", "alias": ["direccion", "mando"], "medios": [], "version": 1, "actualizado": "2026-11-13T00:00:00Z", "refs": [], "versiones": {}},
 {"v": 2, "id": "genesis.canal.hermes", "nombre": "Hermes", "nombreProvisional": false, "tipo": "canal-director", "padre": "genesis", "fuente": null, "alias": [], "medios": [], "version": 1, "actualizado": "2026-11-13T00:00:00Z", "refs": [], "versiones": {}},
 {"v": 2, "id": "telegram.ejemplo_a_bot", "nombre": "Bot A de ejemplo", "nombreProvisional": false, "tipo": "puente-telegram", "fuente": "puente:hermes-avisos", "alias": ["puente:hermes-avisos", "hermes-avisos", "Hermes y avisos"], "medios": [], "version": 1, "actualizado": "2026-11-13T00:00:00Z", "refs": [], "versiones": {}},
 {"v": 2, "id": "telegram.ejemplo_b_bot", "nombre": "Bot B de ejemplo", "nombreProvisional": false, "tipo": "puente-telegram", "fuente": "puente:peticiones", "alias": ["puente:peticiones", "peticiones", "Peticiones y encargos"], "medios": [], "version": 1, "actualizado": "2026-11-13T00:00:00Z", "refs": [], "versiones": {}},
 {"v": 2, "id": "telegram.ejemplo_c_bot", "nombre": "Bot C de ejemplo", "nombreProvisional": false, "tipo": "puente-telegram", "fuente": "puente:avisos-directores", "alias": ["puente:avisos-directores", "avisos-directores", "Avisos de los directores"], "medios": [], "version": 1, "actualizado": "2026-11-13T00:00:00Z", "refs": [], "versiones": {}}
]}
```

CLI: `descubrir [--aplicar]` · `estado` · `subir` · `aplicar-nombres --telegram` (fase 2; en la fase 1 solo muestra lo que cambiaría).

Los nombres de canal se leen de `chat-director-tipos.ts` con una expresión regular sobre `CANALES` (como hace la prueba que
ya compara el orden con `director_chat.py`). Si no se pueden leer, se usa el id del canal y `nombreProvisional: true`.

### 8.4 Web (`src/lib/chats-genesis/`)

```ts
// firma-aparato.ts (adaptador; IndexedDB y WebCrypto inyectables para las pruebas)
// [REV] `cuenta` (la de la sesión con que se creó la clave) y `nivel` (lo que dijo la Mac; mientras no se sepa, "texto").
// El nivel local solo decide qué ofrece el compositor: quien decide de verdad es la Mac.
export interface AparatoLocal { huella: string; codigo: string; cuenta: string; nombre: string; creado: string; seq: number;
  nivel: "texto" | "completo";
  estado: "sin-emparejar" | "pendiente" | "emparejado" | "revocado"; solicitud?: number; desde?: string; vistoPorUltima?: string }
export function soporteFirma(): Promise<{ ok: true } | { ok: false; motivo: "sin-webcrypto" | "sin-indexeddb" | "contexto-inseguro" }>;
export function aparatoLocal(): Promise<AparatoLocal | null>;
export function crearClaveAparato(nombre: string, cuenta: string): Promise<{ aparato: AparatoLocal; spki: string }>;   // extractable:false [REV] cuenta
// [REV] ctx sin `cambia`: el plazo lo pone riesgoDeEntrada; `chatNombre` es lo que se vio en la cabecera.
export function firmarEntrada(e: EntradaChat, ctx: { cuenta: string; destino: "mac" | "a1"; chat: string; chatNombre: string; ahora: number }): Promise<EntradaFirmada>;
export function olvidarAparato(): Promise<void>;
export function codigoDe(huellaHex: string, cuenta: string): Promise<string>;   // [REV] = codigo_de de Python; vectores de §3.3 (sustituye a codigoDeHuella)
export function riesgoDeEntrada(e: Omit<EntradaChat, "v" | "nonce" | "t">): "bajo" | "alto";   // [REV] tabla de §3.6
export function cuentaDeSesion(jwt: string): string | null;   // [REV] `sub` del JWT propio, sin verificar

// emparejar.ts
export interface ClienteAparatos {
  solicitar(a: { spki: string; nombre: string; plataforma: "navegador" | "app-nativa" }): Promise<{ ok: true; solicitud: number; caduca: string } | { ok: false; estado: number; codigo?: string; error: string }>;
  estado(huella: string): Promise<{ estado: string; t: string | null } | null>;
}
export function crearClienteAparatos(op?: { puerta?: PuertaA1; fetch?: FetchLike }): ClienteAparatos;

// canon.ts: tipos y funciones de §5.1 + cliente
export function crearClienteCanon(op?: { puerta?: PuertaA1; fetch?: FetchLike; almacen?: AlmacenLocal | null }): {
  leer(senal?: AbortSignal): Promise<{ ok: true; catalogo: CatalogoCanon | null } | { ok: false; estado: number; error: string; copia: CatalogoCanon | null }>;
};
```

**Cambios en lo que ya existe** (bloques marcados `// GEN1114E`):

- `puerta-chats.ts › enviar` firma con `firmarEntrada` antes de enviar y manda `EntradaFirmada`. Sin aparato emparejado
  devuelve `{ok:false, estado:0, codigo:"sin-emparejar"}` **sin** llamar a la red. [REV] Firma nueva, con un segundo
  argumento **opcional en el tipo** (para que los componentes de GEN1113 sigan compilando mientras F los cambia) pero
  necesario para escribir: sin él → `{ok:false, estado:0, codigo:"sin-chat"}` sin red.
  `enviar(e: Omit<EntradaChat,"v"|"nonce"|"t">, chat?: { id: string; nombre: string }): Promise<RespuestaEnviar>`.
  `cuenta` sale de `cuentaDeSesion(await sesion())`; si la cuenta de la sesión no es la `cuenta` del aparato →
  `{ok:false, estado:0, codigo:"otra-cuenta"}` sin red («Este aparato se emparejó con otra cuenta»). Si
  `riesgoDeEntrada(e) === "alto"` y el aparato es `texto` → `{ok:false, estado:0, codigo:"nivel"}` sin red. Un reintento
  tras un fallo de red reenvía **la misma** `EntradaFirmada` (mismo `seq` y nonce), nunca una nueva.
- `tipos.ts` añade `EntradaFirmada`, `CargaFirmada` y `VinculoChat.chat?`, y `PrefsChatsGenesis.v: 1 | 2`.
- `vinculos.ts`: `migrarPrefsChatsGenesis` v1 → v2 (§2.6).

### 8.5 Componentes (props exactas)

```ts
// src/components/chats-genesis/emparejar-aparato.tsx
export function EmparejarAparato(props: { clienteAparatos?: ClienteAparatos; alCambiar?: (a: AparatoLocal | null) => void }): JSX.Element;
// src/components/chats-genesis/info-chat.tsx
export function InfoChat(props: { chat: ChatCanonicoPublico | null; claveGen1113: string; esDueno: boolean }): JSX.Element;
// HiloDireccion y HiloPuente (GEN1113) ganan una prop opcional, compatible:
//   aparato?: AparatoLocal | null   → sin emparejar, el compositor se sustituye por <EmparejarAparato/>
//   [REV] y `catalogo?: CatalogoCanon | null`: el hilo saca de ahí `chat` y `chatNombre` para `enviar` (§3.4) y muestra,
//   junto al nombre, la descripción FIJA de la fuente (const `DESTINO_DE_FUENTE` en alias-gen1113.ts, de E), nunca del catálogo.
//   PestanaGenesis (de F) carga aparato y catálogo y se los pasa.
```

---

## 9. Paquetes de la fase 1 (en paralelo, sin archivos compartidos)

**Reglas comunes.** Las de `claude/reglas-comunes-agentes-1112.md`: se trabaja en la nube y se entrega una rama en la Mac;
nunca `push`, ni migraciones, ni `next build` en la Mac, ni imprimir claves, ids de chat, IP o URL. Además:

- **Base.** [REV] **main** (ya contiene GEN1113INT; comprobado en `da14cf8f8`).
- **[REV] Avisar a los medidores de la sala de control.** Al empezar:
  `python3 scripts/puente/procesos_direccion.py abrir <ID> "<título>" --modelo <modelo>` (p. ej.
  `abrir GEN1114A "Puerta: entradas firmadas, emparejar y catálogo" --modelo claude-opus-5-5`); durante el trabajo,
  `… latido <ID>` de vez en cuando; al terminar, `… cerrar <ID>` (o `cerrar <ID> --cancelar` si se abandona). Hecho de
  operaciones 6.
- **[REV] Tiempos.** La página de la sala de control de la Mac tarda unos 15 min en reconstruirse tras un cambio en main;
  ningún paquete da por fallida una comprobación de la web en la Mac antes de eso.
- **[REV] Nada de este contrato depende de la Mac para construir**: cada paquete se prueba solo, con dobles de lo que hacen
  los demás (firmas de §8, `canon.json` de ejemplo de §8.3, vectores de código de §3.3). Los vectores de **firma** entre
  lenguajes no se escriben a mano: los genera la integración (GEN1114INT, abajo).
- **Español** en los comentarios y en el texto visible. Ni «Mando» en `src`.
- **Interfaces de §8 tal cual.** Si un paquete necesita algo de otro todavía no hecho, usa una versión falsa con esas firmas.
- **Vectores de prueba compartidos.** [REV] Ya no hay un archivo que un paquete escriba y otro lea (eso obligaba a A y E a
  esperar a B): los vectores del **código** están en §3.3, el `canon.json` de ejemplo en §8.3 y la **tabla de riesgo** en
  §3.6, y cada paquete los copia en sus pruebas. Cada paquete firma y verifica con claves de prueba creadas en sus propias
  pruebas. La verificación **entre lenguajes** (WebCrypto firma → Python verifica) es de GEN1114INT.

### GEN1114A · Puerta: entradas firmadas, emparejar y catálogo — **modelo más fuerte**

- **Archivos propios:**
  - `servicios/puerta-datos/src/chats-genesis-firma.mjs` (nuevo);
  - `servicios/puerta-datos/src/chats-genesis-aparatos.mjs` (nuevo);
  - `servicios/puerta-datos/src/chats-genesis-canon.mjs` (nuevo);
  - `servicios/puerta-datos/src/chats-genesis.mjs`: un bloque `// GEN1114A` que acepta v2, rechaza v1 con `sin-firma`,
    guarda y entrega `carga`, `firma` y `aparato`, y añade las columnas;
  - `servicios/puerta-datos/src/servidor.mjs`: un bloque `// GEN1114A` que registra las rutas;
  - `servicios/puerta-datos/src/fichas.mjs`: que `genesis-mac` pueda usar aparatos y canon, y `genesis-a1` leer el canon;
    [REV] y `escribirArchivoFichas` atómica conservando dueño, grupo y modo (§8.1, hecho de operaciones 1);
  - `servicios/puerta-datos/test/chats-genesis-firma.test.mjs`, `chats-genesis-aparatos.test.mjs`,
    `chats-genesis-canon.test.mjs`, [REV] `fichas-escritura.test.mjs`;
  - `architecture/puerta-datos-a1.md`: filas nuevas.
- **Solo lectura:** `jwt.mjs`, `supabase.mjs`, `almacen.mjs`, `config.mjs`.
- **Interfaces:** §3.4, §3.5.1, §5.2, §8.1 y §2.4.2.
- **Pruebas:**
  - una v1 → 400 `sin-firma`;
  - una v2 con `carga.cuenta ≠ sub` → 403 `firma-cuenta`;
  - la carga se entrega **byte a byte igual**;
  - un desarrollador con una carga de `aprobar` → 403 `solo-dueno`;
  - nonce repetido dentro de la carga → 409;
  - más de 3 solicitudes → 429;
  - una solicitud caducada no se lista;
  - `estado` solo responde sobre la propia cuenta;
  - el canon con dígitos largos → 400;
  - el desarrollador no recibe los puentes A y B ni `usuario`;
  - la ficha con ámbito `genesis-a1` lee el canon y no escribe en él;
  - los registros no llevan carga ni texto;
  - [REV] una v2 de 40 KB (texto de 8.000 caracteres de 4 bytes) entra; una de 49 KB → 413;
  - [REV] `revocarme` y `revocar-aparato` pasan la forma; `revocar-aparato` de un desarrollador → 403 `solo-dueno`;
  - [REV] con `PUERTA_GENESIS_A1_ESCRITURA` sin poner, `destino: "a1"` → 403 `destino-cerrado`;
  - [REV] la fila entregada no lleva `fuente`, `accion`, `texto` ni `orden` en primer nivel (solo `carga`);
  - [REV] `riesgoDeEntrada` da lo de la tabla de §3.6 y la fila v2 `alto` caduca a los 30 min en la puerta;
  - [REV] `escribirArchivoFichas` sobre un archivo 640 de un grupo dado lo deja 640 y del mismo grupo y dueño; nunca deja
    el archivo a medias (el temporal está en el mismo directorio y se renombra).
- **Comprobación:** `node --test "servicios/puerta-datos/test/*.test.mjs"` en verde, con las 45 de GEN1113 incluidas.
  [REV] En el A1, tras desplegar: `ficha nueva` lanzado con sudo deja `tokens.json` con el mismo dueño, grupo y modo que
  tenía (`stat`), y `… fichas` sigue listando todas.

### GEN1114B · Mac: verificación y emparejamiento — **modelo más fuerte**

- **Archivos propios:**
  - `scripts/puente/genesis_firma_logica.py` y `scripts/puente/genesis_aparatos.py` (nuevos);
  - `scripts/puente/genesis_chats_puerta.py`: un bloque `# GEN1114B` que llama a `comprobar_entrada_firmada` antes de
    `validar_entrada`, usa solo la carga, anota y acusa con el motivo;
  - `scripts/puente/genesis_chats_logica.py`: un bloque `# GEN1114B` en `linea_registro` (`aparato8`, `firma`, `seq`) y
    las órdenes `revocarme`/`revocar-aparato`;
  - `scripts/puente/test_genesis_firma_logica.py`, `test_genesis_aparatos.py`, `test_genesis_firma_cruce.py` (la prueba
    cruzada de §7.8, calcada de `test_genesis_chats_cruce.py`; **la escribe B pero solo pasa en la integración**, cuando
    A está fundido: B la deja con `skip` si `chats-genesis-firma.mjs` no existe);
  - [REV] `scripts/puente/Emparejar aparato.command` y `scripts/puente/Retirar aparato.command` (ejecutables).
- **Solo lectura:** `puerta_datos_cliente.py`, `director_chat.py`, `test_genesis_chats_cruce.py` y
  `cruce-genesis-arnes.mjs`.
- **Interfaces:** §3.3, §3.5.2, §3.6, §3.7, §3.10, §5.1 (lista de altas, `aparatos-retirados.json`, `vistos.json`,
  `chat-a1.json`) y §8.2.
- **Pruebas:**
  - los quince motivos, uno por uno [REV];
  - una carga buena pasa y ejecuta el plan de GEN1113, con el objeto exacto de §3.5 paso 8 (prueba que `rol` de la puerta
    «dueño» con `cuentas.json` «desarrollador» da desarrollador);
  - [REV] `riesgo_de_entrada` con la tabla de §3.6, incluido «texto a Hermes» → `alto` y caducidad de 30 min;
  - [REV] `codigo_de` con los vectores de §3.3; `normalizar_codigo("7ety dggk-dy2f") == "7ETYDGGKDY2F"`;
  - [REV] dos `seq` en orden inverso pasan; el mismo `seq` dos veces no; `vistos` se poda a 8 días, no a 7;
  - [REV] `chat_cuadra` con el `canon.json` de §8.3: los casos (h) e (i) de §7.8;
  - `emparejar` sin TTY o con `SSH_CONNECTION` se niega;
  - un código mal tecleado no escribe nada; [REV] un código que cuadra con una solicitud de una cuenta fuera de
    `cuentas.json` no empareja; una huella retirada no se vuelve a dar de alta; una SPKI que no es P-256 se descarta;
  - [REV] el alta llama a `sudo install -o root -g wheel -m 644` (un `install` falso inyectado comprueba los argumentos);
    si sudo falla, no queda nada escrito;
  - `revocar` no toca la lista de altas y añade a `aparatos-retirados.json` (600);
  - `llevar-a1` con un `ssh` falso no imprime ni el alias resuelto ni la dirección; [REV] el servicio lo lanza solo tras
    una retirada pedida desde un aparato;
  - [REV] ninguna opción, variable ni archivo hace aceptar `v:1` (búsqueda en el código de `genesis_firma_logica.py` y del
    bloque de `genesis_chats_puerta.py`);
  - la firma P-256 `r‖s` verifica (clave de prueba creada en la prueba con `cryptography`, firma pasada a `r‖s`);
  - ningún registro lleva carga ni texto.
- **Comprobación:** las pruebas en verde con `python3` de Homebrew, más `--estado` (aparatos emparejados con nivel, y
  [REV] aviso si `com.starseed.mando.tunel` o `tunel-metagenesis` están cargados en launchd, sin huellas enteras).

### GEN1114C · Mac: registro canónico, descubrimiento y catálogo — **modelo fuerte**

- **Archivos propios:**
  - `scripts/puente/genesis_canon_logica.py` y `scripts/puente/genesis_canon.py` (nuevos);
  - `scripts/puente/com.starseed.genesis-canon.plist` (`WatchPaths` sobre `canon.json` y `StartInterval` de 600);
  - `scripts/puente/instalar-servicios.py`: la entrada `genesis-canon` en un bloque `# GEN1114C`; [REV] y, en el mismo
    paquete, el bloque del túnel viejo (`TUNEL_MANDO`, `com.starseed.mando.tunel`, LEÍDO hacia la línea 666 de main):
    **solo se instala si se pide expresamente** (`STARSEED_SOLO` lo nombra, `mando-tunel`, o `STARSEED_TUNEL_MANDO=1`);
    una ejecución normal del instalador **no lo carga**, y si lo encuentra cargado lo dice en la salida sin tocarlo (hecho
    de operaciones 2). Igual para `tunel-metagenesis` si lo instala el mismo recorrido (comprobarlo en el archivo);
  - `scripts/puente/sincronizar-ides.py`: un bloque `# GEN1114C` que añade `seccion_punteros(canon)` a los punteros;
  - `scripts/puente/test_genesis_canon_logica.py` y `test_genesis_canon.py`.
- **Solo lectura:** `chats.json`, `chat-director-tipos.ts`, `director_chat.py`, `puerta_datos_cliente.py` y
  `telegram-alta.sh` (cómo llama a `getMe`).
- **Interfaces:** §2.1 a §2.4, §5.1 y §8.3. El catálogo que sube debe pasar el `catalogoValido` de E (pruebas con un JSON
  de ejemplo compartido en las pruebas de C).
- **Pruebas:**
  - la semilla da 13 chats con los ids de §2.1;
  - privado → nombre del bot; grupo → título;
  - un id existente no cambia aunque cambie el `@usuario`;
  - `catalogo_publico` no deja pasar `refs` ni textos con 7 o más dígitos seguidos (una huella hex que sea toda cifras no cuenta);
  - **ninguna llamada a `getUpdates`** (una red falsa la haría fallar);
  - la salida de `descubrir` sin dígitos largos;
  - sin red, puentes provisionales con su motivo;
  - `canon.json` en 600 y con copias rotadas;
  - la sección de punteros es idéntica para los tres IDE;
  - [REV] `canon.json` con la forma exacta del ejemplo de §8.3 (B, D, E y F lo usan); ids y alias únicos; un nombre con
    caracteres bidi sale limpio; un título con un teléfono no rompe `subir`;
  - [REV] el instalador, sin `STARSEED_SOLO` ni `STARSEED_TUNEL_MANDO`, no llama a `instalar` para
    `com.starseed.mando.tunel` (con `instalar` y `launchctl` falsos); con `STARSEED_SOLO=mando-tunel`, sí.
- **Comprobación:** §7.1 a §7.4 en la Mac. Las llamadas a Telegram las hace Alex o la dirección; el paquete solo prueba con
  una red falsa.

### GEN1114D · A1: verificación en el bot de peticiones y nombre en Telegram — modelo estándar (con revisión del fuerte)

- **Archivos propios:**
  - `scripts/puente/peticiones_puerta.py`: un bloque `# GEN1114D` que verifica con `genesis_firma_logica` (importado del
    mismo checkout) contra `~/.starseed/peticiones/aparatos.json` (600, del usuario del servicio),
    [REV] `aparatos-retirados.json`, `chat-a1.json` y `vistos.json` (ya no `seq.json`); la caducidad de las peticiones de
    texto pasa a 30 min (`alto`, §3.6), no solo la de `CAMBIAN`; el `pid` de la cola sigue siendo `g-<id>` pero lo que
    impide repetir es `vistos`, no el id de la puerta;
  - `scripts/puente/peticiones_telegram.py`: un bloque `# GEN1114D` con la primera línea de `/estado` y `/ayuda`, «Este
    chat: <nombre> · id <id>», [REV] leída de `chat-a1.json` (lo lleva la Mac por ssh), **no** del canon de la puerta,
    que no es de confianza;
  - `scripts/puente/test_peticiones_puerta.py` y `test_peticiones_telegram.py` (casos nuevos);
  - `deploy/oracle/nodo/preparar-a1.sh`: añadir `python3-cryptography` a la lista de paquetes, si hace falta.
- **Solo lectura:** `genesis_firma_logica.py` (de B; versión falsa hasta que llegue) y `puerta_datos_cliente.py`.
- **Interfaces:** §3.5.3, §3.6, §3.7 y §8.2.
- **Pruebas:**
  - sin `aparatos.json` no se atiende nada de Genesis y Telegram sigue igual;
  - una carga buena entra en la cola durable;
  - cada motivo se acusa;
  - sin `chat-a1.json`, `/estado` no inventa nombre («nombre aún no publicado por la Mac»);
  - el *offset* de Telegram no cambia;
  - [REV] una `v:1` → rechazada (`sin-firma`) aunque la cuenta esté en `cuentas.json`; un aparato retirado → rechazado.
- **Comprobación:** §7.5 y §7.9 en la **fase 1b**: [REV] solo cuando la copia suelta del bot de peticiones del A1 se haya
  sustituido por el checkout del repo (hecho de operaciones 3). El paquete se construye y se prueba esta noche; **no se
  enciende** hasta entonces, y su informe lo dice así.

### GEN1114E · Web: clave del aparato, catálogo y migración — **modelo fuerte**

- **Archivos propios:**
  - `src/lib/chats-genesis/firma-aparato.ts`, `emparejar.ts`, `canon.ts` y `alias-gen1113.ts` (nuevos);
  - `src/lib/chats-genesis/puerta-chats.ts`, `tipos.ts` y `vinculos.ts`: bloques `// GEN1114E`;
  - `src/lib/chats-genesis/__tests__/*` (nuevos y ampliados).
- **Solo lectura:** `src/lib/datos/puerta-a1.ts`, `puerta-a1-tipos.ts`, `src/lib/sync/user-prefs.ts`,
  `src/lib/mando/chat-director-tipos.ts`.
- **Interfaces:** §3.2, §3.4, §5.1, §8.4 y §2.6. [REV] `alias-gen1113.ts` exporta también `DESTINO_DE_FUENTE` (la
  descripción fija de cada fuente para la línea «Va a …» de §3.9; p. ej. `puente:hermes-avisos` → «Hermes, que puede usar
  herramientas en tu Mac») y la relación fija fuente → id de §3.4 para cuando no hay catálogo. `catalogoValido` descarta
  ids o alias repetidos y limpia controles y bidi en los nombres; `chatDeFuente` usa el campo `fuente` del catálogo **y**
  comprueba que el chat tenga ese alias fijo, o devuelve `null` (la interfaz entonces usa el nombre provisional).
- **Pruebas** (con `fake-indexeddb` si ya está en el repo; si no, un almacén inyectado):
  - la clave se crea con `extractable: false`, y `exportKey("pkcs8")` falla;
  - [REV] `seq` se reserva en una transacción que se cierra antes de firmar; dos firmas a la vez (dos «pestañas» con el
    mismo almacén) reciben números distintos; persiste;
  - [REV] `codigoDe` coincide con los vectores de §3.3;
  - la carga firmada verifica con la SPKI (WebCrypto verify en la misma prueba);
  - [REV] la carga lleva `chatNombre`, `entrada.v === 1` y `caduca` ≤ `t` + 30 min si `riesgoDeEntrada` es `alto`;
  - [REV] `riesgoDeEntrada` con la tabla de §3.6;
  - `enviar` sin aparato no llama a la red; [REV] tampoco sin `chat`, con otra cuenta, ni con `alto` desde nivel `texto`;
    un reintento reenvía la misma `EntradaFirmada`;
  - [REV] `catalogoValido` descarta un catálogo con un id repetido o con el alias `puente:hermes-avisos` en el chat del
    puente B (`chatDeFuente` devuelve `null`);
  - `nombreDeChat` resuelve id, alias de GEN1113 y fuente, y sin catálogo devuelve el provisional;
  - `catalogoValido` tolera basura;
  - la migración v1 → v2 conserva ids y títulos;
  - ningún `node:*` en el grafo del navegador.
- **Comprobación:** vitest y tsc limitado en verde.

### GEN1114F · Interfaz: nombres reales, información del chat y emparejar — modelo estándar

- **Archivos propios:**
  - `src/components/chats-genesis/emparejar-aparato.tsx` e `info-chat.tsx` (nuevos);
  - `lista-chats-genesis.tsx`, `hilo-puente.tsx`, `hilo-direccion.tsx`, `pestana-genesis.tsx` y `cabecera-espejo.tsx`;
  - `src/components/messaging/conexion-telegram.tsx`;
  - `src/components/agent/chat-neural-sidebar.tsx` (solo la función de etiquetas de la línea 76 y la carpeta Genesis);
  - `src/components/chats-genesis/__tests__/*`.
- **Solo lectura:** `src/lib/chats-genesis/*` (de E; versión falsa con las firmas de §8.4 hasta que llegue) y
  `src/components/ui/menu-lista-movil*`.
- **Interfaces:** §3.8, §3.9, §8.5, §2.3 (nombre distinto) y las reglas de §10.
- **Pruebas (jsdom):**
  - con catálogo, ninguna de las tres etiquetas de GEN1113 aparece;
  - sin catálogo, aparece la marca «nombre provisional»;
  - sin emparejar no hay compositor y sí la tarjeta;
  - el estado pendiente muestra el código y las horas;
  - el rechazo `firma-mala` se ve con su texto;
  - `<img onerror>` del feed se pinta como texto;
  - ningún «Mando»;
  - [REV] con un aparato `texto`, el hilo del puente A no ofrece escribir a Hermes ni órdenes que cambian, y sí `/estado`;
  - [REV] antes de enviar algo `alto` se ve la línea «Va a …» de `DESTINO_DE_FUENTE`, aunque el catálogo diga otro nombre;
  - [REV] `enviar` recibe `{id, nombre}` del chat que muestra la cabecera (el mismo texto que se ve);
  - [REV] el puente B, en la fase 1a, se lee y dice «Escribir a Peticiones llega cuando el A1 tenga la versión nueva».
- **Comprobación:** capturas reales de §7.12, revisadas a ojo (esperando los 15 min de reconstrucción de la página de la
  Mac [REV]).

**Orden de integración:** [REV] A → B → E → C → F → D (D construido, sin encender hasta la fase 1b). Las interfaces dejan
construir los seis a la vez.

### [REV] GEN1114INT · Integración — **modelo más fuerte**

No es un séptimo paquete en paralelo: empieza cuando los seis entregan.

- Funde en el orden de arriba y quita los `skip` de `test_genesis_firma_cruce.py`.
- **Prueba entre lenguajes** (nuevo, `scripts/puente/test_genesis_firma_lenguajes.py` + un caso de vitest,
  `src/lib/chats-genesis/__tests__/vectores-lenguajes.test.ts`, que escribe a un archivo temporal dado por variable):
  vitest usa `firmarEntrada` de E (con el WebCrypto de Node y un almacén en memoria) para firmar cinco cargas
  (una por tipo de riesgo y fuente), y Python las verifica con `comprobar_entrada_firmada` de B; además, el código que
  calcula `codigoDe` para esa clave es el que calcula `codigo_de`. Si algo no cuadra, no se enciende nada.
- La cruzada de §7.8 entera, con la puerta real de A.
- Las comprobaciones 1–4, 6–8 y 10–13 de §7 que se puedan hacer sin Alex; las que piden su móvil o su contraseña
  quedan listadas para él.
- Antes de encender la fase 1a: túneles apagados, `cuentas.json` solo después de B, y la comprobación del A1 de
  §3.11.13.

---

## 10. Límites y honestidad

- **Nada se muestra que no sea verdad:**
  - un nombre provisional lo dice;
  - «Emparejado» dice «según la puerta del A1» hasta la fase 2;
  - «firmado» solo aparece en lo que salió firmado;
  - un rechazo dice el motivo real;
  - un vacío dice qué falta y desde cuándo («Sin catálogo de la Mac desde el 13-11 a las 02:10»).
- **La herramienta MCP `chat` que dice «Mensaje enviado» sin enviar** se corrige **antes** de la fase 3, con un cambio de una
  línea en un paquete aparte que no es de esta fase: «Aún no envía: los mensajes desde aquí llegarán como borradores».
  Queda anotada aquí porque la regla de Alex lo exige.
- **Texto visible** en español. «Mando» no aparece nunca en texto ni comentarios bajo `src` (`nombre-genesis.test.ts`).
- **Pantallas pequeñas:**
  - el código de emparejar se parte en tres grupos que no se cortan;
  - los nombres de 80 caracteres pasan a dos líneas;
  - «Información del chat» abre a pantalla completa en < sm;
  - el compositor y la tarjeta de emparejar quedan visibles con el teclado abierto.
- **Lo que no será real tras la fase 1:**
  - la configuración y el contexto comunes;
  - los nombres puestos en Telegram, Hermes y `/genesis`;
  - la integridad de lo leído;
  - las claves de hardware;
  - todo lo de la Parte III.

  Las pantallas que lo nombran lo dicen como «llega en la fase 2/3», sin botones muertos.

---

## 11. Decisiones que Alex puede cambiar (entre paréntesis, la que se aplica)

- **D0.** Fundir `opus1106/GEN1113INT` en main antes de lanzar GEN1114. (Sí; [REV] ya está hecho.)
- **D1.** Los ids son propios de StarSeed (`genesis`, `genesis.canal.<canal>`, `telegram.<usuario>`, que se congela al
  descubrirlo). Los ids nativos nunca salen de la Mac ni del A1. (Sí.)
- **D2.** La dirección y los chats principales de cada entorno de `chats.json` son un mismo chat, «GENESIS · StarSeed OS».
  (Sí.)
- **D2b.** El nombre de un puente es el que Alex ve en Telegram: el del bot si el chat es privado, el título si es un grupo.
  Las etiquetas de GEN1113 quedan como alias. (Sí.)
- **D3.** El registro vive en la Mac (`~/.starseed/genesis-chats/canon.json`, un solo escritor). `chats.json` del repo es la
  semilla y no se toca. (Sí.)
- **D4.** Los cambios concurrentes se resuelven por campo: las listas se funden y en lo demás gana el primero. El nombre
  canónico gana sobre un cambio hecho dentro de Telegram hasta que Alex elija. (Sí.)
- **D5.** En la fase 1, la firma en el navegador y el WebView es silenciosa, sin biometría por mensaje. En la fase 2, Touch
  ID en las apps nativas y passkey en el navegador solo para lo que cambia algo. (Sí; [REV] **pero** con el nivel de D16:
  silenciosa para lo `bajo` siempre, y para lo `alto` solo en aparatos que Alex marque `completo`.)
- **D6.** Para emparejar se teclea en la Mac el código de 12 caracteres; nunca por ssh ni con un botón remoto. (Sí; [REV]
  más la contraseña de administrador, D15, y con un doble clic que abre la terminal.)
- **D7.** Toda escritura necesita la firma de un aparato emparejado, también la de un desarrollador. Sin firma, se
  rechaza. (Sí.)
- **D8.** Caducidad: 30 min para lo que cambia algo, 7 días para un mensaje. (Sí; [REV] «lo que cambia algo» es todo lo
  `alto` de §3.6, **incluido el texto a Hermes**, `/a` y `/decir`.)
- **D9.** Cualquier aparato emparejado del dueño puede retirarse a sí mismo o retirar otro; añadir, solo la Mac. (Sí.)
- **D10.** La lista de aparatos llega al A1 por ssh desde la Mac (`llevar-a1`), no por la puerta. (Sí.)
- **D11.** La orbe escribe solo texto, tras leerlo en voz alta y oír un «sí»; nunca da órdenes que cambian algo. (Sí;
  [REV] y solo lo `bajo`: un texto a Hermes o a un motor por voz queda como borrador, porque cualquier audio puede decir
  «sí».)
- **D12.** El MCP remoto, la API externa y los bots leen y proponen borradores; no escriben. (Sí.)
- **D13.** «Producción completa» quiere decir la web publicada y el A1, además de la Mac. (Sí.)
- **D14.** Se muestra una huella de 8 caracteres por medio, nunca el id nativo. (Sí.)
- **[REV] D15.** La lista de altas de aparatos es de root y dar de alta pide la contraseña de administrador de la Mac,
  para que un agente con herramientas no pueda emparejar un aparato. (Sí. **Necesita a Alex**: si su usuario no es
  administrador o no quiere teclear la contraseña, la alternativa es una lista de Alex con la garantía más débil, y debe
  decirlo así.)
- **[REV] D16.** Cada aparato tiene nivel `texto` o `completo`; por defecto `texto`. Solo `completo` despierta agentes o
  cambia algo, y así lo eligió Alex en la Mac sabiendo que quien publique la web podría usarlo. (Sí, `texto`. **Necesita a
  Alex**: es la decisión de si tolera ese riesgo hasta la fase 2.)
- **[REV] D17.** La fase 1 se enciende con los túneles de Cloudflare a la Mac apagados, y el instalador deja de
  encenderlos solo. (Sí.)
- **[REV] D18.** El puente B no se escribe desde la web hasta que el bot del A1 corra el código del repo (fase 1b). (Sí.)

---

## 12. Lo que no se pudo determinar

- **Los nombres reales de los bots A y C y el tipo de los tres chats** (privado o grupo). Hace falta `getMe`/`getChat` en
  la Mac. No se ejecutó: la regla impide leer valores de variables y llamar a Telegram desde aquí. Lo resuelve
  `genesis_canon.py descubrir` (GEN1114C).
- **Si `chats.json › telegram.temas`** (`GENESIS`, `olas` y `avisos`) se usa hoy: `telegram.id` es `null`. INFERIDO: no.
- **Si la CLI de Hermes puede poner título a una sesión**, y cómo autoriza Hermes a Telegram. No se leyeron sus almacenes
  (regla).
- **Si el `python3` del A1 tiene `cryptography`** y qué versión. GEN1114D añade el paquete si falta.
- **El nombre exacto del alias o la variable ssh del A1** que usa la dirección (el informe de GEN1113INT lo llama `$A1`).
  `llevar-a1` lo toma de una variable que se fija al integrar.
- **Si Safari en iOS borra IndexedDB** del sitio sin instalar en el uso real de Alex (ITP), y si
  `navigator.storage.persist()` se concede en sus aparatos. Se verá en §7.6; la interfaz ya cubre la pérdida de la clave
  (§3.9).
- **Si el chat de dirección y los chats principales de cada entorno son de verdad la misma conversación** (D2, INFERIDO).
- **El sentido exacto de «producción completa»** (D13, interpretado).
- **Qué hace hoy `/genesis` en la Mac con nombres que vengan del registro.** Está fuera de la fase 1: `CANALES` no se toca
  hasta la fase 2.
- **Si `fake-indexeddb` está en las dependencias del repo.** No se miró `package.json` a fondo; E usa un almacén inyectado
  si no está.
- [REV] **Si algún proceso de la Mac actúa sobre lo que lee del bus de la puerta** (`/v1/bus/eventos`, que cualquier sesión
  puede escribir). `puerta_datos_cliente.py` tiene lector (LEÍDO, líneas 211 y 221 de main); quién lo usa y para qué no se
  revisó. Si algo de ahí llega a un agente, es otro camino sin firma (§3.11.11).
- [REV] **Si la copia suelta del bot de peticiones del A1 lee `/v1/genesis/chats/entrada?destino=a1`.** No se miró el A1
  (regla: solo lectura del repo en la Mac). Decide si la fase 1a puede dejar viva la ficha `genesis-chats-a1` (§3.11.13).
- [REV] **Si `tunel-metagenesis` abre un camino a la Mac** como el de `com.starseed.mando.tunel` (INFERIDO por su nombre y su
  SOP), y si alguno de los dos está cargado ahora. No se miró launchd.
- [REV] **Si el usuario de Alex en la Mac es administrador** con sudo (D15).
- [REV] **Quién puede llevar código a main o desplegar en Vercel** (§3.11.1). Decide cuánto riesgo es D16 `completo`.

---

## 13. Revisión antes de construir (REV1114 · 2026-11-13)

Revisión de seguridad hecha **antes** de lanzar los seis paquetes, leyendo este contrato, §4, §5, §7 y §13 del contrato
GEN1113 en main, el informe de GEN1113INT y el código de main (`chats-genesis.mjs`, `fichas.mjs`, `servidor.mjs`,
`genesis_chats_logica.py`, `peticiones_puerta.py`, `puerta-chats.ts`, `instalar-servicios.py`). VERIFICADO = visto en el
código; INFERIDO = razonado sin verlo funcionar. Todo lo que cambió lleva **[REV]** en su sección.

| # | Gravedad | Hallazgo (qué podía hacer un atacante) | Qué se cambió |
|---|---|---|---|
| 1 | **Crítica** | Quien pueda publicar la web (una cuenta de desarrollador con acceso a main, que se despliega solo, o a Vercel; o una sola carga de página comprometida) firma en silencio con la clave del móvil de Alex y habla a Hermes, que tiene herramientas en la Mac: de desarrollador a dueño de la Mac. El contrato lo contaba como riesgo de fase 2 sin limitar nada en la fase 1. INFERIDO del diseño (WebCrypto no exportable sigue siendo usable por cualquier script del origen). | Nivel por aparato (`texto`/`completo`), elegido por Alex en la Mac; por defecto `texto`, que solo hace lo `bajo` (§3.3, §3.5 paso 6, §3.6, D16). Tabla `riesgo_de_entrada` común a puerta, Mac, A1 y web. La orbe y la Protomolécula nunca firman `alto` solas (§4). Queda la decisión de Alex. |
| 2 | **Crítica** | La regla «solo en una terminal» no prueba que haya una persona: cualquier programa que corra como Alex (Hermes y los agentes con herramientas, IDE, Desktop Commander) abre una pseudoterminal, quita `SSH_*` y teclea el código que un atacante le pase por texto, o escribe `aparatos.json` directamente (600, de Alex). Un mensaje de Telegram o una línea de desarrollador bastaba para emparejar un aparato del atacante. INFERIDO (comportamiento de `isatty` y permisos de archivo). | La lista de altas pasa a ser de root y el alta pide la contraseña de administrador con sudo; las retiradas van a un archivo de Alex que solo quita poder (§3.3, §5.1, D15). Doble clic «Emparejar aparato.command» para que Alex no escriba órdenes (hecho de operaciones 5). §3.11.10 dice lo que sigue abierto. |
| 3 | **Alta** | El código de 12 caracteres solo ataba la clave, no la cuenta: una puerta tomada podía presentar la solicitud del aparato de un desarrollador como de la cuenta de Alex; Alex teclea un código correcto y ese aparato firma como dueño. VERIFICADO en el diseño (§3.2 original: «primeros 60 bits de la huella»). | El código es `sha256(huella ‖ cuenta)` (vectores en §3.3); la Mac recalcula huella y código, compara con todas las pendientes, exige la cuenta en `cuentas.json`, valida que la clave sea P-256, no reactiva huellas retiradas, y el aparato muestra su `cuenta8`. |
| 4 | **Alta** | El texto suelto a Hermes, `/a` y `/decir` no eran «lo que cambia algo» (`cambia()` de GEN1113 solo mira `CAMBIAN` y la dirección con motor, VERIFICADO en `genesis_chats_logica.py` y `chats-genesis.mjs`), así que vivían 7 días: una puerta podía guardar una instrucción a un agente con herramientas y soltarla días después con firma buena. | Todo lo `alto` (incluido texto a Hermes y peticiones del A1) caduca a los 30 min en la Mac, el A1 y la puerta (§3.6, D8). Prueba (g) en §7.8. |
| 5 | **Alta** | El nombre y el destino que ve Alex salen del catálogo, que sirve la puerta: una puerta tomada podía cambiar nombres para que Alex escribiera a Hermes creyendo escribir a otro chat. El campo firmado `chat` no se comparaba con `fuente`. VERIFICADO en el diseño. | La carga firma también `chatNombre`; la Mac comprueba `chat`↔`fuente` y el nombre contra su `canon.json` (`chat-distinto`, `nombre-distinto`); la relación fuente→chat es fija en el código; la interfaz muestra una descripción fija del destino («Hermes, que puede usar herramientas en tu Mac») que no viene del catálogo; el A1 usa `chat-a1.json` llevado por ssh, no el canon de la puerta (§3.4, §3.5, §3.9). |
| 6 | **Alta** | Caminos sin firma a los agentes que el contrato no nombraba y que hacían falsa la frase «sin firma no se ejecuta nada»: el túnel `com.starseed.mando.tunel` (que el instalador vuelve a cargar aunque Alex lo apague, VERIFICADO en `instalar-servicios.py` hacia la línea 666: se instala siempre que exista el guion) y, INFERIDO, `tunel-metagenesis`. | §0.9 y §3.11.11 lo dicen; la fase 1a exige los túneles apagados (D17); C hace que el instalador no cargue el túnel viejo salvo petición expresa, con prueba (hecho de operaciones 2); `--estado` de B avisa si hay un túnel cargado. |
| 7 | **Alta** | El bot de peticiones del A1 corre una copia suelta distinta del repo; si lee entradas, una puerta tomada podía meterle `v:1` sin firma, y el contrato daba la verificación del A1 por hecha en la fase 1. | Fase 1a (Mac) y 1b (A1) separadas; el puente B no se escribe desde la web hasta 1b; la puerta rechaza `destino: "a1"` hasta que se active; comprobar en el A1 que nada lee las entradas o revocar el ámbito (§7, §3.11.13, D18; hecho de operaciones 3). |
| 8 | **Media** | Crear `cuentas.json` antes de que la Mac corra el código de B reabría el hallazgo de GEN1113INT (la Mac de GEN1113 acepta `v:1`); deshacer B en mal orden también. | §5.3: `cuentas.json` solo después de B; deshacer B empieza por quitarlo. |
| 9 | **Media** | `seq` «estrictamente creciente» rechazaba envíos buenos con dos pestañas o reordenados, y pedía reservar el número dentro de una transacción de IndexedDB que no sobrevive a `crypto.subtle.sign`. La lista de nonces se podaba a 7 días y una carga podía seguir vigente 5 min más (hueco de repetición). VERIFICADO en el diseño y en `podar_vistos` (7 días). | `seq` único (no creciente), reservado y cerrado antes de firmar; repetición por `aparato:seq` y `cuenta:nonce` guardados 8 días (§3.4, §3.5 paso 7, §3.6). Pruebas (k) y (l). |
| 10 | **Media** | Retirar un aparato en la Mac no llegaba al A1 si nadie lanzaba `llevar-a1`, y una retirada pedida desde otro aparato nunca llegaba: un móvil perdido seguía escribiendo al puente B. | El servicio de la Mac lleva la lista sola tras cualquier retirada, reintenta y lo anota; el acuse lo dice; lo que estaba en cola se rechaza al procesar (§3.7). |
| 11 | **Media** | Tope de 16 KB del cuerpo (VERIFICADO en `crearEntrada`): la carga en base64url de un texto de 8.000 caracteres no ASCII no cabía, y el diseño decía «≤ 16 KB decodificada». | v2: cuerpo ≤ 48 KB y carga ≤ 32 KB (`servidor.mjs` ya admite 64 KB, VERIFICADO) (§3.4, §3.5, §8.1). |
| 12 | **Media** | Ambigüedad que habría hecho que B pasara a `validar_entrada` campos de la puerta como si valieran (la puerta pone `rol` y `recibido`), y que E/F inventaran cada uno de dónde sale `cuenta`, `chat` y el plazo. | Objeto exacto para `validar_entrada` y `plan_de_entrada` (§3.5 paso 8); la fila entregada no lleva los campos de la entrada en primer nivel (§5.2); `enviar(e, chat)`, `cuentaDeSesion`, `riesgoDeEntrada` y `firmarEntrada` sin `cambia` (§3.4, §8.4). Acciones `revocarme`/`revocar-aparato` con forma exacta (§3.4). |
| 13 | **Media** | Paralelismo roto: A y E dependían de un archivo de vectores que escribía B; la prueba cruzada de B dependía del código de A; nadie poseía la verificación WebCrypto→Python. | Vectores del código, `canon.json` de ejemplo y tabla de riesgo escritos en el contrato; la cruzada se salta hasta integrar; GEN1114INT añade la prueba entre lenguajes (§9). |
| 14 | **Media** | `ficha nueva` como root dejaba `tokens.json` de root y sin lectura para la puerta (VERIFICADO: `escribirArchivoFichas` escribe un temporal con modo 640 y lo renombra, sin conservar dueño ni grupo). Rompió todas las fichas 4 min esta noche. | `escribirArchivoFichas` conserva dueño, grupo y modo, con `fsync` y prueba (A, §8.1; hecho de operaciones 1). |
| 15 | **Baja** | Un nombre de grupo con 7 o más dígitos (un teléfono) hacía que la puerta rechazara el catálogo entero; nombres con marcas bidi podían disfrazar otro nombre; ids o alias repetidos hacían ambigua `nombreDeChat`. | `catalogo_publico` sustituye ese nombre; `limpiar_nombre`; unicidad de ids y alias en C y en `catalogoValido` (§8.3, GEN1114E). |
| 16 | **Baja** | El reloj atrasado de un aparato hacía caducar sus órdenes sin explicación. | Aviso por la cabecera `Date` de la puerta (solo aviso) (§3.6). |
| 17 | **Baja** | §8.1 decía «ficha `genesis-mac`», que es otra ficha que ya existe con otros ámbitos (GEN1113 §13). | Se dice «ficha con ámbito `genesis-mac` (la `genesis-chats-mac`)». |
| 18 | Info | Main ya contiene GEN1113INT (VERIFICADO, `da14cf8f8`): la condición previa estaba vieja. | Base = main (cabecera, §9, D0). |
| 19 | Info | Reglas nuevas de los agentes (medidores) y el tiempo de reconstrucción de la página de la Mac. | §9 reglas comunes y §7 (hechos de operaciones 4 y 6). |

**Lo que se deja como está, y por qué:**

- **Silencio de la firma para lo `bajo`** (D5): un texto en el hilo no despierta a nadie; el coste de pedir presencia por
  cada línea no compensa. La presencia (passkey, Touch ID) sigue en la fase 2 para lo `alto`.
- **Integridad de lo que se lee** (§3.11.3): firmar el espejo, el catálogo y los acuses desde la Mac es la fase 2; hasta
  entonces la interfaz dice «según la puerta». Lo que sí se cierra en la fase 1 es que leer algo falso **no** lleve a
  escribir en el chat equivocado (hallazgo 5).
- **Un aparato robado puede retirar los demás** (§3.7): es negación de servicio, se ve en el hilo y se arregla en la Mac.
- **60 bits de código**: una sustitución tendría que acertar en los 15 min de la solicitud; suficiente.
- **El texto de un desarrollador en el hilo** puede intentar dar instrucciones a los modelos que Alex despierte después
  (§3.11.8): no se resuelve con firmas; queda marcado como no fiable y es tema de los propios agentes.

**Lo que tiene que decidir Alex:** D15 (contraseña de administrador para emparejar) y D16 (si algún aparato será
`completo` antes de la fase 2, sabiendo que entonces quien publique la web puede hablar a Hermes en su nombre).

**¿Se pueden lanzar los seis paquetes?** Sí, con este texto: los archivos no se pisan (C es el único que toca el
instalador; A el único que toca `fichas.mjs`), cada paquete tiene dobles y vectores escritos aquí, y la prueba que cruza
lenguajes y la cruzada de la puerta son de GEN1114INT. D se construye pero no se enciende hasta la fase 1b.

---

## 14. Integración (GEN1114INT · 2026-11-13) — lo que hace el código, donde difiere del texto de arriba

Rama `opus1106/GEN1114INT`: A, E, B, C, D y F fundidos en ese orden, sin conflictos. Lo que sigue **manda sobre el
texto de arriba** cuando no coinciden. Marcado **[INT]**.

### 14.1 Un solo esquema de ids y nombres (B, C, E)

- **Sin registro** (`canon.json` no existe en la Mac): el id de un puente es `telegram.<clave de GEN1113>`
  (`telegram.hermes-avisos`, `telegram.peticiones`, `telegram.avisos-directores`), el mismo que siembra
  `genesis_canon_logica.id_provisional_de_puente` antes de descubrir. B ya no acepta las claves sueltas
  (`hermes-avisos`…). La web (E) no escribe a un puente sin catálogo (no sabe su id real): no cambia.
- **Sin registro, dirección con un solo canal**: la web firma `genesis.canal.<c>` con el nombre de `CANALES`
  (p. ej. «Director presidente»). B lo acepta por `NOMBRES_CANAL` (copia fija; una prueba la compara con
  `chat-director-tipos.ts`). Antes B solo aceptaba el id del canal como nombre y rechazaba lo que la web firmaba.
- **Con registro sembrado** y **tras descubrir**: lo que la web firma (`chatParaFirmar` sobre el catálogo que sube
  C) es lo que B acepta con su `canon.json`. Lo firmado antes de descubrir y entregado después sale `chat-distinto`
  (el id cambió); es lo esperado.
- **Riesgo de un texto que empieza por «/»**: es texto firmado y por tanto `alto`, en la puerta, la Mac, el A1 y la
  web (la tabla de §3.6 habla de órdenes, `accion: "orden"`). Las pruebas de D que mandaban «/estado» como texto
  desde un aparato `texto` se corrigieron: ahora lo mandan como orden.

### 14.2 Lo que una puerta tomada ya no puede «quemar»

Una carga con firma buena que se rechaza solo se anota en `vistos.json` si el rechazo sale de lo **firmado** o del
estado de la Mac. No se anota si sale del sobre que pone la puerta (`cuenta` distinta de la del aparato cuando la
firmada sí es la suya; `caducada` por la hora de recepción) ni si es pasajero (`limite`):
`genesis_firma_logica.rechazo_definitivo`. Sin esto, una puerta podía entregar antes una entrada buena con otra
cuenta y la entrega honrada salía `seq-repetido` (lo encontró la prueba cruzada). No abre repeticiones: lo que no
se anota tampoco se ejecutó. (Lo que rechaza la validación de GEN1113 después de la firma —p. ej. el rol que baja la
puerta— sí se anota: equivale a que la puerta la tire, que siempre puede.)

### 14.3 Registro de retiradas de solo añadir (riesgo residual de B)

`aparatos-retirados.json` es de Alex: cualquier programa que corra como él puede vaciarlo y devolver la validez a
un aparato retirado. **[INT]** El primer `emparejar` crea además, con el **mismo** sudo del alta,
`/Library/Application Support/StarSeed/genesis-aparatos-retirados.jsonl`: de Alex, 600, con la marca de sistema
`sappnd` (`install -f sappnd`; solo root la quita) dentro de la carpeta de root. Retirar sigue sin contraseña
(se añade una línea); vaciarlo, reescribirlo, borrarlo o moverlo no se puede sin root. Un aparato vale si está en la
lista de root y **no** está en ninguno de los dos registros. Si el registro existe y no se puede leer, no vale ningún
aparato. `--estado` dice si existe y si tiene la marca. Lo que sigue abierto está en el informe de integración.

### 14.4 Otros cambios de la integración

- D acusa con el mismo detalle que la Mac («[motivo] texto»), para que la web lo traduzca igual.
- `servicios/puerta-datos/deploy/env.nombres` lista `PUERTA_GENESIS_A1_ESCRITURA=` (vacío = cerrado).
- La hoja «Secciones de Astraura» (`MenuListaMovil`) reserva a la derecha el sitio de los flotantes, como las hojas
  de Genesis (`useReservaFlotantes` de F).
- `genesis_aparatos.py acceso-escritorio --carpeta <ruta>` deja los lanzadores fuera del Escritorio.
- El arnés de la puerta (`cruce-genesis-arnes.mjs`) da la ruta de su SQLite y abre o cierra `destino: "a1"`.
- **Preferencias v2 y la lista de descartes**: un cliente GEN1113 (la web publicada antes de esta ola, o una pestaña
  vieja) que lee una v2 la guarda entera en `chatsGenesisDescartado` y reescribe una v1 con los vínculos rescatados;
  el cliente nuevo la vuelve a migrar. La lista ya está acotada a 20 entradas en los dos clientes
  (`MAX_DESCARTADO`), cada una con una copia de las preferencias (≤ 500 vínculos). No se añade otro tope: el vaivén
  dura lo que duren abiertos clientes viejos y no pierde nada.

### 14.5 Prueba entre lenguajes

`scripts/puente/test_genesis_firma_web_cruce.py` + `scripts/puente/cruce-firma-web.mjs`: el código real de la web
(E) bajo el WebCrypto de Node (empaquetado al vuelo con esbuild; solo IndexedDB es el almacén en memoria de las
pruebas de E), la puerta real (A) en 127.0.0.1, la Mac real (B, con el emparejamiento real y el registro real de C)
y el A1 real (D). Sustituye a la `vectores-lenguajes.test.ts` + `test_genesis_firma_lenguajes.py` que pedía §9 (una
sola prueba, de punta a punta, en lugar de vectores en un archivo). La prueba cruzada de GEN1113
(`test_genesis_chats_cruce.py`) firma ahora sus entradas con aparatos de prueba de Python.
