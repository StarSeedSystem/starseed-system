# 🧠 Astraura · Inteligencia gratis-primero, sentidos y neuronas

> **Ola 2026-07-04.** Cómo Aurora elige inteligencia, ve, habla, usa cada
> dispositivo como servidor y se mejora a sí misma — gratis y local primero.
> Fuente de verdad de la capa de inteligencia del OS (y su adaptación a Nexus/Café).

---

## 1. Principio rector

Aurora **siempre funciona** y **es lo más gratuita posible desde el inicio**
para cualquier usuario (Comunismo de Abundancia, §3 CLAUDE.md). No exige
configurar nada: detecta lo disponible, elige la mejor opción gratuita para
cada tarea, lo dice con transparencia, y si algo se agota pasa sola a la
siguiente alternativa local/gratuita. Todo es soberano y configurable.

---

## 2. Piezas (todas en `src/ai/astraura/`)

| Módulo | Rol |
|---|---|
| `free-catalog.ts` | Catálogo declarativo de TODAS las fuentes (instant / free-key / local / paid) con modelos, fortalezas por tarea, límites, `why` y peso (privacidad/soberanía puntúan). |
| `availability.ts` | Detecta qué tiene cada usuario/contexto: claves configuradas, Ollama/LM Studio corriendo (sonda), WebGPU, Prompt API del navegador. |
| `builtin-engines.ts` | Motores sin HTTP: Chrome AI (Gemini Nano), WebLLM (CDN), **Transformers.js** (SmolLM3-3B-ONNX, WebGPU). |
| `router.ts` | **Corazón.** Clasifica la tarea, rankea candidatos (gratis primero, servicios del usuario prioritarios), ejecuta con **failover en cadena**, registra la ruta y anuncia con transparencia. `astrauraChat()`. |
| `usage.ts` | Uso por fuente (peticiones/tokens/día), límites gratis conocidos, y **cooldown** al agotar (429/quota) para que el router la salte. |
| `autonomy.ts` | Auto-mejora: re-sondeo, **sugerencias** contextuales (gratis primero), y **señales** de preferencia (búsquedas/instalaciones) para personalizar la Biblioteca. |
| `vision.ts` | Percepción visual local con **SmolVLM2** (Transformers.js): imagen, pantalla, cámara, vídeo (multi-frame). |
| `context.ts` | **Comprensión del sistema.** Mapa vivo de áreas/rutas (`OS_SECTIONS`, con acciones + si Aurora puede actuar ahí como agente), `directLinkFor()`, `screenContext()`, `describeArea(route)` y `systemMap()` (áreas + capacidades activas + agentes disponibles). Ver §11. |
| `sync-providers.ts` | **Servidores de sincronización por cuenta.** Adapter `SyncProvider` (oficial/propio/local, extensible) para elegir DÓNDE viven las preferencias sincronizadas. Ver §12. |

Voz OSS: `src/lib/aurora/tts-oss/` (Kokoro español local, Kitten beta).
Neuronas: `src/lib/neurons/neurons.ts`. Visor universal: `src/components/aurora/universal-viewer.tsx`.
Renderizador universal de mensajes de chat: `src/components/aurora/message-renderer.tsx` (ver §11).

---

## 3. Flujo de una respuesta (`astrauraChat`)

1. **Modo.** `manual` → `chat()` clásico (proveedor activo). `auto` (predeterminado) → sigue.
2. **Clasifica** la tarea: chat / fast / code / reasoning / vision / long / creative / translate / summary (+ si necesita visión).
3. **Detecta** disponibilidad y **rankea** candidatos: `calidad + bonus por fortaleza + peso de fuente + (servicio del usuario ⇒ +2.5) − (freeFirst penaliza pago)`. Override por tarea = +100.
4. **Failover**: prueba hasta 5 candidatos saltando los que están en **cooldown**. El primero que responde gana.
5. **Registra** la ruta (`starseed.astraura.routes.v1`, evento `starseed:astraura-route`) con alternativas gratis y sugerencias de pago, y suma **uso**.
6. **Transparencia**: `announceLine()` hace que Aurora diga qué usó y sus alternativas (según `announce`: al cambiar / siempre / nunca).
7. Si TODO falla, **NUNCA** un error crudo: respuesta local honesta (plantilla
   sin red) explicando qué se intentó + alternativas accionables. Ver §17.1.

Enganche: `src/lib/aurora/engine.ts` → `runCommand` llama `astrauraChat` en vez de `chat`.

---

## 4. Catálogo gratis-primero (resumen, jul-2026)

- **Local (soberanía):** Ollama (`qwen3:8b`, `alibayram/smollm3`, `gemma3:4b`, `deepseek-r1:8b`), LM Studio.
- **Navegador OSS (sin clave, WebGPU):** **SmolLM3-3B-ONNX** (texto), **SmolVLM2 256M/500M** (visión), Sipp (GGUF beta), WebLLM, Chrome AI (Gemini Nano).
- **Free-key (clave gratuita):** Groq (rápido, voz), Cerebras (1M tok/día), OpenRouter `:free`, Gemini (1M ctx, multimodal), Mistral Experiment, NVIDIA NIM, GitHub Models.
- **Instant sin clave:** Pollinations (red de seguridad universal).
- **Paid (solo sugerencias):** Anthropic, OpenAI — nunca se activan solas.

Añadir una fuente = una entrada en `FREE_CATALOG`. El router, la UI y la Biblioteca la recogen solas.

---

## 5. Uso, costes y "nunca deja de funcionar"

`usage.ts` cuenta peticiones/tokens por fuente y día, con los límites gratis
conocidos (`FREE_DAILY_LIMITS`). Al recibir 429/quota/insufficient, el router
llama `markCooldown(sourceId, 60min)`; mientras dure, esa fuente se **salta** y
Aurora usa la siguiente mejor (local/gratuita). El panel de Ajustes →
Inteligencia muestra uso, % del límite, y cooldowns con botón "Reactivar".
Resultado: se acaben los créditos o caiga un servidor, Aurora sigue.

---

## 6. Sentidos multiagénticos

- **Visión** (`vision.ts` + `src/lib/aurora/senses/vision-sense.ts`): SmolVLM2 en
  el navegador (Apache-2.0, ~250 MB la 1ª vez). `auroraSee("screen"|"camera"|"image")`
  y `maybeHandleVisionCommand(text)` ("¿qué ves?", "describe la pantalla",
  "mira la cámara"), enganchado en `runCommand` antes del fallback. Panel:
  `settings/aurora/vision-panel.tsx` (opt-in `starseed.aurora.vision.v1`).
- **Voz** (`tts-oss/`): motor elegible en `starseed.aurora.voice.v1` — Navegador
  (siempre), **Kokoro** (`onnx-community/Kokoro-82M-v1.0-ONNX`, mejor español,
  local), Kitten (beta, inglés). `speak()` delega en OSS y cae al navegador si falla.

---

## 7. Neuronas — cada dispositivo es cerebro y servidor

`src/lib/neurons/neurons.ts` + tabla Supabase `neuron_devices` (RLS por owner,
heartbeat en `last_seen_at`). Todo dispositivo con la cuenta se registra como
**neurona**: capacidades (plataforma, WebGPU, Chrome AI, cores, memoria,
almacenamiento, batería, Ollama/LM Studio, PWA) y **permisos** (compute,
storage, sync, agent, senses, wake) — **todo activo por defecto**, ajustable en
Ajustes → Astraura → Neuronas (`neurons-panel.tsx`). Registro + latido en el
`AuroraProvider`. Sincroniza vía la cuenta soberana; las neuronas online se ven
entre sí (base para pedir archivos/contexto entre dispositivos como neuronas de
los mismos cerebros).

---

## 8. Autonomía y Biblioteca-Cydia

`autonomy.ts` late cada 30 min (arranca en `AuroraProvider`): recalcula
sugerencias (conectar una gratis potente, añadir IA local, dar visión, avisar de
cuota, opción premium) y emite `starseed:astraura-suggestions`. Aprende de
**señales** (`recordSignal`) para reordenar recomendaciones de la Biblioteca por
usuario/contexto.

La **Biblioteca** (`src/lib/library/packages.ts`, repos `starseed-core` +
`starseed-labs`) es la tienda instalable estilo Cydia: apps, widgets, páginas,
pizarras, investigaciones, proyectos, diseños/temas, animaciones, funciones,
**fuentes de IA** y **repos**. Acciones: instalar (efecto real), abrir,
**guardar enlace**, **descargar**, **replicar** (fork editable local) y
**publicar como rama**. Paquetes de esta ola: SmolLM3 (navegador/Ollama), Visión
SmolVLM2, Voz Kokoro, KittenTTS, TabFM (servicio), Sipp, AgentOS (patrones).

---

## 9. Sincronización a la cuenta (OS · Nexus · Café)

`settings-sync.ts::SYNCED_KEYS` lleva a `user_settings.prefs` (cuenta soberana):
inteligencia, defaults por función, voz, neuronas, instalados de Biblioteca,
mine/published. **Las claves API NO viajan** (`starseed.ai.providers` es local
por diseño; sensibles). Nexus y Café cargan `astraura-core.js` (núcleo vanilla
con la MISMA cadena gratis-primero + failover + transparencia) y leen esa misma
config. ⚠️ **Nexus usa su propio proyecto Supabase `nxstilnyidvkqeosofuh`** (no
el `dzkjapinnewkxzjltadv` del OS/Café): su `astraura-core.js` usa el cliente del
portal (`window.STARSEED.client()`), no un proyecto hardcodeado.

---

## 10. Repos externas integradas (jul-2026)

| Repo | Cómo se integró |
|---|---|
| HuggingFaceTB/SmolLM3 | Fuente de texto navegador (`SmolLM3-3B-ONNX`, Transformers.js) + tag Ollama `alibayram/smollm3`. |
| HuggingFaceTB/SmolVLM2 | Sentido de visión local de Aurora (256M/500M, image-text-to-text). |
| KittenML/KittenTTS + Kokoro | Motores de voz OSS (Kokoro español activo; Kitten beta). |
| google-research/tabfm | Paquete de Biblioteca "análisis tabular" (servicio Python; enlace + honesto). |
| noumena-labs/Sipp | Fuente beta GGUF en navegador (`sipp-local`) + paquete. |
| rivet-dev/agentos | Patrones de orquestación (ACP transcript, bindings, permisos deny-by-default) como referencia + paquete. |

Todo prioriza **gratis + local + código abierto**; los de pago solo se sugieren.

---

## 11. Render universal en los chats de Aurora (jul-2026 · adenda "Perfeccionamiento")

`src/components/aurora/message-renderer.tsx` es el renderizador ÚNICO y reutilizable
que sustituye el texto plano en TODOS los chats de Aurora del OS: exocórtex/orbe
(`aurora-chat-view.tsx`, panel normal y fullscreen), mini-reproductor
(`aurora-mini-player.tsx`) y chat de agente (`app/(app)/agent/page.tsx`).

Soporta, todo defensivo y sin dependencias nuevas (no se instaló ningún paquete):
- **Markdown completo** vía `react-markdown` (ya en el catálogo del repo): títulos,
  listas, citas, negrita/cursiva, enlaces con `target=_blank`.
- **Tablas markdown (GFM)** — el repo no trae `remark-gfm`, así que se PARSEAN A MANO
  (`splitProseWithTables`) y se pintan con la misma estética que el resto.
- **Bloques de código** ```lang — resaltado LIGERO por tokenización con regex
  (sin librería de highlight) + botón «Copiar».
- **JSON** — detectado (```json o texto que parsea como JSON) y pintado PLEGABLE
  con botón «Copiar» y resumen (array/objeto + nº de elementos/claves).
- **SVG inline** y **HTML embebido** — sanitizados con una whitelist DOM PROPIA
  (`sanitizeHtmlFragment`, sin DOMPurify): recorre el árbol parseado, elimina
  tags/atributos fuera de la whitelist, `on*`, `javascript:`/`data:text/html` y
  fuerza `rel=noopener noreferrer` en enlaces. Nunca usa `dangerouslySetInnerHTML`
  sin pasar antes por esta función.
- **Imágenes, audio, vídeo, PDF, 3D, CSV, tarjetas de archivo/enlace** — delegado en
  el visor universal YA EXISTENTE (`universal-viewer.tsx::MessageMedia`); no se
  duplica esa lógica, `MessageRenderer` lo llama internamente (`media` opt-out).

Contrato: `<MessageRenderer text={mensaje} compact? media? className? />`. En sitios
con recorte por CSS (`-webkit-line-clamp`, líneas resumidas del mini-reproductor) se
mantiene el texto plano — el clamp necesita un único nodo, no bloques de markdown.

---

## 12. Servidores de sincronización por cuenta (jul-2026 · adenda "Perfeccionamiento")

`src/ai/astraura/sync-providers.ts` define la interfaz `SyncProvider` (adapter) y su
registro `SYNC_PROVIDERS`, para que cada cuenta/dispositivo elija DÓNDE se
sincronizan sus preferencias (mismas `SYNCED_KEYS` de `lib/settings-sync.ts`):

| Proveedor | Qué hace |
|---|---|
| `official` (**default**) | Comportamiento de SIEMPRE: delega 100% en `settings-sync.ts` / `utils/supabase/client.ts` (proyecto oficial StarSeed). Cero cambios si el usuario no toca la pantalla. |
| `own-supabase` | Supabase PROPIO del usuario (URL + anon key aportadas por él): mismo esquema `user_settings(user_id, prefs, updated_at)` contra su proyecto. Fila indexada por un id estable por dispositivo (`starseed.sync.own-supabase.row-id.v1`), ya que no hay garantía de que el usuario tenga auth en su propio proyecto. |
| `local` | Sin red: exporta/importa un archivo de respaldo (`File System Access API` si el navegador la soporta; si no, descarga/`<input type=file>` clásicos). Máxima soberanía; no sincroniza SOLO entre dispositivos (es backup real). |

Extensible: sumar WebDAV/Drive/otro = implementar `SyncProvider` y añadirlo a
`SYNC_PROVIDERS`; la UI y el resto del OS lo recogen solos.

**Selección activa**: `starseed.sync.provider.v1` (`{version, providerId}` —
`SYNC_PROVIDER_SCHEMA_VERSION` para migraciones futuras de este esquema). A
propósito **NO** está en `SYNCED_KEYS`: es una elección por dispositivo/cuenta local,
no algo que deba viajar con el sync oficial (evita que un dispositivo quede
"encerrado" en un proveedor propio inalcanzable desde otro). Config sensible
(URL/clave del Supabase propio) en `starseed.sync.providers.config.v1`, SIEMPRE
local, igual que las claves de proveedores de IA.

UI: `/servidores` → `AccountSyncPanel` (`src/components/aurora/account-sync-panel.tsx`),
por encima del registro de servidores de CEREBROS (`ServersPanel`, concepto
distinto: ese es N:N cerebro↔servidor de cómputo/generación, no sync de cuenta).

---

## 13. Mapa vivo del sistema (jul-2026 · adenda "Perfeccionamiento")

`src/ai/astraura/context.ts` amplía `OS_SECTIONS` con, por cada área: `actions`
(qué se puede hacer ahí, frases cortas es-ES) y `agentCapable` (si Aurora puede
actuar ahí como agente: crear/editar/comentar/publicar/enviar en nombre del
usuario dentro de páginas/grupos/comunidades/archivos/publicaciones/comentarios/
mensajes). Nuevos helpers:

- `describeArea(route)` → ficha completa de un área (label + acciones + nota de
  agente + `summary` listo para hablar/mostrar). Empareja por ruta exacta o por
  el prefijo más largo que encaje (p.ej. `/network/politics/proposal/42`).
- `systemMap()` → mapa vivo COMPLETO (async, defensivo): todas las áreas +
  capacidades/skills activas (import dinámico de `skills.ts`) + agentes
  disponibles (import dinámico de `lib/agents/store.ts`) + un `prompt` de texto
  listo para inyectar. Sin cliente o si algo falla, degrada a solo `areas`.

`systemContextPrompt()` (ya cableado en `router.ts::astrauraChat()`) se enriqueció
para incluir, por cada sección, hasta 3 acciones y la marca `(agente)`, más un
párrafo explícito "COMO AGENTE" que autoriza a Aurora a actuar en las áreas
marcadas — siempre pidiendo confirmación antes de acciones irreversibles o
públicas. `src/components/aurora/invoke-agent-button.tsx` expone el punto de
enganche reutilizable "invocar agente aquí" (`<InvokeAgentButton place={{kind,
id, title}} />` + `invokeAgentAt()`/`buildPlaceContext()`): abre el chat completo
de Aurora (vía `lib/aurora/open-aurora.ts::openAurora()`, sin instanciar una
segunda Aurora) con el contexto del lugar ya precargado.

---

## 14. Hugging Bay — descubrimiento inteligente de modelos (jul-2026)

**THE HUGGING BAY** (`https://huggingbay.xyz`) es un registro verificado de
modelos IA open-source con API pública **agent-friendly** (GET sin token, JSON):
recomendador por caso de uso, búsqueda semántica, trending, rankings canónicos,
ficha/bundle de artefacto y "kits locales" (comando copiable para Ollama/LM
Studio/ComfyUI/Transformers/llama.cpp). Se integra como **fuente de descubrimiento**
de Astraura (no como fuente de inferencia: Hugging Bay no sirve chat, solo
CATALOGA modelos y da el comando para instalarlos localmente) y como categoría
navegable de la Biblioteca.

### 14.1 Piezas

| Pieza | Rol |
|---|---|
| `src/app/api/huggingbay/[...path]/route.ts` | **Proxy servidor GET-only** con allowlist de prefijos (`api/recommender`, `api/search`, `api/v1`, `api/artifacts`, `api/trending`, `api/hosted-local-models`, `api/local-kits`), timeout duro y `cache: s-maxage` corto. Necesario porque el navegador no puede hacer CORS directo contra huggingbay.xyz de forma fiable y para no exponer nunca una clave (la API no la pide). |
| `src/ai/astraura/huggingbay.ts` | **Cliente tipado** (`recommend(useCase)`, `semanticSearch(q)`, `trending()`, `topOpenModels()`, `artifactCard(id)`, `localKit(id, tool)`) con caché `localStorage` TTL ~1h, timeout corto y que **nunca lanza** (degrada a `[]`/`null`). `TASK_TO_USE_CASE` mapea el vocabulario de tareas de Astraura (`TaskKind` de `free-catalog.ts` + capacidades de `skills.ts`) al `useCase` que espera el recomendador de Hugging Bay. `rankHuggingBayFor(task)` hace la selección INTELIGENTE: filtra licencia permisiva + prioriza verified/hosted, puntúa por `fitScore` + señales de confianza + adecuación al tier del dispositivo (`lib/perf/device-tier.ts::detectTier()`), y devuelve el top-N con `reasons` en **español**. |
| Config en `IntelligenceSettings` (`router.ts`) | `huggingBay: { enabled, autoSuggest, preferredTool, permissiveOnly, hostedOnly }` — aditivo, sin migración (todas las claves nuevas tienen default seguro). Ver §14.2. |
| `autonomy.ts::computeSuggestions()` | Cuando falta una capacidad local pedida por el usuario ("mejor modelo para X"), añade una sugerencia `kind:"model-discovery"` con el top-1 de `rankHuggingBayFor()` — solo si `huggingBay.enabled`. Nunca auto-descarga: siempre es un botón "Copiar comando" / "Abrir en Hugging Bay". |
| Biblioteca → sección "Hugging Bay" | Navegador VIVO en `src/components/library/huggingbay-browser.tsx`: pestañas Recomendados (selector de useCase) · Trending · Top open models · Búsqueda semántica. Fichas con licencia, señales de confianza, fit reasons, "Copiar comando Ollama/LM Studio", "Abrir en huggingbay.xyz", "Usar en Astraura" (registra como candidato en `installed-models.ts`) y `SaveToLibrary` existente. |
| `defaults-seed.ts` | `SEED_VERSION 5→6`: nuevo paquete `iatool-hugging-bay-registry` (repo `starseed-ia-tools`, kind `repo`, `externalUrl` a huggingbay.xyz + nota) recomendado por defecto — sin efecto de descarga, solo guarda el enlace y activa el descubrimiento. |
| `skills.ts` | Nueva capacidad `model-discovery` (label "Descubrimiento de modelos (Hugging Bay)"): system prompt que explica a Aurora que puede buscar/recomendar modelos reales vía Hugging Bay cuando el usuario lo pida. |

### 14.2 Cómo decide Aurora el mejor modelo por tarea

1. El usuario pide "mejor modelo para X" o Aurora detecta que la tarea necesita
   una capacidad local ausente (p.ej. visión/voz/código sin fuente lista).
2. `rankHuggingBayFor(task)` traduce la tarea al `useCase` de Hugging Bay
   (`TASK_TO_USE_CASE`) y llama `recommend(useCase)` (con caché).
3. Filtra: **licencia permisiva** (si `permissiveOnly`, por defecto ON) y,
   si `hostedOnly` está activo, solo filas `hosted`/verificadas.
4. Puntúa cada candidato: `fitScore` (de Hugging Bay) + bonus por
   `verificationStatus`/`trust.score` + bonus/penalización por tamaño adecuado
   al tier del dispositivo (`detectTier()`: `low` favorece modelos pequeños/GGUF
   cuantizados, `high` no penaliza modelos grandes).
5. Devuelve el top-N con `reasons: string[]` en español (p.ej. "Licencia
   apache-2.0 · 344K descargas upstream · tamaño adecuado para este equipo").
6. Según el **nivel de autonomía** configurado (`autonomy.ts` + `huggingBay.autoSuggest`):
   sugiere (bandeja de Sugerencias de Aurora) o, si hay Ollama/local disponible
   y el usuario ya activó auto-selección, ofrece el comando del kit local
   (`localKit(id, preferredTool)`) listo para copiar/instalar y lo registra como
   candidato en `installed-models.ts`/`free-catalog` para que el router lo
   considere la próxima vez. **Nunca** descarga ni ejecuta nada por su cuenta.

### 14.3 Configurables (Ajustes → Inteligencia → Herramientas & servicios)

- **Descubrimiento Hugging Bay** (ON por defecto): activa/desactiva toda la capa.
- **Auto-sugerencia** (ON): Aurora propone modelos sin que el usuario pregunte,
  cuando detecta una capacidad ausente.
- **Herramienta preferida** (`ollama` por defecto): qué kit local se genera
  (ollama/lmstudio/comfyui/transformers/llama.cpp).
- **Solo licencias permisivas** (ON): descarta MIT/Apache-2.0/OpenRAIL-incompatibles
  cuando esté desactivado explícitamente el filtro (por defecto siempre filtra
  las claramente no-comerciales).
- **Solo hosted/verificados** (OFF): si se activa, descarta filas puramente
  `external` (metadatos sin mirror revisado) para máxima fiabilidad de descarga.

### 14.4 Reglas del sitio respetadas

`summary=1` + `limit` en toda búsqueda de catálogo, preferencia por filas
hosted/verificadas/licencia permisiva para sugerir descargas automáticas, nunca
se asume que una fila `external` es descargable desde Hugging Bay (se muestra
el aviso y se ofrece "solicitar mirror"/"abrir upstream" en su lugar), proxy
GET-only sin reenviar tokens (la API no los requiere).

---

## 15. Stack OSS por defecto (jul-2026 · adenda "Reemplaza tu stack de $200/mes")

Diez repos open-source adicionales (guía "Replace Your $200/Month Tool Stack"),
integrados con la MISMA honestidad radical del resto del catálogo: son
**conocimiento + capacidad + paquete instalado**, nunca binarios que el OS
ejecuta por sí solo. Instalar = (1) registrar la skill/enlace en la Biblioteca,
(2) activar la capacidad viva correspondiente en `skills.ts` (system prompt +
sesgo de routing), y (3) si aplica, quedar disponible como motor/opción que
Aurora usa CUANDO esté disponible (self-host/local) o como receta/patrón de
referencia SIEMPRE (aunque el servicio no esté corriendo).

### 15.1 Los diez repos

| Repo | Categoría | Capacidad (`skills.ts`) | Cómo se integra |
|---|---|---|---|
| [Dyad](https://github.com/dyad-sh/dyad) | Creación de apps | `app-builder` | Constructor local de apps IA (scaffold React/TS, sin lock-in). Paquete `function` en `starseed-ia-tools`: registra la skill, Aurora sabe recomendar y explicar el patrón "app local sin lock-in" al crear apps en el Canvas Horizon. |
| [goose](https://github.com/aaif-goose/goose) (Linux Foundation AAIF) | Agentes | `agent-recipes` | Agente autónomo en máquina con "recipes" reutilizables. El patrón "recipe" (una tarea empaquetada y repetible) se documenta como referencia para el subsistema de Agentes (P4/P5, `src/lib/agents/`): un Agente StarSeed puede describirse como receta. |
| [DeerFlow](https://github.com/bytedance/deer-flow) | Investigación | `deep-research` | Super-agente de investigación profunda (informes/decks/webs). Refuerza la capacidad `research` ya existente: Aurora conoce este motor como referencia de "investigación profunda con entregable estructurado" además de Open Notebook. |
| [Daytona](https://github.com/daytonaio/daytona) | Ejecución | `sandbox-exec` | Sandboxes aislados para ejecutar código generado por IA. Paquete `project` (servicio/servidor, self-host): Aurora explica cuándo recomendar un sandbox aislado antes de ejecutar código no confiable. |
| [Parallel Code](https://github.com/johannesjo/parallel-code) | Orquestación de código | `multi-agent-code` | Despacha múltiples agentes de código en worktrees aislados. Patrón de orquestación multi-agente documentado para cuando el usuario pide "varias tareas de código en paralelo". |
| [Scrapling](https://github.com/D4Vinci/Scrapling) | Acceso web | `web-access` (motor adicional) | Scraping adaptativo con selectores auto-reparables y stealth. Se añade a `web-access.ts::WEB_ACCESS_PROVIDERS` junto a Crawl4AI/DeepCrawl/WebHarvest/Universal Scraper: auto-seleccionable por tarea (fortalezas: sitios que cambian de estructura, anti-detección). |
| [9Router](https://github.com/decolua/9router) | Routing / proxy | `router-proxy` | Proxy local OpenAI-compatible que enruta entre 40+ proveedores con fallback por niveles y compresión de tokens. Se añade a `router.ts` como fuente de tipo "proxy local detectable" (ver §15.3) + flag de compresión de contexto opcional. |
| [ai-website-cloner-template](https://github.com/JCodesMore/ai-website-cloner-template) | Diseño / creación | `design-import` | Reconstruye sitios como Next.js extrayendo tokens/estructura (uso legítimo: clonar tu propio sitio o una referencia con permiso). Paquete `function`: Aurora sabe explicar el patrón "extraer tokens de diseño de una URL de referencia" en el Lienzo de Creación (Horizon). |
| [RAGFlow](https://github.com/infiniflow/ragflow) | Conocimiento / RAG | `rag-knowledge` | Motor RAG enterprise con comprensión profunda de documentos y respuestas citadas. Refuerza la Biblioteca-Cydia y `research`: Aurora conoce el patrón "RAG con citas verificables sobre documentos propios" como referencia para conectar una base de conocimiento self-host. |
| [Pipecat](https://github.com/pipecat-ai/pipecat) | Voz / multimodal | `voice-realtime` | Framework de agentes de voz/multimodal en tiempo real (100+ STT/TTS/LLM). Referencia junto a Kokoro (voz local ya activa): documenta el patrón de conversación de voz en tiempo real de baja latencia para cuando el usuario quiera desplegar su propio pipeline de voz.

Todos son paquetes `kind` `function` o `project` en el repo builtin
`starseed-ia-tools` (excepción: si alguno ya encaja mejor en una categoría
existente de `starseed-core`/`starseed-labs`, se indica en su ficha). Todos con
`free:true`, descripción en español (qué hace + qué reemplaza + enlace GitHub),
y `payload.externalUrl` (código fuente de referencia). Los que además declaran
`payload.skillId` activan una capacidad viva real de Aurora; los que documentan
un servicio/servidor externo (Daytona, 9Router self-host) quedan como enlace +
receta, honestos sobre que NO corren dentro del navegador.

### 15.2 Diez capacidades nuevas en `skills.ts`

Vocabulario ampliado (mismo contrato de `architecture/astraura-capabilities.md`):
`app-builder · agent-recipes · deep-research · sandbox-exec · multi-agent-code ·
web-scraping-adaptativa · router-proxy · design-import · rag-knowledge ·
voice-realtime`. Cada una sigue el patrón existente: `systemPrompt` (explica a
Aurora qué sabe/puede recomendar), `routing` (sesgo hacia modelo fuerte /
planning / web según corresponda) y `skillIds`/`packageIds` (qué instalación la
dispara). Se inyectan SIEMPRE que estén activas, igual que `taste`/`pm`/
`web-senses`/`research`/`vision`/`voice`: en chats de Aurora, Biblioteca,
agentes en páginas/grupos — mismo mecanismo de `activeCapabilityIds()` +
`skillsSystemPrompt()` + `skillsRoutingBias()`, sin tocar el motor.

### 15.3 `web-access.ts` — Scrapling como motor adicional

Se añade `scrapling` a `WEB_ACCESS_PROVIDERS` (kind `local`, gratis, repo
`https://github.com/D4Vinci/Scrapling`) con `strengths` orientadas a selectores
que "se auto-reparan" cuando el sitio cambia de estructura y modo stealth
anti-detección. Auto-seleccionable igual que el resto: si el usuario pega su
`endpoint`, `selectWebAccessProvider()` lo considera en el mismo orden
gratis-primero. No cambia el contrato ni la firma de la función.

### 15.4 `router.ts` — 9Router como proveedor-proxy local detectable

Nuevo bloque de configuración aditivo en `IntelligenceSettings`:

```ts
nineRouter: {
  enabled: boolean;          // por defecto false (requiere que el usuario lo tenga corriendo)
  endpoint: string;          // default "http://localhost:8000" (OpenAI-compatible)
  compressionHint: boolean;  // flag ligero: pide al motor comprimir contexto si lo soporta
}
```

9Router (`https://github.com/decolua/9router`) es un proxy LOCAL OpenAI-compatible
que el usuario corre en su propio equipo; Astraura NO lo instala ni lo lanza.
Cuando `enabled` y hay un `endpoint` configurado, se registra como una fuente
más disponible para el ranking de candidatos (mismo patrón que `local-openllm`:
requiere el servidor local corriendo; si no responde, el failover normal de
`astrauraChat()` pasa a la siguiente fuente gratis/local sin que el usuario note
nada). `compressionHint` es solo una bandera informativa que se añade a la
petición cuando la fuente es 9Router — implementación ligera, no se reimplementa
el algoritmo de compresión de tokens del proyecto, solo se avisa al proxy de que
puede aplicar el suyo si lo soporta. Documentado ANTES del código, siguiendo el
mismo patrón por el que se aprendió de RouteLLM (enrutado por dificultad) y
LiteLLM (naming/proxy multi-proveedor) sin depender de sus paquetes npm.

### 15.5 Paridad pendiente con Nexus/Café

`astraura-core.js` (usado por Nexus y Café) queda **fuera del alcance** de esta
ola: vive en sus propios repos (`StarSeed-Nexus`, `Starseed-Cafe`), no en
`starseed-os-main`. Portar el vocabulario de 10 capacidades nuevas + Scrapling +
9Router a `SKILL_CAPS`/`capsSystemPrompt()`/`capsBias()` de esos sistemas queda
anotado como trabajo pendiente, igual que se hizo constar en §9 para el resto de
Astraura.

### 15.6 Pre-instalación por defecto — criterio y barrido del catálogo

Regla aplicada al barrer `packages.ts` para decidir qué entra en
`RECOMMENDED_PACKAGE_IDS` (además de los 10 repos de esta ola): se auto-instala
todo paquete **gratis/open-source** cuyo efecto de instalación sea local y
seguro (registrar una skill, activar una fuente sin clave, activar una clase
CSS, guardar un enlace) — **sin** requerir clave API, sin depender de que el
usuario ya tenga un servidor propio corriendo como precondición de que la
instalación "haga algo útil", y sin ser mutuamente excluyente con algo que ya
esté recomendado (p.ej. los temas visuales de `starseed-core` son alternativos
entre sí: solo uno entra por defecto). Paquetes que documentan honestamente un
servicio/servidor externo SIN ninguna capacidad viva asociada (sin `skillId`) —
p.ej. RouteLLM/LiteLLM/AgentOS/OpenCode/OpenClaw/apple-container, que ya
declaran "instalar = guardar enlace y abrir repo" sin más efecto— quedan
instalables desde la Biblioteca pero **no** se auto-activan: añadirlos a
RECOMMENDED sería ruido (una skill que no existe) y no automatización real.
SEED_VERSION sube de 6 a 7 para propagar este barrido a cuentas ya creadas
(mismo mecanismo idempotente y no-destructivo de `defaults-seed.ts` §ya
documentado en el propio archivo).

---

## 16. Ocho repos más (jul-2026 · adenda "Infraestructura soberana y flujos visuales")

Ocho repos open-source adicionales, integrados con la MISMA honestidad radical
del §15: **conocimiento + capacidad + paquete instalado**, nunca binarios que
el OS ejecute por sí solo. Tres de ellos (`Open WebUI`, `Stirling-PDF`,
`browser-use`) YA tenían un conector funcional real en
`src/lib/integrations/registry.ts` (acciones invocables por Aurora vía
`aurora-tools.ts`, ver §10 de ese registro) — esta ola les AÑADE, sin tocarlos,
la capa de capacidad viva de Astraura (system prompt + sesgo de routing +
tarjeta de Biblioteca), que antes no tenían aunque el conector ya existiera.

### 16.1 Los ocho repos

| Repo | Categoría | Capacidad (`skills.ts`) | Cómo se integra |
|---|---|---|---|
| [Coolify](https://github.com/coollabsio/coolify) | Servidores / infraestructura soberana | `self-hosting-deploy` | PaaS self-host (alternativa a Heroku/Netlify/Vercel): despliega apps/BDs/servicios en tu propio servidor. Ya listado en `oss-library.ts` (categoría `devops`, `defaultIntegrated:true`); esta ola le suma paquete de Biblioteca + capacidad viva para que Aurora lo recomiende como patrón de infraestructura soberana. |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | Agentes / código | `dev-agent` | Plataforma de agentes de desarrollo autónomos (escriben código, ejecutan, navegan). Ya integrado como conector experimental (`openhands`, categoría `app-platform`, aislado/nunca público); esta ola añade la capacidad viva que explica cuándo recomendar ese patrón. |
| [Maxun](https://github.com/getmaxun/maxun) | Acceso web | `web-robots` | Extracción de datos web no-code: entrena "robots" que scrapean y monitorizan sitios. Nuevo motor en `web-access.ts::WEB_ACCESS_PROVIDERS` junto a Crawl4AI/DeepCrawl/WebHarvest/Universal Scraper/Scrapling — auto-seleccionable por tarea (fortalezas: monitorización recurrente, no-code, robots programados). |
| [Open WebUI](https://github.com/open-webui/open-webui) | Cerebros / modelos locales | `local-llm-ui` | Interfaz de chat LLM self-hosted (Ollama/OpenAI-compatible, RAG integrado). Ya integrado como conector (`open-webui`, categoría `app-platform`); esta ola lo menciona además en la ficha de cerebros locales (§16.4) y le da capacidad viva: Aurora explica que se integra con los cerebros locales (Ollama) ya existentes. |
| [browser-use](https://github.com/browser-use/browser-use) | Navegador del OS / agentes | `agent-browsing` | Automatización de navegador para agentes IA (el agente usa el navegador como humano). Ya integrado como conector experimental (`browser-use`, categoría `automation`); esta ola añade la capacidad viva (sesgo `web`) + una nota en el Navegador del OS (§16.5) junto a la tarjeta existente de Claude-in-Chrome, como patrón alternativo self-host. |
| [Langflow](https://github.com/langflow-ai/langflow) | Agentes / flujos | `flow-builder` | Constructor visual de flujos/agentes LLM (drag&drop, API). Ya integrado como conector (`langflow`, categoría `app-platform`); esta ola añade la capacidad viva: Aurora conoce el patrón "diseñar agentes de la red visualmente" y lo sugiere para flujos complejos. |
| [Stirling-PDF](https://github.com/Stirling-Tools/Stirling-PDF) | Archivos / Biblioteca | `pdf-tools` | Herramientas PDF self-hosted (unir, dividir, convertir, OCR, firmar). Ya integrado como conector (`stirling-pdf`, con acciones `merge`/`to-image`/`extract-text` invocables por Aurora vía `pdf_merge`/`pdf_extract`/`pdf_to_image`); esta ola añade la capacidad viva + una nota en la vista previa de PDF del Finder (§16.6). |
| [Dify](https://github.com/langgenius/dify) | Agentes / plataforma | `llm-apps-platform` | Plataforma open-source de desarrollo de apps LLM (agentes, workflows, RAG, observabilidad). Ya integrado como conector (`dify`, categoría `app-platform`); esta ola añade la capacidad viva: Aurora conoce el patrón de plataforma LLM completa (app + workflow + RAG + observabilidad) como referencia para necesidades más allá del alcance de un solo agente. |

Todos son paquetes `kind: "function"` en el repo builtin `starseed-ia-tools`, con
`free:true`, descripción en español (qué hace + qué reemplaza/con qué conecta +
enlace GitHub) y `payload.externalUrl`. Ninguno se ejecuta dentro del navegador
del OS: son conocimiento + capacidad + paquete instalado, igual que el §15.
Los que además declaran `payload.skillId` activan una capacidad viva real de
Aurora (los ocho la declaran).

### 16.2 Ocho capacidades nuevas en `skills.ts`

Vocabulario ampliado (mismo contrato de `architecture/astraura-capabilities.md`):
`self-hosting-deploy · dev-agent · web-robots · local-llm-ui · agent-browsing ·
flow-builder · pdf-tools · llm-apps-platform`. Mismo patrón que el resto:
`systemPrompt` (qué sabe/puede recomendar Aurora), `routing` (sesgo hacia
modelo fuerte/planning/web según corresponda) y `packageIds` (qué instalación
la dispara). Se inyectan siempre que estén activas, mismo mecanismo de
`activeCapabilityIds()` + `skillsSystemPrompt()` + `skillsRoutingBias()`, sin
tocar el motor ni los conectores ya existentes de `src/lib/integrations/`.

### 16.3 `web-access.ts` — Maxun como motor adicional

Se añade `maxun` a `WEB_ACCESS_PROVIDERS` (kind `oss-selfhost`, gratis, repo
`https://github.com/getmaxun/maxun`) con `strengths` orientadas a extracción
no-code ("robots" entrenables) y monitorización recurrente de sitios.
Auto-seleccionable igual que el resto: si el usuario pega su `endpoint`,
`selectWebAccessProvider()` lo considera en el mismo orden gratis-primero. No
cambia el contrato ni la firma de la función.

### 16.4 Cerebros locales — mención de Open WebUI

`src/components/brains/servers-panel.tsx` ya nombraba Ollama/ComfyUI como
ejemplos de "Servicio conectado integrado". Esta ola añade Open WebUI a esa
misma frase como interfaz de chat alternativa para los cerebros locales
(Ollama/OpenAI-compatible + RAG), sin crear un nuevo tipo de servidor: sigue
siendo el mismo mecanismo genérico de servicio conectado, ya integrado además
como conector real en `src/lib/integrations/registry.ts` (`open-webui`).

### 16.5 Navegador del OS — nota de browser-use

`src/components/browser/browser-windows.tsx` ya tenía una tarjeta explicando
que Astraura conduce la navegación real vía Claude-in-Chrome (evento
`starseed:astraura-browse`). Esta ola añade, en esa misma tarjeta, una frase
sobre `browser-use` como patrón alternativo self-host (el agente controla su
propio navegador aislado, ya disponible como conector experimental `browser-use`
en `src/lib/integrations/registry.ts`) — informativo, sin cambiar el flujo
existente de Claude-in-Chrome como vía principal.

### 16.6 Finder — nota de Stirling-PDF en la vista previa

`src/components/files/file-preview.tsx::PdfPreview` gana una línea con enlace
a Stirling-PDF ("Herramientas PDF: unir, dividir, OCR, firmar") junto al
fallback "Abrir PDF" existente. Puramente informativo (abre el repo en pestaña
nueva); el conector funcional real (merge/to-image/extract-text) ya existe en
`src/lib/integrations/clients/stirling-pdf.ts` y se invoca desde Ajustes →
Integraciones o por Aurora vía `aurora-tools.ts`, no desde este enlace.

### 16.7 SEED_VERSION 7→8

Los ocho paquetes `iatool-*` de esta ola entran en `RECOMMENDED_PACKAGE_IDS`:
mismo criterio que §15.6 (efecto 100% local y seguro — solo registro de
skill/capacidad + enlace de referencia, cero descarga, cero clave, cero
servicio lanzado por el OS). Los servicios self-hosted que documentan
(Coolify/Open WebUI/Stirling-PDF/Dify/Langflow) NO se auto-conectan a ningún
endpoint: quedan instalados como capacidad + patrón + enlace, con el endpoint
configurable y desactivado por defecto donde aplica (mismo patrón `nineRouter`
de §15.4: endpoint por defecto en `localhost`, `enabled:false`). No se añade
un bloque `IntelligenceSettings` nuevo para estos cinco: a diferencia de
9Router (que participa directamente como fuente de chat en el ranking del
router), estos cinco son plataformas/servicios de otra naturaleza (deploy, UI
de chat externa, herramientas PDF, flujos, apps LLM) ya con su propia
configuración self-host completa en `src/lib/integrations/registry.ts`
(`defaultEndpoint`, `needsKey`, acciones) — duplicar ese estado en
`IntelligenceSettings` sería redundante, no automatización real.

---

## 17. Garantía de respuesta, metadatos por mensaje y menú contextual (jul-2026 · adenda "Aurora siempre responde")

### 17.1 Aurora SIEMPRE responde (nunca error crudo)

`astrauraChat()` ya no termina nunca en una excepción cruda hacia la UI. Dos
puntos endurecidos en `router.ts`:

- **Sin candidatos** (`rankCandidates` vacío) y **cadena agotada** (todos los
  candidatos + Pollinations fallaron) ya NO lanzan `throw`: construyen una
  **respuesta local honesta** (`buildHonestFallback`, sin red, plantilla en
  es-ES) que explica QUÉ se intentó (fuentes probadas) y ofrece alternativas
  ACCIONABLES (activar una clave gratis, encender Ollama, reintentar). Se
  registra como `RouteRecord` con `local:true`, `ok:true` (Aurora SÍ respondió,
  con honestidad) y `attempts` = nº de fuentes probadas.
- `engine.ts::runCommand` ya no propaga un `catch` con volcado crudo: el
  mensaje final siempre es honesto + accionable (reformula, revisa conexión,
  cambia de fuente en Ajustes → Inteligencia).
- Rechazos LEGÍTIMOS (el modelo respondió pero se niega por seguridad/política)
  NO entran en este camino: como sí hay texto, se tratan como una respuesta
  normal (una negativa clara, no un error).
- **Reintentar con proveedor concreto**: `AstrauraChatRequest.forceSource`
  (`{sourceId, modelId}`) fuerza esa fuente para ESA llamada (lo usa
  "Reintentar" del menú contextual); si no está disponible ahora, degrada al
  ranking normal con una nota — nunca falla en seco.

### 17.2 Sustitución automática de herramientas

`aurora-tools.ts::runAuroraTool` prueba alternativas de la MISMA familia
cuando una tool falla en tiempo de ejecución (`TOOL_ALTERNATES`, con guarda
anti-ciclo): `web_search → scrape_url → buscar_web`, `scrape_url ⇄ crawl_url`.
`actions.ts::tryRunIntegrationTool` hace lo mismo cuando la tool NI SIQUIERA
está configurada (`findAvailableAlternate`): por ejemplo, si el usuario no
configuró SearXNG, Aurora usa sola `buscar_web` (DuckDuckGo en el navegador,
siempre listo, sin configuración). Toda sustitución se REGISTRA con
transparencia: el mensaje resultante empieza con
`[Sustitución automática: «X» → «Y»]` y ese texto entra en el metadato
`tools[]` del mensaje (§17.3).

### 17.3 Metadatos por mensaje

Cada respuesta de Aurora guarda un `AuroraMessageMeta` (aditivo; los mensajes
antiguos sin `meta` se siguen leyendo con normalidad) junto a la entrada de
conversación en vivo (`engine.ts::ConversationEntry.meta`) y en el registro
persistido (`aurora-chat-log.ts::AuroraChatLogEntry.meta`):

    { provider, model, free, local, attempts, ms, difficulty, reason,
      tools: [{ name, ok, summary, undo? }] }

`pushReply(text, meta?)` SIEMPRE adjunta algo: si la respuesta vino de
`astrauraChat`, el meta real (proveedor/modelo/intentos/duración/dificultad/
herramientas); si fue una regla determinista del motor (sin modelo, p. ej.
"Aurora activada"), un meta mínimo `{ local:true, reason:"Regla determinista…" }`.
El evento `aurora:conversation` (bus del orbe) y el registro persistido
propagan `meta` igual, sin romper el formato viejo.

Bajo cada respuesta de Aurora, `aurora-chat-view.tsx` pinta una línea sutil
"proceso" (proveedor · tiempo · nº de herramientas), plegable, estética
Crystal (sin iconos-emoji). Al abrirla, o desde "Ver proceso" del menú
contextual, se ve el detalle completo (`message-process-modal.tsx`).

### 17.4 Menú contextual de mensajes (clic derecho / long-press)

`message-context-menu.tsx` reutiliza `useContextTrigger` (mismo hook del
Finder, `src/components/library/finder/use-context-trigger.ts`) para abrir un
`DropdownMenu` posicionado en (x,y) sobre CUALQUIER mensaje de
`aurora-chat-view.tsx::Conversation` (chat en vivo o sesión/contexto cargado).
Acciones:

- **Copiar mensaje** — portapapeles.
- **Ramificar chat desde aquí** — crea un contexto hijo en el árbol EXISTENTE
  (`chat-tree.ts::branchContext`/`createContext`, sin cambios en ese módulo) y
  etiqueta con `tagAuroraMessage(ts, nuevoId)` todos los mensajes hasta ese
  punto (incluido) del array de origen (vivo o cargado) — así el nuevo
  contexto abre ya con el historial hasta ahí. Aparece en el árbol/selector de
  contextos de la cabecera (ya existente).
- **Ver proceso** — modal con el `AuroraMessageMeta` completo: proveedor,
  modelo, intentos/fallbacks, duración, dificultad, herramientas invocadas
  (nombre + resumen + sustitución si la hubo) y si algo es reversible.
- **Reintentar** — reenvía el ÚLTIMO mensaje de usuario anterior a esta
  respuesta (`engine.ts::send`/`runCommand` aceptan ahora un segundo argumento
  opcional `{ forceSource }`); submenú con las fuentes/modelos disponibles
  AHORA MISMO (`detectAvailability()`, mismo catálogo que "Modelo por tarea"
  del panel de Inteligencia). Aditivo por diseño: añade una respuesta nueva al
  final, no muta el historial existente (evita romper el registro persistido
  ni el índice de ramas).
- **Revertir cambios** — ejecuta el `undo` de las herramientas de ESE mensaje
  que lo declararon (`src/lib/aurora/undo.ts::executeUndo`, tres tipos:
  `library-item` con `removeSaved`, `widget` quitándolo del tablero guardado,
  `setting` restaurando el valor previo). Si ninguna herramienta de ese
  mensaje era reversible (navegación, texto conversacional, despacho de
  agentes…), lo dice honestamente en vez de fingir un undo.
- **Guardar en Biblioteca** — usa las MISMAS funciones que
  `save-to-library.tsx` (`myLibraryDestinations` + `saveItem` de
  `entity-library.ts`), guardando en "Mi biblioteca" por defecto (un clic, sin
  abrir el selector de destino/carpeta del popover completo).

Soporta long-press táctil (mismo umbral de 500ms que el Finder). No toca
mensajes DM (`os_dm`), Biblioteca, Red ni el Composer.

### 17.5 Selección automática de herramientas (toggle)

`IntelligenceSettings.autoTools` (nuevo, default `true`) controla si
`engine.ts::runCommand` incluye la sección de herramientas
(`auroraToolsActionPromptSection`) en el system prompt de cada turno. Con
`autoTools:false`, Aurora conversa sin evaluar/ofrecer tools (ni de pantalla,
ni de integración, ni de contenido) — para quien prefiera un chat más
predecible. Visible en Ajustes → Inteligencia, junto a "Enrutado por
dificultad".
