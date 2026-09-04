# 💠 Orquestación multiagente económica — regla permanente (Adenda 219 · 2026-09-02)

> **Para cualquier modelo que trabaje en StarSeed, desde cualquier medio** (Claude Code en
> el Mac, Cowork/claude.ai, Hermes, Gemini, Codex, OpenCode, Antigravity, el propio OS):
> **ningún modelo, proveedor ni sesión debe agotar sus créditos.** Las tareas se
> **ramifican** por coste e inteligencia (lo mecánico a modelos gratis/baratos, lo difícil
> a modelos capaces), el progreso se **autoenruta** a otros modelos y sesiones para que la
> tarea continúe sola, y cada ola termina con su **punto de relevo** escrito.

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

## 6. Agentes de código disponibles

- **opencode 1.2.15** — `opencode run --model <proveedor>/<modelo> --dir <ruta>`, configurado en
  `~/.config/opencode/opencode.json` con los proveedores `nvidia` y `aihubmix`. Es el ESCRITOR
  principal del enjambre.
- **UTIM** (`@emend-ai/utim` v2.3.19) — «Universal Terminal Intelligence Manager», instalado
  como segundo tipo de trabajador para multiplicar agentes en paralelo.

## 7. Política de enrutamiento automático del enjambre

Escribir con NVIDIA NIM (opencode) y revisar con AIHubMix. Ante un fallo o cuota agotada se
releva en cascada NIM → OpenRouter → Gemini, sin que ningún proveedor llegue a agotarse. Los
cupos por minuto los declara cada proveedor en `~/.local/bin/starseed-enjambre.py` (constante
`CUPOS_RPM`).

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
