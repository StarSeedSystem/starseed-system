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
7. Si TODO falla, error claro en es-ES (nunca silencio).

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
