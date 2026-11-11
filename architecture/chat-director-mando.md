# Chat Director de Genesis — contrato (Ola 1004 · 2026-10-04)

> **Petición de Alex (2026-10-04):** encima del «Pulso del trabajo», un chat de la DIRECCIÓN donde
> llega lo mismo que hablamos en la sesión de Claude (Cowork): los mismos informes, en el mismo
> hilo. Cada mensaje lleva un botón de **modelo** y otro de **canales** (este chat, Hermes, ChatGPT,
> Antigravity, la terminal, el chat de cualquier IDE) para sincronizar las respuestas de todos los
> medios y elegir con qué modelo se responde cada una. Ahí llegan los informes programados de los
> directores (verificadores, supervisores, restauradores, protectores), procesos, pruebas, usos
> completos y la actividad del enjambre, las olas y las tareas. Por defecto, preseleccionado el
> último modelo del director usado. **El modelo de la dirección es Claude Opus 5.5 con los mismos
> contextos, enlaces, habilidades, memorias y archivos del proyecto.**

Este documento es la fuente de verdad. Lo que no esté aquí no forma parte del contrato.

## 1. Un solo archivo de verdad

`starseed_memory_root/mando/director/chat.jsonl` — append-only, una línea JSON por registro. Lo
escriben Genesis (ruta `/api/mando/director-chat`), el cartero (`scripts/puente/cartero_director.py`),
la biblioteca de Python (`scripts/puente/director_chat.py`), el servidor MCP y la sesión de Claude.
Nadie reescribe líneas: las correcciones son registros nuevos.

### 1.1 Registro «mensaje»

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `id` | `md-<epoch_ms>-<4 hex>` | sí | único |
| `t` | ISO-8601 con zona | sí | |
| `de` | texto | sí | `alex`, `claude-cowork`, `claude-mac`, `hermes`, `chatgpt`, nombre de un director… |
| `rol` | `alex` · `director` · `agente` · `sistema` | sí | |
| `tipo` | `mensaje` · `respuesta` · `informe` · `aviso` · `actualizacion` · `uso` | sí | |
| `texto` | texto ≤ 20 000 | sí | nunca claves (se tachan antes de escribir) |
| `canal` | `CanalId` | sí | de dónde vino |
| `canales` | `CanalId[]` | no | a dónde pidió Alex que se mande |
| `modelo` | `motor/modelo` | no | con qué modelo se respondió o se pide responder |
| `respondeA` | id | no | hilo |
| `tarea` | id | no | tarea del enjambre relacionada |
| `uso` | `{tokensEntrada, tokensSalida, segundos, coste, via?}` | no | lo que costó esa respuesta |
| `sintesis` | `true` | no | (DIR1111G) respuesta principal de un director: destaca en «Dirección» |
| `eleccion` | `{proveedor, modelo, descartes?: [{proveedor, motivo}]}` | no | (DIR1111G) solo respuestas del Director presidente: quién contestó y por qué no los anteriores |

Los dos campos nuevos son opcionales: las líneas antiguas se leen igual y el código anterior los ignora.

### 1.2 Registro «entrega»

`{"tipo":"entrega","de_id":<id>,"canal":<CanalId>,"estado":"pendiente|entregado|respondido|fallo","t":<ISO>,"detalle":<texto opcional>}`

El estado de un mensaje en un canal es el **último** registro de entrega de ese par `(de_id, canal)`.

## 2. Canales (`CanalId`)

| Canal | Qué es | Cómo se entrega | Cómo responde |
|---|---|---|---|
| `mando` | el propio chat | — | — |
| `director-presidente` | **el Director presidente** (DIR1111G): destinatario por defecto del compositor | el cartero (`director_presidente.py`) | al momento si alguien puede; si no, EN COLA (§8) |
| `claude-cowork` | **la sesión de Claude Opus 5.5 en Cowork** (la de la dirección, con todo el contexto del proyecto) | `bandeja/claude-cowork.jsonl` | en su próxima revisión programada o cuando Alex le escribe allí; publica con `director_chat.py publicar` |
| `claude-mac` | Claude Code en la Mac (`claude -p --model claude-opus-5-5 --resume <sesión del director>`, en la raíz del repo: CLAUDE.md, memory/, skills, MCP) | el cartero lo ejecuta | al momento; herramientas solo de lectura |
| `hermes` | Hermes Agent | `hermes -z <prompt> [-m modelo] --usage-file` | al momento |
| `telegram` | copia al móvil de Alex | `hermes send -t telegram:Maggasukha` | no responde (las respuestas de Telegram entran por `telegram-puente.py` → `canal.jsonl`) |
| `chatgpt` | ChatGPT por la suscripción de Codex | `codex exec -m <modelo> -s read-only --skip-git-repo-check -C <repo>` (prompt por stdin) | al momento |
| `antigravity` | IDE Antigravity | `bandeja/antigravity.jsonl` + `PUENTE-DE-MANDO.md` + servidor MCP | cuando el IDE publica por MCP |
| `ide` | chat de cualquier IDE (Claude Code, Codex, Cursor…) | `bandeja/ide.jsonl` + servidor MCP | por MCP |
| `terminal` | la terminal | `bandeja/terminal.jsonl`; CLI `python3 scripts/puente/director_chat.py` | `director_chat.py decir` |

**Claves:** el cartero lanza `claude` SIN `ANTHROPIC_API_KEY` en el entorno (con ella usa la clave de
API —sin saldo— en vez del inicio de sesión de claude.ai). Ninguna clave se escribe en el chat:
`director_chat.py` tacha `sk-…`, `gh?_…`, `AIza…`, `Bearer …`, JWT y la URL del túnel.

## 3. Modelos («motor/modelo»)

- `director-presidente/auto` — **por defecto desde DIR1111G**: el presidente elige quién contesta (§8).
- `claude-cowork/claude-opus-5-5` — la dirección en Cowork.
- `claude-mac/claude-opus-5-5` — Opus 5.5 en la Mac (necesita la cuenta de Claude Code con saldo o con
  suscripción; hoy, 2026-10-04, contesta «Credit balance is too low»).
- `hermes/<modelo>` · `codex/<modelo>` — motores por CLI.
- Cualquier id del catálogo `GET /api/mando/modelos` (`nim/…`, `xkiro/…`, `gemini/…`, `openrouter/…`,
  pasarelas) — responde la ruta con `llamarModelo` y el contexto de `agente-puente`.

**Modelo inicial:** el compositor se abre con el último `motor/modelo` que eligió Alex en ese aparato
(localStorage `starseed.mando.director.modelo`); si no hay, con `director-presidente/auto`. Una sola vez
por aparato (`starseed.mando.director.presidente-1111`) lo guardado pasa al presidente; después manda lo
que Alex elija. El «Responder con» de cada mensaje sigue usando el último modelo del feed (una respuesta
del presidente cuenta como `director-presidente/auto`).

## 4. El hilo: lo que entra además de la conversación

El feed del chat es la **fusión** (por `t`, sin duplicados por `id`) de:

1. `director/chat.jsonl` — conversación, respuestas, informes de Claude e informes de uso.
2. `mando/canal.jsonl` — los directores (`puente.decir`) y Telegram. `{t, epoch, quien, tipo, texto, tarea?}`.
3. `olas/eventos.jsonl` — solo lo importante del enjambre: `commit`, `esperando_aprobacion`, `aprobacion`,
   `rechazada`, `fallo*`, `sin_cambios`, `proveedor_caido`, `arranque` y los «cola terminada» → `actualizacion`.
4. `relevo/bitacora.jsonl` — notas y relevos entre agentes.

Cada fuente se lee por la **cola** (≤ 256 KB): el 03-10 el servidor de Genesis murió por leer archivos
enteros en cada petición.

**Papel de quien habla** (`rolDeDirector(quien)`): verificador (vigia, revision-opus, director-opus),
supervisor (director, director-orquestacion, claude-*, astra), restaurador (vigilante, reconstruir,
curar, desatascador), protector (guardia, gobernador, vigia-consumo, freno), procesos (enjambre, eco,
orquestador), pruebas (eventos `fallo_tests`/`fallo_tsc`), informes (informe*, director_suenos),
usos (uso, consumo, jev). El resto: agente.

**Informe de uso** cada 3 h (y a demanda): el cartero publica un `tipo: "uso"` con Jev
(`decidir.py uso --json`), el consumo (`~/.starseed/consumo.json`), Opus de los directores
(`~/.starseed/opus-director-uso.json`) y el crédito de Claude nube.

## 5. La interfaz

En `/genesis`, **encima** del «Pulso del trabajo» (`centro-mando.tsx`), plegable y abierto por defecto:

- Pestañas: Todo · Dirección · Conversación · Informes · Enjambre · Usos.
- **Dirección** (`esDireccion`, igual en `director_presidente.es_direccion`): todo lo de Alex; todo lo del
  canal `director-presidente` o con `sintesis`; lo que publica un **director de conversación**
  (`esDirectorDeConversacion`: `director-presidente`, `hermes`, `chatgpt`, `codex`, `antigravity`, `claude*`)
  salvo una respuesta a algo que se ve y no es de Alex; y la respuesta de un modelo de la API a Alex. Los
  servicios que firman «director-…» (revisor-bloqueadas, director-autocuracion, director-produccion…) no son
  directores de conversación: medido el 2026-11-11 eran el 95 % del chat, y 91 respuestas de Hermes
  contestaban avisos del desatascador.
- **Chips de filtro** bajo las pestañas, uno activo por pestaña, recordado en el aparato
  (`starseed.mando.director.filtros`). Solo se ofrece un chip que deja algo y no lo deja todo igual:
  Todo → Sin el enjambre · Última hora · Hoy; Dirección → Todos los directores · Director presidente ·
  cada director presente · Solo síntesis; Conversación → Solo tuyos · cada director que contestó;
  Informes → Informes · Avisos · autores más activos; Enjambre → Fallos · Commits · Aprobaciones ·
  Proveedores caídos · Colas terminadas (campo `evento`, solo en memoria) · Última hora; Usos → Hoy · 7 días.
  Un chip guardado que hoy no deja nada lo dice y se quita con un toque («Quitar el filtro»).
- Cada mensaje: autor y papel, canal de origen, modelo, uso, hora; botones **«Responder con [modelo ▾]»**
  y **«Enviar a [canales ▾]»**; estado de entrega por canal («en la próxima revisión de Claude» cuando
  es `claude-cowork`, para no prometer inmediatez).
- Compositor: texto + selector de modelo (motores arriba, catálogo debajo) + canales (varios) + Enviar.
- Se relee cada 10 s (`?desde=<último t>`).

## 6. Puentes para los IDE y la terminal

- **MCP** `scripts/puente/mcp_director.py` (stdio, sin dependencias): herramientas `director_leer`,
  `director_decir`, `director_bandeja`. Se registra en Claude Code (`claude mcp add`), Codex
  (`~/.codex/config.toml`), Hermes (`~/.hermes/config.yaml`) y Antigravity/Cursor con
  `scripts/puente/instalar_director.py` (muestra lo que cambiaría; `--aplicar` lo hace).
- **Terminal:** `python3 scripts/puente/director_chat.py leer|decir|bandeja|publicar`.

## 7. La sesión de Claude (Cowork) como director

La sesión de Cowork no puede recibir un empujón desde la Mac. Por eso: (1) publica cada informe en
`chat.jsonl` (`de: claude-cowork`, `modelo: claude-cowork/claude-opus-5-5`, `tipo: informe`); (2) en
cada revisión programada, **lo primero** es leer `bandeja/claude-cowork.jsonl`, contestar en el chat y
marcar la entrega `respondido`. Mientras el código no exista, publica en `canal.jsonl` con
`quien: claude-cowork` (el feed ya lo recoge).

## 8. El Director presidente (DIR1111G · 2026-11-11)

> Alex: «un canal principal, el Director presidente, que se autoenrute entre modelos, contigo [Claude] así
> como con Hermes y otros medios y proveedores… el que debe responder lo principal de los chats de dirección».

**Camino de un mensaje.** Compositor (por defecto `director-presidente/auto`) → `POST /api/mando/director-chat`
`decir` → la ruta publica el mensaje con `canales: ["director-presidente"]` y su entrega `pendiente` (igual que
cualquier motor) → el cartero (cada 5 s) lo ve en `que_hacer` y llama a `director_presidente.atender`.

**Quién contesta**, en este orden, con lo que Genesis ya tiene (no hay lista nueva de modelos):
1. **Claude** Opus 5.5 en la Mac (`claude -p`, el motor de `claude-mac`), solo si `limites_claude.estado` tiene
   una lectura de menos de 2 h, ni la sesión ni la semana en «peligro» (≥ umbral, 90 %), y el tope diario de Opus
   del cartero (`opus_hoy` < `STARSEED_DIRECTOR_TOPE_OPUS`, compartido con `claude-mac`) no está agotado. Sin lectura
   reciente no se arriesga.
2. **Hermes** (`hermes -z`, en la sesión de dirección de `direccion-motor.json`), que se autoenruta por los
   proveedores gratuitos vivos (`enrutar-hermes.py`). Una salida «every provider in the fallback chain kept
   failing over» no es una respuesta.
3. **ChatGPT** por Codex (`codex exec`), si la orden está instalada.

Un proveedor que falla queda apartado 10 min y se prueba el siguiente. El prompt lleva el contexto del proyecto
y los últimos 20 mensajes de **dirección** (no la rutina), con autor y tipo, para que pueda hablar de lo que
informaron los demás directores.

**La respuesta** se publica con `de: "director-presidente"`, `canal: "director-presidente"`, `tipo: "respuesta"`,
`modelo` = el que contestó, `respondeA`, `uso`, `sintesis: true` y `eleccion` (quién, con qué modelo y por qué no
los anteriores); la tarjeta lo enseña debajo del texto.

**Si nadie puede**: no se tira ni se contesta con una frase hecha. La entrega sigue `pendiente` con
`detalle: "En cola: ningún director puede contestar ahora (…motivo de cada uno…). Se reintenta solo cada 2 min."`
(solo se escribe cuando cambia), la tarjeta lo dice tal cual y el cartero no lo da por atendido: lo reintenta
cada 2 min. El mensaje se guarda en `cartero-estado.json` (`presidente.cola`), así que sigue en cola aunque salga
de los 200 registros que lee el cartero.

**Canales iguales en los dos lados**: `CANALES` de `chat-director-tipos.ts` y de `director_chat.py`, y
`PROVEEDORES_PRESIDENTE`/`PROVEEDORES`, tienen el mismo orden; `chat-director-direccion.test.ts` y
`test_director_presidente.py` fallan si se separan.

### Sesión de dirección de Hermes en pausa (HER1111K · 2026-11-11)

Hermes bloquea una sesión cuando su gateway muere a mitad de turno y no la usa hasta que una persona confirme
el turno perdido; mientras, cada mensaje devuelve un aviso de pausa (`hermes --resume <id> -z …`, código 3 o,
como se vio, 0). `motores_director.es_pausa_hermes(rc, salida)` lo reconoce por código y por texto (defensivo:
salidas cortas con «hermes sessions discard», «this chat is paused» u otros rastros) y `hermes_con_pausa`
reintenta UNA vez sin `--resume` (sesión nueva, un solo tiro) con el contexto y el hilo de dirección del
presidente acotados a 24 000 caracteres. El aviso crudo va al registro del cartero y **nunca** se publica como
respuesta; si la sesión nueva también falla, sigue el camino de fallo de siempre (siguiente proveedor / cola /
`fallo`). La respuesta sale atribuida: `uso.via = "hermes-sesion-nueva"`, `eleccion.modelo` con «sesión nueva…
en pausa» y `eleccion.sesionNueva` (presidente), o una primera línea en el texto (canal `hermes`). Alex recibe UN
aviso del cartero por sesión en pausa (id, desde cuándo, qué significa, que Genesis sigue con sesiones nuevas y
la orden `hermes sessions discard <id> --yes`); `cartero-estado.json › hermes_pausas` lo recuerda y solo lo repite
si pasa un día y sigue. Cada mensaje prueba antes la sesión de dirección: al reabrirse, Genesis vuelve a ella
sola y lo dice una vez. Confirmar el turno perdido es de una persona: ningún código lo ejecuta.

## 9. La respuesta final de un director de fuera de Genesis

```
python3 scripts/puente/director_chat.py publicar "<respuesta final>" --de hermes --sintesis [--modelo hermes/<modelo>] [--responde-a md-…]
python3 scripts/puente/director_chat.py publicar --archivo informe.md --de claude-cowork --sintesis
```

`--de` con un director de conversación pone su canal propio (`hermes` → «desde Hermes», `claude-*` →
`claude-cowork`, `codex` → `chatgpt`); `--canal` lo cambia. Sale en «Dirección», atribuido a quien firma, y con
`--sintesis` en «Solo síntesis».
