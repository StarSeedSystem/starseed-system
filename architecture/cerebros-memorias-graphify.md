# 🧠🕸️ Grafos de Memorias (Graphify) + Sistema Avanzado de Cerebros de Memorias

> **SOP fuente de verdad** de: (1) el registro central de TIPOS de memoria, (2) el grafo
> 2D/3D de memorias por cerebro, (3) la capa Astraura que decide/crea memorias sola, (4) el
> sync multi-destino por cerebro, y (5) offline + fusión inteligente + conflictos.
> Actualizar ESTE doc antes de cambiar la lógica. Fecha: 2026-07-07 · Adenda 66.
>
> Regla dorada del proyecto: este documento se escribió **antes** que el código (§8 CLAUDE.md).

---

## 1. Inspiración (Graphify) — qué adaptamos y qué no

[Graphify](https://github.com/safishamsi/graphify) es una skill de Claude Code que convierte
cualquier carpeta de archivos en un grafo de conocimiento navegable (`graph.json` persistente,
`graph.html` interactivo, wiki Obsidian-compatible, `GRAPH_REPORT.md` con "god nodes" y
conexiones sorprendentes). Adaptamos los **conceptos**, no el código (licencia no verificada
como permisiva en el momento de escribir esto → implementación propia desde cero):

| Concepto Graphify | Adaptación StarSeed |
|---|---|
| `graph.json` persistente | No lo necesitamos: el grafo se recalcula en cliente desde `brain_memory_files` (ya realtime); es barato y siempre fresco. Ver §5. |
| Nodos + comunidades coloreadas | Nodos = memorias, coloreadas por **tipo** (§3), agrupadas visualmente por cerebro. |
| Aristas `EXTRACTED` / `INFERRED` / `AMBIGUOUS` | Igual vocabulario: `EXTRACTED` = `[[wiki-link]]` o `[link](url)` explícito en el markdown; `INFERRED` = mismo cerebro + mismo tipo (estructural, barato); `AMBIGUOUS` reservado para similitud semántica futura (embeddings) — **no implementado aún**, ver §11. |
| "God nodes" (mayor grado) | `topDegreeNodes()` — ranking simple por nº de aristas, mostrado en la leyenda del grafo. |
| Wiki navegable (`--wiki`) | Futuro: exportar `index.md` + un artículo por cerebro/tipo. No implementado en esta ola (§11). |
| `--watch` auto-sync | Ya lo tenemos mejor: realtime de Supabase sobre `brain_memory_files` (sin polling). |

## 2. Base ya existente (no se reinventa)

Antes de diseñar nada nuevo, este SOP **reutiliza intacto** lo que ya funciona:

- **`brain_memory_files`** (Supabase, RLS por owner) — ficheros `.md` por cerebro con
  `source/server_config/meta/sync`. Contrato en `src/lib/cerebro/memory-files.ts`. Este SOP
  **no cambia su esquema**; solo usa `meta` (jsonb, ya libre) para guardar `type`, `important`,
  `links[]` cacheados y metadatos de fusión/ramas — **sin migración**.
- **`brains`** (Supabase) — `src/lib/brains/brains.ts`. `Brain.config` (jsonb libre) es donde
  este SOP añade `memoryMode` y `memoryDestinations` — **sin migración**.
  `Brain.servers[]` (`BrainServer[]`) ya modela servidores externos por cerebro (N:N vía
  `addServer/removeServer`); se reutiliza para el destino "brain-store" (§7) en vez de duplicar
  un sistema paralelo.
- **`entity_state`** (`src/lib/sync/entity-state.ts`) — contrato genérico
  `getEntityState/setEntityState/subscribeEntityState` por `(owner_kind, owner_id, key)`. Se
  reutiliza para el **manifiesto StarSeed** de cada cerebro (§7) — key `brain-store:<brainId>`,
  `owner_kind:'user'`.
- **`src/ai/astraura/router.ts`** (`astrauraChat`) — router gratis-primero con enrutado por
  dificultad (RouteLLM-like). La capa nueva (§6) lo LLAMA, no lo reimplementa.
- **Patrón de grafo 3D**: `src/components/education/topic-graph.tsx` +`topic-graph-3d.tsx`
  (lista/mapa2D/red3D) y `src/components/cerebro-mapa/brain-mindmap-3d.tsx` (grafo
  cerebro→archivo→memoria con panel de inspección). El nuevo `memory-graph.tsx` (§5) sigue
  el MISMO patrón (dynamic import `ssr:false` para three.js, panel lateral de inspección,
  filtros por leyenda) pero con un foco distinto: relaciones DE CONTENIDO entre memorias
  (wiki-links), no la jerarquía cerebro→archivo→memoria (eso ya lo cubre brain-mindmap-3d).
- **`src/lib/memory-vault.ts`** — ya parsea `[[wiki-links]]` y `[label](url)` de un
  `MemoryDoc.markdown` a nodos/aristas (`parseMarkdownToGraph`). El nuevo parser de
  `memory-types.ts` (§4) es análogo pero opera sobre `MemoryFile` (brain_memory_files) y
  añade el registro de TIPOS + frontmatter; no se toca `memory-vault.ts` (ámbito distinto:
  memorias sueltas de cuenta vs. memorias de cerebro).

## 3. Registro central de tipos de memoria

Fichero: **`src/lib/brains/memory-types.ts`**. Único catálogo de tipos para TODO el OS
(cualquier módulo que necesite "qué tipos de memoria existen" importa de aquí, en vez de
listas locales duplicadas). Compatibilidad: los 5 ficheros semilla existentes de
`memory-files.ts` (soul/memory/dream/skills/apis) **siguen funcionando exactamente igual**
(no se tocan); el registro nuevo los incluye con los MISMOS colores para continuidad visual.

| id | Fichero por defecto | Uso típico |
|---|---|---|
| `memory` | `memory.md` | hechos/estado genéricos (fallback de cualquier `.md` no clasificado) |
| `ego` | `ego.md` | configuración/identidad de Aurora |
| `soul` | `soul.md` | identidad, valores, reglas del cerebro |
| `dream` | `dream.md` | objetivos/ideas en gestación |
| `imagine` | `imagine.md` | ideas especulativas / brainstorming visual |
| `style` | `style.md` | sistema de diseño / preferencias visuales |
| `reminders` | `reminders.md` | recordatorios y tareas con fecha |
| `knowledge` | `knowledge.md` | conocimiento consolidado / aprendizajes |
| `contexts` | `contexts.md` | contexto de sesión/situación (navegación, chat) |
| `skills` | `skills.md` | catálogo de habilidades atadas al cerebro |
| `plugins` | `plugins.md` | plugins/MCPs instalados y su config |
| `apis` | `apis.md` | APIs y conexiones (claves por referencia) |
| `designs` | `designs.md` | diseños/mockups referenciados |
| `mcps` | `mcps.md` | servidores MCP conectados |
| `logs` | `logs.md` | bitácora de eventos del sistema |
| `ui` | `ui.md` | preferencias de interfaz |
| `handoff` | `handoff.md` | traspasos de contexto entre sesiones/agentes |
| `profiles` | `profiles.md` | perfiles de cuenta relevantes |
| `agents` | `agents.md` | agentes configurados |
| `pages` | `pages.md` | páginas/entidades relevantes |
| `functions` | `functions.md` | funciones/acciones definidas |
| `configs` | `configs.md` | configuraciones técnicas |
| `preferences` | `preferences.md` | preferencias de usuario |
| `dashboards` | `dashboards.md` | dashboards guardados |
| `desktops` | `desktops.md` | escritorios guardados |
| `whiteboard` | `whiteboard.md` | pizarras (contenido/enlaces) |
| `blackboard` | `blackboard.md` | notas de pizarra "oficial"/lectura |
| `web` | `web.md` | referencias web relevantes |
| `browser` | `browser.md` | contexto de navegación |
| `apps` | `apps.md` | apps generadas/instaladas relevantes |
| `widgets` | `widgets.md` | widgets configurados |

Extensible: `registerMemoryType(def)` añade tipos custom en caliente (p. ej. un plugin futuro);
`memoryTypeById(id)` cae a `memory` (genérico) si el id no está registrado — nunca rompe.

## 4. Formato de memoria: markdown + frontmatter + `[[wiki]]`

Todas las memorias (de cualquier tipo) son **markdown compatible** (`.md`). El frontmatter es
**opcional y aditivo**: los 5 ficheros semilla existentes SIN frontmatter se siguen leyendo
igual (fallback a `{}`). Formato cuando existe:

```md
---
type: dream
important: false
tags: [proyecto-x, idea]
---

# Título

Contenido... con enlaces [[Otra memoria]] estilo Obsidian y [links](https://...) normales.
```

- `parseFrontmatter(markdown)` → `{ data, body }` (parser propio, sin dependencias nuevas:
  bloque `---\n...\n---` con líneas `clave: valor` | `clave: [a, b]` | `true/false`/número).
- `stringifyFrontmatter(data, body)` → inversa; si `data` está vacío devuelve `body` tal cual
  (no ensucia documentos simples).
- `extractWikiLinks(markdown)` → `string[]` (nombres referenciados vía `[[Nombre]]`).
- `important: true` (o `type` ∈ `soul|ego`) es la marca que la fusión offline (§8) usa para
  **nunca auto-fusionar sin confirmación humana**.

## 5. Grafo 2D/3D de memorias (`src/components/brains/memory-graph.tsx`)

- Datos: `listMemoryFiles(brainId)` (ya existente) + realtime `useRealtimeRows` sobre
  `brain_memory_files` filtrado por `brain_id`.
- Nodos: un `MemoryFile` = un nodo; color/icono por `inferMemoryType(file.name, file.meta)`.
- Aristas:
  - `EXTRACTED` — `extractWikiLinks(content)` resuelto contra `name` (sin `.md`) de otras
    memorias del MISMO cerebro (barato: no cruza red).
  - `INFERRED` — mismo cerebro + mismo tipo (agrupación estructural, peso bajo, se puede
    ocultar con el filtro "solo enlaces explícitos").
  - `AMBIGUOUS` — reservado, no emitido todavía (§11: similitud semántica por embeddings).
- Vistas: **2D** (SVG, pan/zoom, mismo patrón que `Map2DView` de `topic-graph.tsx`) y **3D**
  (`memory-graph-3d.tsx`, r3f + drei, cargado con `next/dynamic({ssr:false})` — nunca se
  importa directo desde código que pueda renderizar en servidor).
- Filtros: por tipo (leyenda-toggle, patrón `TypeToggle` de `brain-mindmap-3d.tsx`), por
  "solo EXTRACTED", y buscador de texto.
- Clic en nodo → panel lateral: editor markdown simple (reutiliza `updateMemoryContent`),
  selector de `type` (reescribe frontmatter), toggle `important`, y accesos a: fusionar con
  otra memoria seleccionada, crear rama (offline, §8), ver conflictos (§8).
- "Nodos clave": `topDegreeNodes(graph, 5)` listados en la leyenda (concepto "god nodes").
- Integración: nueva pestaña **"Grafo de memorias"** en `/cerebro/mapa` (junto al Mapa mental
  3D ya existente `BrainMindMap3D`, que sigue intacto) — el usuario cambia de vista con un
  selector, igual que el resto de vistas del OS.

## 6. Astraura + Memorias (`src/ai/astraura/memory-intelligence.ts`)

- **Mapa contexto → tipo(s)** (`CONTEXT_TYPE_MAP`): heurística por palabras clave/origen de
  evento → sugiere 1+ tipos candidatos (p. ej. chat de Aurora → `memory`/`contexts`; guardar
  en Biblioteca → `knowledge`; cambio de tema/diseño → `style`/`designs`; navegación →
  `web`/`browser`; guardar escritorio → `desktops`).
- **`autoUpdate(event)`**: acumula eventos en un buffer por tipo sugerido y, tras
  **debounce** (silencio de actividad, no cada evento), genera/actualiza la memoria
  correspondiente llamando a `astrauraChat({ taskHint: "summary", ... })` (usa el router
  gratis-primero + enrutado por dificultad YA existente, sin reimplementarlo) para redactar un
  resumen breve, y hace upsert en `brain_memory_files` vía `saveMemoryFile`/
  `updateMemoryContent`.
- **Eventos suscritos** (una sola vez, singleton idempotente igual que
  `aurora-chat-log.ts`/`neurons.ts`): `starseed:sync:apply` (cambios de sync genéricos),
  `starseed:library` (cambios de Biblioteca), `aurora:conversation` (mensajes de Aurora,
  `AURORA_CONVERSATION_EVENT`).
- **Modo por cerebro** — `Brain.config.memoryMode: 'write' | 'read'` (default `'write'` en
  los cerebros seleccionados del perfil vía `library-brains.ts`; `'read'` = Astraura solo lee
  contexto de ese cerebro, nunca escribe). `getBrainMemoryMode/setBrainMemoryMode`.
- Nunca bloquea al usuario: todo el pipeline es fire-and-forget, defensivo, con try/catch.
- Arranque: `startMemoryIntelligenceAutoUpdate()` se llama UNA vez desde el efecto de montaje
  de `AuroraProvider` (mismo bloque donde ya se arrancan neuronas/autonomía/defaults-seed),
  igual patrón `try { const m = await import(...); m.start...() } catch {}`.

## 7. Sync multi-destino por cerebro (`src/lib/brains/memory-destinations.ts`)

Cada cerebro declara `Brain.config.memoryDestinations`:

```ts
{ local: { enabled: true },              // SIEMPRE true (no desactivable) — mirror local (§8)
  starseed: { enabled: true },           // default ON — manifiesto en entity_state
  external: [{ id, serverId, url, label }], // 0+ destinos propios ("brain-store")
  p2p: { enabled: false, folderId?, label? } } // default OFF — espejo por Syncthing propio
```

- **`local` (siempre)** — el mirror local de §8 (`memory-offline.ts`); no requiere red.
- **`starseed` (default ON)** — `provisionStarseedStore(brain)` escribe/actualiza un
  **manifiesto** (`entity_state(owner_kind:'user', key:'brain-store:<brainId>')`) con
  `{ brainId, fileCount, updatedAt, limits }`. Esto es el "host gratuito automático": no crea
  infraestructura nueva (la StarSeed store REAL ya es la tabla `brain_memory_files`, gratis
  por cuenta), pero documenta honestamente el límite (cuota de la cuenta, sin SLA) y da a
  Astraura/():UI un registro consultable de qué cerebros están respaldados. Se llama al crear
  un cerebro (`ensureDefaultBrain`/`saveBrain` de un cerebro nuevo) y de forma perezosa al
  abrir el grafo.
- **`external[]` (opcional, tipo `'brain-store'`)** — en vez de duplicar el registro de
  `sync-providers.ts` (que es específico de `user_settings.prefs`/`SYNCED_KEYS`, ámbito
  cuenta, no cerebro), este SOP define el tipo **`'brain-store'`** como una etiqueta semántica
  sobre el mecanismo YA existente y más apto: `Brain.servers[]` (`BrainServer`, con
  `kind:'own'|'online'` + `endpoint` + `keyRef`) más `addServer/updateServer/removeServer` de
  `brains.ts`. `addExternalDestination(brain, {url,label,keyRef})` crea el `BrainServer` Y lo
  referencia en `memoryDestinations.external`. La sincronización REAL (push del bundle) puede
  delegar en `src/lib/brains/sync.ts` (`runLinkSync`) cuando el destino esté además enlazado
  como `brain_server_links` (ruta avanzada, ya existente); para el caso simple (un cerebro,
  una URL propia) `syncBrainMemoryNow` hace un `POST` best-effort directo al `endpoint` con el
  bundle de memorias (contrato `{ ok }` esperado, igual de laxo que `runtime.ts`).
- **`p2p` (opcional, default OFF, jul-2026 · adenda "Avatar + P2P + IoT")** — espejo del
  cerebro vía la instancia **SYNCTHING** propia del usuario: `{ enabled, folderId?, label? }`.
  NO duplica la config de conexión (endpoint + clave API por dispositivo, siempre local):
  esa vive en el proveedor `'p2p-syncthing'` de `sync-providers.ts` (§12 de
  `astraura-inteligencia.md`), configurable desde `/servidores` (`AccountSyncPanel`, que ya
  lista cualquier proveedor nuevo del registro sin tocar esa UI). Este destino solo declara SI
  el cerebro debe pedirle a Syncthing que sincronice y, opcionalmente, QUÉ carpeta le
  corresponde. `syncBrainMemoryNow` añade un paso `kind:'p2p'` best-effort y honesto: pide un
  reescaneo (`POST {endpoint}/rest/db/scan?folder=<id>`) — un NUDGE, no un push del contenido
  de las memorias por esta vía. Es un ESPEJO DE ARCHIVOS entre los dispositivos del propio
  usuario (o de una comunidad/Sangha que quiera compartir cerebro), complementario al mirror
  local de §8 y al manifiesto `starseed` de arriba — nunca los sustituye.
- Decisión de diseño explícita (honestidad): **no se crea una tabla nueva** para destinos;
  todo vive en `Brain.config` (jsonb ya existente) + `entity_state` (ya existente) +
  `Brain.servers[]` (ya existente). Evolución futura si hace falta más escala: tabla dedicada
  `brain_memory_destinations` — no implementada aquí (ver §11).

## 8. Offline + fusión inteligente (`src/lib/brains/memory-offline.ts`)

- **Mirror local**: `localStorage['starseed.brain.<id>.memory-mirror.v1']` = snapshot de los
  `MemoryFile` del cerebro (id, name, content, meta, updated_at). `exportBrainMemory(brainId)`
  actualiza el mirror y devuelve un bundle descargable (`.json`, mismo patrón
  `showSaveFilePicker`/descarga clásica que `sync-providers.ts`). `importBrainMemory` hace lo
  inverso (sube un bundle y lo fusiona en el mirror + Supabase si hay red).
- **Cola offline**: `localStorage['starseed.brain.<id>.offline-queue.v1']`. Si una escritura
  falla (o `navigator.onLine === false`), se encola `{fileId, patch, baseUpdatedAt, at}` en vez
  de perderse.
- **Fusión al reconectar** (`flushOfflineQueue`, disparada por el evento `online` de
  `window` + llamada manual):
  1. Si el remoto no cambió desde `baseUpdatedAt` → aplica directo (fast-forward, sin
     conflicto).
  2. Si cambió y la memoria **no** es `important`/`soul`/`ego` → **fusión automática**: se
     concatenan ambas versiones bajo encabezados `## (local, sin sincronizar)` /
     `## (remoto)` con una nota de fusión (no se inventa un merge semántico de prosa — sería
     deshonesto pretender resolverlo solo; se preserva TODO el contenido y se marca
     claramente, quedando a mano del usuario limpiarlo si quiere).
  3. Si cambió y la memoria **es** `important`/`soul`/`ego` → **NO auto-fusiona**: crea una
     entrada en el registro de conflictos.
- **Registro de conflictos**: `localStorage['starseed.brain.<id>.conflicts.v1']`, evento
  `starseed:brain-conflicts`. UI mínima: `src/components/brains/memory-conflicts-panel.tsx`
  (montado como sección plegable dentro de `memory-graph.tsx`) — elegir versión A (local) / B
  (remoto) / editar fusión manual.
  `resolveConflict(brainId, conflictId, 'local'|'remote'|'merged', mergedText?)`.
- **Ramas de memoria**: `createMemoryBranch(fileId, content, label)` crea una NUEVA fila
  `brain_memory_files` con `meta.branchOf = fileId` (no toca el original). `mergeBranch(...)`
  aplica el contenido de la rama al original (manual, con vista previa) y dejar la rama o
  archivarla es decisión del usuario (no se borra sola).
- Límite honesto: esto es fusión "buena samaritana" (preserva todo, nunca pierde datos), NO un
  CRDT real de texto. Un merge de prosa carácter-a-carácter queda para una evolución futura
  (§11) si el volumen de ediciones concurrentes lo justifica.

## 9. Integración en páginas existentes

- `/cerebro/mapa` (`src/app/(app)/cerebro/mapa/page.tsx`): añade un selector "Mapa mental 3D"
  | "Grafo de memorias" sobre el mismo lienzo; `BrainMindMap3D` (existente, intacto) sigue
  siendo la vista por defecto.
- `AuroraProvider` (`src/components/aurora/aurora-provider.tsx`): una línea más en el bloque de
  arranque ya existente (neuronas/autonomía/defaults-seed) para `startMemoryIntelligenceAutoUpdate()`.
- No se toca `/memorias-3d` (memory-mesh-3d, ámbito de cuenta general) ni `network/**`,
  mensajes, correo, buscador de biblioteca, ni ajustes generales (fuera de alcance de esta
  ola, ver instrucciones de la tarea).

## 10. Cumplimiento de la Tríada e invariantes (CLAUDE.md)

- **Identidad soberana / Código abierto**: sin dependencias nuevas de pago; el parser de
  frontmatter es propio (cero paquetes nuevos). Destinos externos son endpoints que el usuario
  controla (`brain-store`).
- **Singularidad del contenido**: ramas (§8) referencian el original (`branchOf`), no lo
  duplican de forma "oficial"; fusionar es explícito.
- **Ontocracia / meritocracia del entendimiento**: nada de esto introduce jerarquía de
  usuarios; es infraestructura personal por cuenta/cerebro.
- **Privacidad↔transparencia**: los manifiestos StarSeed (`entity_state`) no exponen contenido,
  solo metadatos (conteo, fecha); el contenido real sigue con RLS por owner.

## 11. Estado y evolución futura (honesto)

**Implementado en esta ola (v1):**
- Registro central de tipos (§3), frontmatter + wiki-links (§4), grafo 2D/3D con aristas
  EXTRACTED/INFERRED y nodos clave (§5), Astraura auto-update con debounce + modo
  write/read por cerebro (§6), destinos local/StarSeed/brain-store (§7), mirror local + cola
  offline + fusión no-destructiva + conflictos + ramas (§8).

**Pendiente / evolución futura (NO implementado, anotado honestamente):**
- Aristas `AMBIGUOUS` por similitud semántica real (embeddings) — hoy solo EXTRACTED/INFERRED.
- Export estilo `--wiki` (índice + artículo navegable por agente) y `graph.svg`/`graphml`.
- CRDT de texto real para fusión concurrente de prosa (hoy: preservar-todo + marcar, no
  merge carácter-a-carácter).
- Tabla dedicada `brain_memory_destinations` si el nº de destinos externos por cerebro crece
  mucho (hoy: `Brain.config` + `Brain.servers[]` alcanzan sin migración).
- Conexión real del `starseed_memory_root/` (carpeta raíz+ramas, `memory.manifest.json`) como
  un destino más — diseño ya descrito en `architecture/memoria-cerebros-sync.md` (pendiente,
  "prueba futura con la cuenta Ester"); este SOP deja el campo `external` de
  `memoryDestinations` abierto para ese conector cuando se implemente.

## 12. Referencias cruzadas

- `architecture/memoria-cerebros-sync.md` — diseño (pendiente) de vínculo memory-root↔cerebros/servidores/VMs; este SOP avanza una primera pieza (manifiesto StarSeed por cerebro, §7) compatible con ese diseño mayor.
- `architecture/libreria-biblioteca-sync.md` §12 — patrón `entity_state` por perfil que
  `library-brains.ts` ya usa; mismo patrón para el manifiesto de §7.
- `architecture/astraura-inteligencia.md` — router gratis-primero + enrutado por dificultad
  que `memory-intelligence.ts` reutiliza tal cual.
- `src/lib/cerebro/memory-files.ts`, `src/lib/brains/brains.ts`, `src/lib/brains/servers.ts`,
  `src/lib/brains/sync.ts`, `src/lib/brains/merge-duplicate.ts`, `src/lib/sync/entity-state.ts`,
  `src/lib/memory-vault.ts`, `src/components/cerebro-mapa/brain-mindmap-3d.tsx`,
  `src/components/education/topic-graph.tsx` / `topic-graph-3d.tsx`.

---

*Escrito antes del código (regla dorada, §8 CLAUDE.md). Última actualización: 2026-07-07.*
