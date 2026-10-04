# Chat Director del Puente de Mando — contrato (Ola 1004 · 2026-10-04)

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
escriben el Mando (ruta `/api/mando/director-chat`), el cartero (`scripts/puente/cartero_director.py`),
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
| `uso` | `{tokensEntrada, tokensSalida, segundos, coste}` | no | lo que costó esa respuesta |

### 1.2 Registro «entrega»

`{"tipo":"entrega","de_id":<id>,"canal":<CanalId>,"estado":"pendiente|entregado|respondido|fallo","t":<ISO>,"detalle":<texto opcional>}`

El estado de un mensaje en un canal es el **último** registro de entrega de ese par `(de_id, canal)`.

## 2. Canales (`CanalId`)

| Canal | Qué es | Cómo se entrega | Cómo responde |
|---|---|---|---|
| `mando` | el propio chat | — | — |
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

- `claude-cowork/claude-opus-5-5` — **por defecto**. La dirección.
- `claude-mac/claude-opus-5-5` — Opus 5.5 en la Mac (necesita la cuenta de Claude Code con saldo o con
  suscripción; hoy, 2026-10-04, contesta «Credit balance is too low»).
- `hermes/<modelo>` · `codex/<modelo>` — motores por CLI.
- Cualquier id del catálogo `GET /api/mando/modelos` (`nim/…`, `xkiro/…`, `gemini/…`, `openrouter/…`,
  pasarelas) — responde la ruta con `llamarModelo` y el contexto de `agente-puente`.

**Último modelo:** el selector se abre con el último `motor/modelo` que eligió Alex (localStorage
`starseed.mando.director.modelo`); si no hay, con el `modelo` de la última `respuesta` de rol
`director` del chat; si no, `claude-cowork/claude-opus-5-5`.

## 4. El hilo: lo que entra además de la conversación

El feed del chat es la **fusión** (por `t`, sin duplicados por `id`) de:

1. `director/chat.jsonl` — conversación, respuestas, informes de Claude e informes de uso.
2. `mando/canal.jsonl` — los directores (`puente.decir`) y Telegram. `{t, epoch, quien, tipo, texto, tarea?}`.
3. `olas/eventos.jsonl` — solo lo importante del enjambre: `commit`, `esperando_aprobacion`, `aprobacion`,
   `rechazada`, `fallo*`, `sin_cambios`, `proveedor_caido`, `arranque` y los «cola terminada» → `actualizacion`.
4. `relevo/bitacora.jsonl` — notas y relevos entre agentes.

Cada fuente se lee por la **cola** (≤ 256 KB): el 03-10 el servidor del Mando murió por leer archivos
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

En `/mando`, **encima** del «Pulso del trabajo» (`centro-mando.tsx`), plegable y abierto por defecto:

- Filtros: Todo · Conversación · Informes · Enjambre · Usos.
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
