# 💠 Orquestación multiagente económica — regla permanente (Adenda 219 · 2026-09-02)

> **Para cualquier modelo que trabaje en StarSeed, desde cualquier medio** (Claude Code en
> el Mac, Cowork/claude.ai, Hermes, Gemini, Codex, OpenCode, Antigravity, el propio OS):
> **ningún modelo, proveedor ni sesión debe agotar sus créditos.** Las tareas se
> **ramifican** por coste e inteligencia (lo mecánico a modelos gratis/baratos, lo difícil
> a modelos capaces), el progreso se **autoenruta** a otros modelos y sesiones para que la
> tarea continúe sola, y cada ola termina con su **punto de relevo** escrito.

## 0. Cómo se opera el Puente de Mando — vinculado a cada sesión (regla permanente · 2026-09-12)

**Enlace:** el Mando vive en **http://localhost:9002/mando** en la Mac (servicio launchd
`com.starseed.mando`; si no responde: `bash scripts/puente/instalar-servicios.sh`). Desde la
terminal: `starseed-puente estado | agentes | olas | cola | puertas | briefing | mensajes`.
Desde Telegram: el bot `@starseed_puente_bot` con `/estado /agentes /olas /cola /puertas`.
Todo lo que dice cualquier agente o modelo va al canal común `starseed_memory_root/mando/canal.jsonl`
(`starseed-puente decir "…"`), que es el chat principal de los cuatro IDE y de Telegram.

**Quién vigila qué, y con qué modelo — la pirámide de coste:**

| capa | quién | modelo / coste | cada | qué hace |
| --- | --- | --- | --- | --- |
| 0 · trabajo | el enjambre (N agentes, UN orquestador) | flota gratuita (§5): llm7, NIM, Groq, OpenRouter, Apinex… | continuo | escribe las olas, ≤3 archivos / ≤120 líneas por tarea |
| 1 · directores 24/7 | `vigilante` · `director` · `guardia` · `eco` · `ecoides` · `telegram` (launchd) | **cero créditos**: Python puro | 90 s / 180 s | relanza el enjambre si hay trabajo real, **reconcilia `progreso.json` con git**, aprueba lo revisado, congela BitNet, replica el canal a los IDE |
| 2 · dirección | Astra (Codex/ChatGPT) como director principal | cupo de ChatGPT | cuando hace falta | diseña olas, decide dependencias, verifica en localhost |
| 3 · revisión de precisión | **Claude Fable / Opus** (Cowork o Claude Code) | créditos de Claude, los caros | **una vez por hora** (tarea programada) y cuando algo se rompe | audita a los directores (¿reconciliaron? ¿aprobaron bien?), la salud completa del Mando medidor a medidor, y **arregla lo que la capa 1 no sabe arreglar** |

**Escalera de escalado (regla de Alex, 2026-09-12) — «0 en curso con pendientes» es una alarma, no un
estado.** Cuando hay tareas pendientes y nadie escribe, o una tarea falla, **los directores lo resuelven
solos, sin esperar a nadie**: el vigilante relanza; el director reconcilia `progreso.json`, reintenta
UNA vez con otro proveedor lo que quedó `sin_cambios` (p316H) y, si sigue sin salir, **sube de
peldaño** (p316J + p316K):

| peldaño | quién escribe | cuándo | tope |
| --- | --- | --- | --- |
| 0 | flota gratuita (§5), 2 intentos con proveedores distintos | siempre primero | — |
| 1 | **Claude más barato** (el `haiku` más reciente del catálogo vivo de Anthropic) | tras 2 intentos gratis fallidos | 20 tareas/día |
| 2 | **Claude medio** (`sonnet` más reciente) | solo si la tarea es compleja (≥3 archivos, `dificultad: alta`, o revisión bloqueante de diseño) y haiku falló | 5 tareas/día |
| 3 | Claude caro (`opus`/`fable`) | **nunca solo**: lo pide una persona | — |

Cuando se agota un tope o una tarea falla en el peldaño 2, el director **para y avisa a Alex** en el canal
(y por Telegram) con la tarea, lo probado y la decisión que hace falta. Los modelos de pago **no entran
en la rotación gratuita**: solo se usan cuando la tarea trae `modelo: anthropic/...` explícito, y el
gasto del día queda en `starseed_memory_root/olas/escalada-gasto.json`.

**Regla de cuotas:** la cuota de Claude se renueva por **ventana de 5 horas** y por **semana**; la
de ChatGPT/Codex por ventana de horas y semana también; las gratuitas por día o por minuto (§5).
Nunca se gasta la ventana entera de un proveedor caro: si Claude va por encima del 80 % de la
semana, la capa 3 pasa a **solo lectura** (auditar y proponer) y lo que haya que escribir se
ramifica al enjambre o a Astra. **Lo largo y pesado va siempre a la capa 0**, aunque tarde más.

**Lo que la capa 3 comprueba cada hora (y anuncia en el canal como `SALUD · …`):**
1. Orquestador: ¿hay latido fresco? Si no y hay pendientes reales, ¿por qué no relanzó el vigilante?
2. Directores: ¿los seis servicios `com.starseed.*` con pid y exit 0? (`bash scripts/puente/instalar-servicios.sh estado`)
3. `progreso.json` honesto: cero `en_curso` sin latido, cero `bloqueada` cuya dependencia ya está en main
   (`python3 scripts/puente/reconciliar_progreso.py` sin `--aplicar` lo lista).
4. Proveedores: cuáles agotados, cuándo renuevan, a quién se está enrutando.
5. Cada medidor del Mando contra la realidad (cabecera, olas, agentes, puertas, disco).
6. Punta de git: `main` local vs `origin/main`, árbol limpio, y **que ningún archivo haya encogido**
   (ver regla de abajo). Publicar solo con las tres puertas en verde.
7. Sugerencias: qué mejorar del Puente, escritas como tareas para el enjambre, no hechas a mano.

**Regla nueva (2026-09-12), aprendida a golpes:** *la salida de un motor de escritura es un
CANDIDATO, no un archivo.* Codex CLI como motor escribió su respuesta de chat dentro de
`starseed-enjambre.py`, `router.ts` y `free-catalog.ts` (3.641 → 141 líneas; 1.694 → 5) y un
«director final» los integró en main sin pasar las puertas. Por eso ahora: `test_guiones_parsean.py`,
la puerta de sintaxis en `lanzar-enjambre.sh`, y `archivos_degenerados()` + vitest obligatorio en
el orquestador (tarea p316G). **Un archivo que encoge más de la mitad en un «fix» no se integra.**
`director-final.py` e `integrador-selectivo.py` **se retiraron** el mismo día: eran un segundo
orquestador (regla rota) con Ollama 7B (no cabe en 8 GB junto al enjambre); lo que valía de ellos
—la puerta de archivos degenerados— pasa al orquestador único.

**RAM, disco y dónde corren los agentes (2026-09-12, tras un kernel panic a las 14:04):**
- La Mac tiene **8 GB**. No caben a la vez: `next build` (≥2,5 GB) + voz (`tts-server`, ~0,9 GB) +
  BitNet (`llama-server`, ~0,5 GB) + `next dev` + el enjambre. Regla: **el build se hace con el
  enjambre parado y voz/BitNet descargados** (`launchctl unload` de `com.starseed.astraura-voice` y
  `com.starseed.astraura`, y se recargan al terminar), con `NODE_OPTIONS=--max-old-space-size=2560`.
  El guardia congela BitNet (y, cuando entre la tarea p316F, también la voz) mientras el enjambre escribe.
  **Nunca un `next dev` permanente**: el Mando es `next start` sobre el build.
- Disco: nunca por debajo de **5 GB libres** (con 1 GB SQLite se corrompió y Hermes perdió sus chats).
  Lo regenerable (cachés de apps, `node_modules` de worktrees, builds viejos, `npm cache`) se borra sin
  preguntar; lo pesado que haya que conservar (modelos, exportes, vídeos) va al **Google Drive
  vinculado**, nunca a `~/Documents`. Datos de proyecto y de cuentas: jamás, y con copia antes de tocar.
- **La nube trabaja sola (2026-09-13):** tres latidos programados (`:12`, `:32`, `:52`) nacen en un
  contenedor limpio, clonan `origin/main`, leen las colas **versionadas** en `enjambre/colas/*.json`
  (lo único que sobrevive al contenedor es git: `starseed_memory_root/` no existe allí), seleccionan lo
  pendiente contra `git log main` (una tarea está hecha si su id figura en un asunto), lanzan UN
  orquestador con 6 trabajadores 25 min, pasan las tres puertas (allí sí cabe `next build`) y publican.
  Un comando lo hace todo cuando exista: `bash scripts/enjambre/nube-arrancar.sh` (p317A); la Mac
  reparte el atraso con `scripts/puente/repartir-a-nube.py` (p317B) y marca `reasignada · nube`.
  **Lo que solo puede hacer Alex:** añadir `StarSeedSystem/starseed-system` a las **fuentes de la
  sesión** en la app — sin eso el push desde la nube da 403 y todo vuelve como parches en el proyecto.
  La flota de la nube no tiene claves (por diseño): llm7 y lo que no exija clave; si se quiere NIM allí,
  la clave va en las variables de entorno de la tarea programada, nunca en el repo ni en un chat.
- **Más agentes sin más RAM: la máquina virtual de Claude en la nube** (la tarea horaria y las sesiones
  de Cowork) corre su propio orquestador con `STARSEED_MEDIO=nube` y 6 trabajadores sobre un clon de
  `origin/main`; `medios.py` reparte las tareas entre Mac y nube por lease y se reorganiza si uno cae.
  Lo que la nube integra llega a la Mac por `origin/main` (o por parche en el proyecto si el proxy da 403).
  Cuando la Mac vaya justa, **la ola va a la nube, no a más procesos en la Mac.**

**Recursos de API — solo nombres de variable, nunca valores** (los valores viven en
`~/.starseed/env` y `~/.hermes/.env`, chmod 600): `GROQ_API_KEY`, `NVIDIA_API_KEY`, `OPENROUTER_API_KEY`,
`GEMINI_API_KEY`, `GOOGLE_API_KEY`, `DEEPSEEK_API_KEY`, `HF_TOKEN`, `TOKENROUTER_API_KEY`, `AIHUBMIX_API_KEY`,
`XKIRO_API_KEY`, `ANTHROPIC_API_KEY`, `STARSEED_PASARELA_GROQ_*`, `STARSEED_PASARELA_APINEX_*`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. El catálogo vivo de modelos gratuitos está en
`src/ai/astraura/free-catalog.ts`; el orquestador rota claves solo (`clave_activa`/`agotar_clave`).

## 1. Regla de conducta del modelo (léela como instrucción)

1. Antes de empezar una ola, estima su coste. Si tu presupuesto de sesión no la cubre,
   **divide** la ola y delega las partes mecánicas (búsquedas, resúmenes, clasificación,
   refactors pequeños, verificación de texto) a subagentes gratuitos.
2. Reserva tu capacidad para **orquestar, decidir y verificar**. Texto antes que capturas;
   ediciones dirigidas antes que regenerar archivos; mapas/adendas antes que re-explorar.
3. Cuando un proveedor devuelva 429/402/«quota», **no insistas**: releva al siguiente de la
   cadena y sigue. El relevo es preventivo (presupuesto diario) y también reactivo.
4. Si te acercas a tu propio límite (contexto o créditos), **deja el punto de relevo**:
   commit + adenda del proyecto + `starseed_memory_root/state.md` con «hecho / verificado /
   pendiente / siguiente paso exacto». Otro modelo continúa desde ahí sin re-explorar.
5. Nunca guardes claves en el repo, en las memorias ni en documentos: solo nombres de
   variables. Las claves viven en `.env.local`, en Vercel (Environment Variables) y en
   `~/.hermes/.env`.
6. **Cierra cada respuesta con un informe de uso** (regla de Alex, 2026-09-03): qué modelos,
   APIs, tokens y créditos se usaron en la respuesta, cuánto queda (presupuesto de la sesión,
   contadores diarios de `uso-diario.json`, `GET openrouter.ai/api/v1/auth/key`, lo que cada
   proveedor exponga) y qué opciones de enrutamiento hay para continuar (capas de §2).

## 2. Las tres capas que ya existen (y dónde se editan)

| Capa | Qué hace | Dónde se ve/edita |
|---|---|---|
| **Desarrollo · `starseed-sub <rol> "prompt"`** (`~/.local/bin/starseed-sub`) | Despacha subtareas por ROL (`resumen`, `razonar`, `codigo` + alias) a una cadena de motores gratis: `hermes` (OpenRouter `:free`, Nous), `opencode`, **`nim`** (NVIDIA NIM directo). Relevo preventivo por presupuesto diario (`uso-diario.json`, `_LIMITE_DIA`) y reactivo por fallo. | Editar `ROLES` y `_LIMITE_DIA` en el script. |
| **Hermes (gateway y CLI)** (`~/.hermes/config.yaml`) | Modelo por defecto + `fallback_providers` (nous → openrouter → **nvidia**). Proveedor personalizado `providers.nvidia` (OpenAI-compatible, `key_env: NVIDIA_API_KEY`). | `hermes -z "…" -m <modelo> --provider nvidia` · editar `fallback_providers`. |
| **Runtime del OS · Astraura** (`src/ai/astraura/router.ts` + `free-catalog.ts`) | `astrauraChat` clasifica la tarea, puntúa fuentes (`freeFirst`, `perTask`, `disabledSources`, privacidad, dificultad), releva con enfriamiento por fuente y registra cada ruta (`readRouteLog`, clave `starseed.astraura.routes.v1`). Proxies comunitarios con clave rotatoria **solo en el servidor**: `/api/ai/openrouter` (`OPENROUTER_SHARED_KEY`) y `/api/ai/nvidia` (`NVIDIA_SHARED_KEY`). | Ventana de Astraura → pestaña **Inteligencia** (`src/components/astraura/inteligencia-section.tsx`): motores en uso, modelo/tokens/contexto, editar motor por tipo de agente, instrucciones, conexiones. |

## 3. Proveedores gratuitos disponibles (catálogo vivo en `free-catalog.ts`)

Astraura 1.58-bit (propio, primario) · Ollama/LM Studio locales · Gemini (clave gratis) ·
Groq · Cerebras · OpenRouter `:free` (comunitario) · **NVIDIA NIM** (comunitario; 82 modelos
verificados el 2026-09-02: Nemotron 3 Ultra/Super/Nano/3.5 Lightning, DeepSeek V4 Flash/Pro,
Kimi K3, gpt-oss 120B, Gemma 4 31B, Mistral Large 2, Llama 3.2 Vision) · Pollinations/LLM7
sin clave · Cloudflare Workers AI · Hugging Face · Mistral · Nous · OpenCode.

Medido el 2026-09-02 con la clave comunitaria: Nemotron 3 Super 1,0 s · Ultra 2,3 s ·
Kimi K3 3,8 s · DeepSeek V4 Flash 7,4 s · gpt-oss 120B 24 s · DeepSeek V4 Pro puede pasar
del minuto (dejarlo para tareas largas). `mistralai/codestral-22b` NO se sirve en chat (404).

## 4. Variables de entorno (solo nombres)

`NVIDIA_SHARED_KEY` (+`_2`,`_3`,`_4`) · `OPENROUTER_SHARED_KEY` (+`_2`…) · `RESEND_API_KEY` ·
`GROQ_API_KEY`/claves personales en Ajustes → Inteligencia (cifradas en el dispositivo) ·
`NVIDIA_API_KEY` en `~/.hermes/.env` (Hermes y `starseed-sub`).

## 5. Flota de proveedores (2026-09-04)

Flota real comprobada hoy. REGLA ABSOLUTA: nunca escribir una clave; solo el **nombre** de la
variable de entorno (viven en `~/.hermes/.env` con permisos 600 y en `.env.local`, jamás en el
repositorio).

| Proveedor | base_url | Variable de entorno | Modelos gratuitos verificados | Límite conocido | Papel en el enjambre |
|---|---|---|---|---|---|
| **NVIDIA NIM** | `https://integrate.api.nvidia.com/v1` | `NVIDIA_API_KEY` / `NVIDIA_SHARED_KEY` | 82 modelos (`kimi-k3`, `deepseek-v4-flash`, `gpt-oss-120b`, `nemotron-3-super`) | ~40 req/min | **ESCRITOR principal** vía opencode |
| **AIHubMix** | `https://aihubmix.com/v1` | `AIHUBMIX_API_KEY` | 412 modelos, 54 gratuitos; verificados: `coding-glm-5.3-free` (1,4 s) y `gemini-3.7-flash-free` (3,2 s); sin canal ahora mismo: `minimax-m3-free`, `nemotron-3.5-lightning-free`, `hy3-free`; los NO gratuitos (`glm-5.2`) dan 403 por saldo | — | **REVISOR principal** desde hoy |
| **OpenRouter `:free`** | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` | modelos `:free` | 50 peticiones/día sin saldo (se agota pronto: da 429 el resto del día) | revisor de reserva |
| **Google Gemini** | `generativelanguage.googleapis.com` | `GEMINI_API_KEY` | `flash-lite` | ~15 req/min | última reserva (se deja al final para no gastar en Google) |
| **TokenRouter** | `https://api.tokenrouter.io/v1` | `TOKENROUTER_API_KEY` | `z-ai/glm-5.3-free`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | **PENDIENTE**: su API exige una clave de INFERENCIA que empieza por `tr_`; los tokens `sk-` del panel (de gestión) devuelven 401 «Missing or malformed API key» | — |
| **Nous Portal** | — | — | — | cuota del plan | orquestación y verificación |
| **xKiro** | `https://api.xkiro.com/v1` | `XKIRO_API_KEY` | 40 gratuitos con tool-calling (`qwen3-coder-plus`, `minimax-m3`, `devstral-medium`…) | 5M tokens/día; cuota diaria en los `:free` | **ESCRITOR** (opencode edita de verdad con ellos) y revisor primero |
| **LLM7.io** (itsfree.ai) | `https://api.llm7.io/v1` | `LLM7_API_KEY` (opcional) | **sin clave**: `gpt-oss` (20B) y `minimax-m2.7` (verificados 2026-09-05, revisión real en 14 s); con token: 44 modelos (deepseek-v4-flash, glm-5.3-flash…). Sus etiquetas «claude/gpt-6» son reventa: no se usan | 10 req/min sin clave (40 con token) | revisor de respaldo, siempre disponible |
| **FreeTheAi** | `https://api.freetheai.xyz/v1` | `FREETHEAI_API_KEY` | 60+ modelos (gpt-oss-120b…); clave por su Discord (`/signup` y `/checkin` diario; la crea Alex, nunca un agente) | 10-35 req/min, 250/día | revisor de reserva (solo con clave) |
| **Pasarela declarada por entorno** | `STARSEED_PASARELA_<NOMBRE>_URL` | `STARSEED_PASARELA_<NOMBRE>_KEY` (+ `_MODELOS`, `_RPM`) | cualquier enrutador OpenAI-compatible: **freellmapi** en local (`http://127.0.0.1:3001/v1`, 29 proveedores gratis tras un bearer, ~40 MB RSS), NavyAI, pasarela propia… | el que declare `_RPM` (10 si falta) | revisor; entra sin tocar código en el orquestador y en el catálogo del Mando |

### Catálogos de proveedores gratuitos (2026-09-05)

- **itsfree.ai/?cat=api** — directorio de 25 proveedores con nivel gratuito verificado (Groq, Cerebras,
  Cloudflare Workers AI, ModelScope, Z.ai, SambaNova, OpenCode Zen, LLM7, NVIDIA, Gemini…). Los que
  faltan en nuestra flota necesitan una cuenta que solo Alex puede abrir: Groq, Cerebras, Cloudflare,
  ModelScope, Z.ai, SambaNova, OpenCode Zen (y el token de LLM7 para pasar de 10 a 40 req/min).
- **github.com/tashfeenahmed/freellmapi** (MIT) — enrutador autoalojado: 29-34 proveedores gratis,
  358-635 endpoints, ~4-7.400 M tokens/mes, un solo bearer, failover automático en 429/5xx, perfiles
  `auto`, `auto:fast`, `auto:smart`; catálogo vivo en freellmapi.co/models. Candidato a correr en la nube
  (Node 20+, ~40 MB) cuando Alex meta sus claves en su panel (puerto 3001); se conecta como pasarela.
- **github.com/Free-The-Ai/free-ai** — pasarela comunitaria (ver fila FreeTheAi).
- **github.com/public-apis/public-apis** — ya indexado en `starseed_memory_root/fuentes/apis-publicas.json`.

## 6. Agentes de código disponibles

- **opencode 1.2.15** — `opencode run --model <proveedor>/<modelo> --dir <ruta>`, configurado en
  `~/.config/opencode/opencode.json` con los proveedores `nvidia` y `aihubmix`. Es el ESCRITOR
  principal del enjambre.
- **UTIM** (`@emend-ai/utim` v2.3.19) — «Universal Terminal Intelligence Manager», instalado
  como segundo tipo de trabajador para multiplicar agentes en paralelo.

## 7. Política de enrutamiento automático del enjambre

Escribir con xKiro y NVIDIA NIM (opencode) y revisar con xKiro → LLM7 (sin clave) → AIHubMix →
tokenrouter → NIM → OpenRouter → Gemini → FreeTheAi → pasarelas declaradas. Ante un fallo o cuota
agotada se releva en cascada sin que ningún proveedor llegue a agotarse. Los cupos por minuto los
declara cada proveedor en `~/.local/bin/starseed-enjambre.py` (constante `CUPOS_RPM`; las
pasarelas, con `STARSEED_PASARELA_<NOMBRE>_RPM`).

## 8. Protocolo de relevo entre sesiones y medios

1. **Al abrir**: leer `CLAUDE.md`, `starseed_memory_root/index.md`, la última adenda del
   proyecto (`claude/adenda-NNN-…`) y `claude/memorias-workflow-continuidad.md`.
2. **Durante**: cada bloque verificado → commit con trailer; cada decisión → adenda.
3. **Al cerrar o al acercarse al límite**: punto de relevo en `state.md` + adenda + push.
4. **Verificación obligatoria**: nada se reporta como hecho sin probarlo en localhost con
   interacción real (regla de Alex).

## 7. Relevo Claude ⇄ Hermes ⇄ enjambre (2026-09-03)

- Estado compartido: `starseed_memory_root/relevo/` (estado.json · relevo.md · bitacora.jsonl · PROMPT-HERMES.md · PROMPT-CLAUDE.md), CLI `~/.local/bin/starseed-relevo` (Python sin dependencias).
- Protocolo: `estado --por <agente>` al empezar → `nota --de <agente>` al avanzar → `handoff --de <agente> --a <otro> "resumen"` al parar. `tarea`/`pendiente` para trabajo compartido; `contexto <agente> clave=valor` para sesión/modelo/estado.
- Qué comparte: uso/cuota por motor (uso-diario.json del enjambre + modelos de progreso.md + límites), contexto de cada agente (sesión, modelo, tamaño), rutas y carpetas, git (HEAD, sin push, sin commit), cola y progreso de olas (procesadas, sin cambios, bloqueantes, restantes), tareas, pendientes, adenda actual, enlaces.
- Hermes: skill `~/.hermes/skills/starseed-relevo/SKILL.md` + bloque en `~/.hermes/SOUL.md` + enlace en `~/.hermes/memories/MEMORY.md`. Chat nuevo de StarSeed en Hermes = pegar `PROMPT-HERMES.md` (o `starseed-relevo prompt --para hermes`).
- Claude sin puente a la Mac: doc del proyecto `claude/relevo-actual.md`; Alex pega `PROMPT-CLAUDE.md` en la sesión nueva.
- Un solo agente escribe en el working tree a la vez; los crons de Hermes no hacen git add -A ni push (el watchdog del túnel quedó sin permiso de git el 03-09).
- Contexto largo = créditos: cada llamada reenvía TODO el historial (>200k tokens es caro aunque los tokens nuevos sean pocos). Sesión nueva + relevo antes que sesión eterna. Nunca reportar como «créditos restantes» un contador de contexto.

## 📚 Fuentes externas de APIs, herramientas y patrones (regla permanente · 2026-09-04)

Antes de inventar un endpoint, un conector o un patrón de agente, **se mira si ya existe**. Seis
catálogos indexados en local, refrescables con `starseed-fuentes refrescar` y consultables con
`starseed-fuentes buscar <texto>` (acepta español). Índices en `starseed_memory_root/fuentes/`:

| Fuente | Licencia | Para qué |
|---|---|---|
| [public-apis](https://github.com/public-apis/public-apis) | MIT | 1737 APIs públicas gratuitas en 51 categorías → `apis-publicas.json` |
| [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) | MIT | 3477 servidores MCP → `mcp-servers.json`. Todo agente debe llevar los MCP que su tarea necesite |
| [awesome-llm-apps](https://github.com/Shubhamsaboo/awesome-llm-apps) | Apache-2.0 | 100+ agentes y habilidades: siempre activos, equipos multiagente, voz, UI generativa, memoria, RAG |
| [OpenDesign](https://github.com/nexu-io/open-design) | Apache-2.0 | Diseño nativo de agentes: prototipos, presentaciones, paneles, imágenes, documentos y motion MP4; importa de Figma |
| [Langflow](https://github.com/langflow-ai/langflow) | MIT | Flujos de agente visuales desplegables como API o servidor MCP; candidato a diseñar las olas |
| [OpenHands Agent Canvas](https://github.com/OpenHands/openhands) | MIT | Ejecuta agentes en local/Docker/VM. Sin CLI headless (verificado): sirve para paralelizar fuera de la Mac, no como ejecutor del enjambre |

El enjambre las reparte solo: `contexto_inteligente()` mira las palabras de cada tarea y le pasa al
agente **el puntero y el comando de búsqueda**, nunca el catálogo entero (economía de contexto).

### Flota de escritores del enjambre (verificada 2026-09-04)

**xKiro** (`https://api.xkiro.com/v1`, clave en la variable `XKIRO_API_KEY`) — 110 modelos, **40
gratis con tool-calling** y 5M tokens/día. Comprobado en vivo que **opencode SÍ edita archivos**
con ellos (qwen3-coder-plus, minimax-m3 y devstral-medium modificaron un archivo de prueba);
esto es lo que fallaba con aihubmix y tokenrouter, que se quedan de revisores. Su Cloudflare
rechaza el User-Agent por defecto de urllib con 403: las llamadas HTTP mandan uno propio.

Escritores en rotación, alternando proveedor para repartir carga:
xkiro/qwen3-coder-plus · nim/kimi-k3 · xkiro/minimax-m3 · nim/deepseek-v4-flash ·
xkiro/qwen3.8-max · nim/deepseek-v4-pro · xkiro/deepseek-v4-pro · xkiro/devstral-medium.

Revisores: xkiro/qwen3.7-plus y xkiro/minimax-m2.7-highspeed primero, luego aihubmix,
tokenrouter, NIM, OpenRouter y Gemini al final (Google se reserva).

`validar_modelos()` comprueba los catálogos de NIM y xKiro al arrancar cada ola y saca de la
rotación lo que ya no exista. Modelos caídos el 2026-09-04: gpt-oss-120b (410, fin de vida),
qwen3-coder-480b (fuera del catálogo) y kimi-k2.6 (opencode no lo resuelve).

⚠️ Claves SOLO en `~/.hermes/.env` (chmod 600) y `.env.local` (ignorado por git). Nunca en el
repositorio, ni en documentos, ni en memorias: solo el nombre de la variable.

### Supervisor en tiempo real (2026-09-04)

Nada espera a una comprobación programada. Tres capas, todas dentro del propio orquestador:

1. **Supervisor de proveedores** (`supervisor_proveedores`, cada `STARSEED_SONDEO_S`=60 s): sondea
   con un GET barato xkiro, nim, aihubmix, tokenrouter y openrouter. Dos fallos seguidos y el
   proveedor se marca **caído** en `~/.starseed/salud-proveedores.json`, que **comparten todas las
   olas**: sus modelos salen de la rotación al instante y ninguna tarea pierde el tiempo
   intentándolo. Cuando vuelve a responder, se reincorpora solo. Ambos sucesos avisan al momento
   (bus + Hermes).
2. **Reenrutado dentro del bucle**: antes de cada intento se relee la salud; si ese proveedor
   acaba de caerse, se salta sin gastar intento (evento `reenrutado`).
3. **Vigilante de tareas** (cada 20 s), en dos tiempos:
   - `STARSEED_ARRANQUE_S`=120 s sin escribir **ni una línea** desde que empezó la fase → no está
     pensando, está atascado: se corta y se reenruta.
   - `STARSEED_ESTANCADO_S`=420 s sin avance a mitad de trabajo → mismo corte.
   La línea de partida del log se guarda por fase, para no confundir «escribió algo» con «el log
   ya venía lleno de una ola anterior».

La espera por memoria bajó de 15 a 5 minutos (`STARSEED_ESPERA_MEM_S`): pasado ese plazo arranca
igual y, si de verdad no puede, el vigilante lo corta a los dos minutos.

`starseed-vivo` muestra la salud de los cinco proveedores junto al estado de cada tarea.


## 9. Jev de consejero y el crédito de OpenRouter (regla permanente · 2026-09-20)

**Qué es.** Jev (TypeSafe, en OpenRouter) es un modelo de *decisión*, no de texto: recibe el
estado (JSON ≤ 32k tokens) y preguntas tipadas y devuelve respuestas con probabilidad — `noul`
(sí/no → `{"noul": p}`), `choice` (una opción entre ≤ 255, con probabilidades y `confidence`),
`score` (nivel en una escala; su `criteria` es un ARRAY ordenado). Medido: **0,56 s y
$0,000019 por decisión**; 34 decisiones sobre todo el atasco (79 tareas) costaron $0,00089.
Endpoint `POST https://openrouter.ai/api/alpha/decisions`, modelo `~typesafe/jev-latest`
(apunta siempre a la última versión), misma `OPENROUTER_API_KEY`.

**Para qué sirve y para qué no.** Abarata las DECISIONES, no la escritura de código: el enjambre
sigue escribiendo con Gemini directo, NIM, apinex y los gratuitos de OpenRouter. Jev entra donde
antes había un turno entero de LLM o una lista de subcadenas.

**Dónde está cableado** (todo puro, el consejero es un argumento opcional; sin clave, sin red,
sin presupuesto o con `STARSEED_JEV=0` devuelve None y la regla de siempre decide sola):

| Punto | Regla determinista (manda) | Jev (afina) |
|---|---|---|
| `scripts/puente/veredictos.py` (bloqueadas) | dependencia → esperar · sin archivos → descartar · objeción del revisor → reintentar con ella · todos los modelos muertos → reintentar tal cual | lo que queda; escribe `olas/veredictos.json` con `confianza` y `fuente` |
| `importancia.suena` (Telegram) | listas SIEMPRE/NUNCA de Alex, tipos fuertes | zona de duda: suena si P ≥ 0,8 |
| `pasarelas.clasificar` (errores) | pistas de texto y código HTTP | error desconocido: si confianza > 0,6 |
| `resolucion_automatica.decidir` (aprobar sola) | director + verificadores conformes | solo VETA si P(integrar sin visto bueno) < 0,3 |

Hermes (director del Mando) ejecuta `veredictos.py` primero y lanza un subagente **solo** para
las filas con `fuente: jev` y `confianza < 0,7`. El orden de las colas sigue siendo determinista
y sin modelo (decisión del 13/09): Jev opina, no ordena.

**El crédito (10 $, recargados el 2026-09-20) se cuida así:**
- Techo en `jev.py`: **0,05 $/día y 1 $/mes** (`STARSEED_JEV_DIA_USD`, `STARSEED_JEV_MES_USD`);
  pasado, Jev se calla. Caché de 6 h por huella: la misma pregunta no se paga dos veces.
- Gasto y saldo a la vista: `python3 scripts/puente/jev.py` (anota en `~/.starseed/jev-uso.json`,
  saldo de OpenRouter cacheado 1 h). Va en cada informe de gasto.
- En OpenRouter **solo ids `:free`** para agentes y para Hermes: con crédito en la cuenta, un id de
  pago se cobraría sin que nadie lo pidiera. El renovador trae cada 30 min los gratuitos con
  herramientas del catálogo público (`modelos_extra`, los de más contexto primero; copia en
  `~/.starseed/openrouter-gratuitos.json`), `pasarelas.modelos_utiles` los mete en la rotación y
  `enrutar-hermes` le da a Hermes el de más contexto. Así la flota se actualiza sola cuando
  OpenRouter estrena o retira gratuitos. Los 10 $ desbloquean además 1.000 peticiones diarias a
  esos gratuitos.
- Jev es consejero con umbral explícito, **nunca oráculo**: en RS3b contestó «descartar» 0,65 con
  confianza 0,47 — dividido — y la regla humana era reintentar. Decide con lo que le cuentas.
- Endpoint en *alpha*: si cambia el formato, `jev.py` devuelve None y nada se rompe.

## 10. Cuántos agentes a la vez y cómo añadir más (regla permanente · 2026-09-20)

Alex: «los directores deben vincular la mayor cantidad de agentes simultáneos». La respuesta
honesta tiene dos partes, y las dos están medidas.

**1. Por máquina, el tope lo pone la memoria, no el modelo.** Cada agente de código
(opencode/codex + su `git worktree` + las puertas `tsc`/`vitest`) cuesta ~1,5 GB en punta y las
puertas van detrás de UN cerrojo compartido: con 5 en la Mac de 8 GB hubo 10 GB de swap y cada
puerta tardó 10× (ola 325). Por eso el **gobernador de recursos**
(`scripts/puente/gobernador-recursos.py`, launchd `com.starseed.gobernador`, cada minuto) calcula
`maximo_por_hardware(RAM, núcleos)` = ≤ 8,5 GB → 3 · ≤ 16,5 GB → 5 · ≤ 32,5 GB → 8 · más → 12,
nunca más de (núcleos − 1), y lo escribe en `~/.starseed/gobernador.json` junto con el **tope
vivo**. Alex (2026-09-20, 22:40): «olvida lo de 1 agente, añade la mayor cantidad posible»: el tope
vivo es SIEMPRE el máximo; solo si la RAM libre cae por debajo de 150 MB (colapso, no el tamaño
del swap: esta Mac vive con 12-14 GB de swap e integra igual) se quita UN trabajador, nunca menos
de 2. El uso interactivo ya no frena nada: solo decide si se despierta a BitNet. El orquestador (`tope_gobernador()` en `starseed-enjambre.py`) lo relee cada 20 s y
solo decide cuántos LANZA: nada en marcha se interrumpe; si el gobernador muere, vale `--workers`.
`director-config.json.trabajadores` es el máximo deseado; el gobernador solo puede bajarlo.

**2. Para tener MÁS agentes se añaden MEDIOS, no procesos.** El enjambre ya es multi-medio
(`medios.json`, arriendos de 120 s, failover automático): cada medio corre su propio orquestador
contra la misma cola y se reparten las tareas por arriendo. Receta para sumar un medio (Linux o
macOS, arm64 o x86_64):
  1. `git clone` del repo del OS + `bash scripts/enjambre/instalar.sh` (copia el orquestador a
     `~/.local/bin`) + Node 22 + las claves en `~/.starseed/env` (las guarda Alex con
     `scripts/puente/guardar-clave.sh --ambos`; nunca se copian por chat).
  2. `python3 scripts/puente/gobernador-recursos.py` → dice cuántos caben en ESA máquina.
  3. `starseed-enjambre.py starseed_memory_root/olas/<cola>.json --workers <maximo_hardware>` con
     la cola sincronizada (git o Drive) y el vigilante (`com.starseed.vigilante` / systemd) para
     relanzar solo.
  4. El medio tiene que poder **publicar**: `git push` autorizado (el contenedor de Cowork NO puede:
     el proxy deniega `StarSeedSystem/starseed-system` salvo que Alex lo añada a las fuentes de la
     sesión; hasta entonces sus commits viajan por `git bundle` en el bus).
Medios que caben hoy: Mac M1 8 GB → 3; contenedor de Cowork 2 vCPU/8 GB → 1 (y muere con la
sesión); **Oracle Free Tier ARM (4 OCPU/24 GB, gratis) → 3 permanentes**; un VPS de 16 GB/8
núcleos → 5. Hermes suma **agentes de razonamiento** aparte (delegate_task, 4 hijos a la vez, sin
RAM local: el límite es el RPM gratuito de Gemini), pero esos no pasan puertas ni integran código.

**Los directores recuerdan esto así:** al reportar «agentes escribiendo ahora: N», decir también
«máximo en esta máquina: M (gobernador)» y, si Alex pide más, proponer el medio siguiente de la
lista, nunca subir `--workers` por encima de `maximo_hardware`.

**Cómo vuelve el trabajo de la nube (2026-09-20, 22:55).** El contenedor de Claude corre
`starseed-enjambre.py enjambre/colas/cola-nube-<fecha>.json --workers 2` (2 vCPU: 2 agentes, las
puertas se turnan) con `~/.starseed/env` propio y el mismo `opencode.json` de la Mac (solo `{env:…}`).
Sus commits no pueden hacer `push` (el proxy lo deniega): Claude los saca con
`git format-patch origin/main..main` y los aplica en la Mac con `git am`, y la Mac los publica con
las cuatro puertas (`publicar.py`). Las tareas repartidas quedan `reasignada · nube` en
`progreso.json` para que la Mac no las duplique; si la nube muere sin entregarlas, se devuelven a
`pendiente` y la Mac las retoma.
