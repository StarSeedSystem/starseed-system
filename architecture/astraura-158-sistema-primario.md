# SOP — Astraura 1.58-bit como SISTEMA PRIMARIO de inteligencia (Adenda 153)

> **Fecha:** 2026-08-22 · **Estado:** fuente de verdad de esta ola.
> Fusiona el sistema soberano **Astraura 1.58-bit** (repo `StarSeedSystem/astraura`, carpeta local
> `~/Documents/IA 1.58 bit`, backend FastAPI + frontend Vite, Vercel `astraura.vercel.app`, Cloud Run
> `astraura-backend-334237619848.us-central1.run.app`, Supabase **del OS** `nxstilnyidvkqeosofuh`) con la
> capa Astraura del OS (`src/ai/astraura/*`, Adendas 63/67/71-bis/149). Regla dorada: este SOP va ANTES que el código.

---

## 1 · Propósito

1. **Astraura 1.58-bit es el sistema primario por defecto** de TODA inteligencia del OS (chat de Aurora, orbe,
   `/agent`, consejo, organizadores, generadores…). Todas las fuentes actuales (Ollama, LM Studio, WebLLM,
   Groq/Cerebras/OpenRouter/Gemini :free, Pollinations, Neurocortex «starseed», de pago con clave…) **siguen
   operativas como sistemas secundarios**: cadena de failover intacta, gratis-primero intacto.
2. **Configurable por cerebro, personalidad o agente** (y por neurona/cuenta): cualquiera de esos ámbitos
   puede declarar OTRO sistema primario («automático gratis-primero» o una fuente/modelo concreta). La elección
   más específica gana; nada es exclusivo salvo que el usuario lo pida (`exclusivo`).
3. **Honestidad radical** sobre lo que el backend 1.58 hace HOY (ver §10): el OS nunca deja sin respuesta
   porque el backend esté apagado, frío o sin modelo.

## 2 · Qué es cada cosa (correlación de conceptos)

| Astraura 1.58-bit (backend/frontend Vite) | StarSeed OS (esta ola) | Cómo se fusiona |
|---|---|---|
| **Motor** `BitNetUnifiedEngine` (`/api/chat/stream`, `/api/chat`, `/ws/chat`) | Proveedor `astraura-158` (`src/ai/providers/astraura-158.ts`) + fuentes `astraura-158-local` / `astraura-158-nube` del catálogo | El router lo coloca PRIMERO en la cadena (§5). Adaptador SSE → `onChunk`. |
| **Personalidades** (`aurora`, `astraura_prime`, `hermione`, `hephaestus`, `hermes`, `atenea`, `oneiros`, `kallisti`, `mnemosyne`, `logos`; `/api/personalities`) | `PersonalityProfile` del OS (presets Aurora, Hermione, Mentora, Cómplice, Analista, Guardiana, Exploradora, Poeta) | Cada personalidad 1.58 es un **«modelo»** de la fuente: `astraura-158/<persona>`. `auto` → se deduce de la personalidad activa del OS (`persona158For`). El prompt de la personalidad del OS viaja como `system_prompt` y MANDA sobre la identidad interna del backend. |
| **Agentes** (bóveda `/api/agents`, ecosistema `/api/ecosystem/agents`, enjambre `/api/swarm/*`, director «Metis») | Agentes de la Biblioteca (`src/lib/agents/*`) + runtimes de `/agent` | Se LISTAN y se activan/desactivan desde el panel «Astraura 1.58» (toggles reales). El agente del OS puede fijar su propio sistema primario (`porAgente`). Invocación `/api/v1/agents/{id}/invoke` **no** se cablea (el backend devuelve placeholder, §10). |
| **Habilidades** (`/api/skills`, 12 flags) | `src/ai/astraura/skills.ts` (capacidades) | Tabla de equivalencias §2.1; toggles reales desde el panel; se inyectan como texto de contexto en el prompt cuando el primario es 1.58. |
| **Cerebros** (`/api/cerebros`, `md_layers{soul,ego,personality,style,skills,memory,dream,accounts,tasks,logs}`) | Cerebros del OS (`lib/brains`) + memory root (`soul/ego/skills/style/memory/dream/accounts/tasks/logs`) | Mismo contrato de ramas que `starseed_memory_root`. Panel: activar cerebro 1.58; `porCerebro` fija el primario por cerebro del OS (`brainId` del chat). |
| **Memoria** (mem0 JSON, grafo, TF-IDF, recuerdos) | `memories` (Supabase), memory-intelligence | Búsqueda mem0 desde el panel (informativa). No se mezcla con la memoria del OS en esta ola. |
| **Voz** (Web Speech + WAV procedural «audio.cpp», VoiceStudio) | **OmniVoice** (sistema de voz del OS, A149/112) | OmniVoice sigue siendo EL sistema de voz. Los perfiles de VoiceStudio 1.58 quedan como pendiente (§11). |
| **Gateway** (`active_tunnel.json`, cloudflared, Cloud Run, `astraura_backend_gateway`) | `NeuronSettings.astraura158.endpoint` + proxy `/api/ai/astraura-158` | La neurona declara su endpoint (local, LAN, túnel o nube). El OS publicado usa el proxy propio para la nube (sin CORS ni contenido mixto). |
| **Sync** (Supabase `astraura_state`, R2 `astraura-shared`) | Migración `supabase/migrations/20260822120000_astraura_state.sql` | Tabla formalizada con RLS (solo service role). El OS no la lee en esta ola. |
| **Secciones** (21 pestañas del frontend Vite) | Superficies ya existentes del OS (§7) + panel «Astraura 1.58» | Lo que el OS ya tiene se ENLAZA; lo exclusivo del 1.58 (imaginación, sensorium, enrutamiento de medios, instalador) se muestra en el panel con enlace a la UI completa. |

### 2.1 Habilidades 1.58 → capacidades del OS

| skill 1.58 | capacidad OS (`skills.ts`) | Nota |
|---|---|---|
| `bitnet-158-engine` | (este proveedor) | Encendida ⇒ el primario 1.58 se ofrece. |
| `computer-fs-access` | `os-control` / explorador | Solo efectiva en la neurona que corre el backend. |
| `terminal-exec` | terminal (`os-control`) | **Sin auth en el backend** (§10): el OS NO expone ejecución remota. |
| `system-senses` | `web-senses` / sentidos | Telemetría del host del backend. |
| `aurora-web-access` | `web-access` | Búsqueda real (DuckDuckGo/Brave/jina). |
| `research-open-notebook` | `research` | RAG local TF-IDF. |
| `knowledge-graph-engine` | memoria / `memory` | Grafo asociativo. |
| `code-sandbox` | `app-builder` | Ejecuta código en el host del backend (sin auth). |
| `hugging-bay` | `model-discovery` | Mismo nombre, misma intención. |
| `audiomorphic-voice` | `voice` (OmniVoice) | — |
| `taste-skill` | `taste` | — |
| `starseed-auto-update` | actualizador (`startup-updates.ts`) | — |

## 3 · Capa nueva: `src/lib/astraura/primary-system.ts` (pura, SSR-safe)

### 3.1 Persistencia
Clave `starseed.astraura.primary-system.v1` (añadida a `SYNCED_KEYS` → viaja con la cuenta; sin secretos).

```ts
export type PrimaryMode = "astraura-158" | "auto" | "fuente";
export interface PrimaryChoice {
  modo: PrimaryMode;          // astraura-158 (defecto) · auto (gratis-primero clásico) · fuente (una fuente/modelo)
  fuente?: string;            // id del catálogo cuando modo === "fuente"
  modelo?: string;            // id de modelo opcional (p.ej. "astraura-158/hermione")
  exclusivo?: boolean;        // true ⇒ si el primario falla NO hay failover (respuesta honesta)
}
export interface PrimarySystemStore {
  cuenta?: PrimaryChoice;                        // defecto de la cuenta
  porNeurona?: Record<string, PrimaryChoice>;     // deviceId
  porCerebro?: Record<string, PrimaryChoice>;     // brainId del OS
  porAgente?: Record<string, PrimaryChoice>;      // agentId de la Biblioteca
  porPersonalidad?: Record<string, PrimaryChoice>;// personaId del OS
}
```

### 3.2 Resolución (precedencia dentro de la capa)
`resolvePrimarySystem({ deviceId, personaId, agentId, brainId })` →
`{ choice, provenance }` con `provenance ∈ "agente" | "personalidad" | "cerebro" | "neurona" | "cuenta" | "defecto"`.
Orden: **agente > personalidad > cerebro > neurona > cuenta > defecto (`{ modo: "astraura-158" }`)**.
Razón: el agente es el actor concreto del turno; la personalidad, la voz/estilo; el cerebro, el contenedor de
memoria; la neurona, el hardware; la cuenta, el defecto global.

### 3.3 Lo que NO cambia
Los pines explícitos de LLM ya existentes (por chat, neurona×personalidad A149, personalidad «fija» A67)
siguen ganando a esta capa: son decisiones más concretas («usa ESTE modelo») que «qué sistema va primero».

## 4 · Proveedor y catálogo

- **`src/ai/providers/astraura-158.ts`** — `Provider` real: construye `system_prompt` (mensajes `system` del OS)
  y `prompt` (transcripción de los turnos previos + último mensaje; el backend es single-turn), envía
  `preferences` `{ selected_personalities:[persona], multi_personality_mode:"single", personaId, response_style,
  max_length_chars, web_data_enabled }`, consume el SSE de `/api/chat/stream` (`token` → `onChunk`,
  `done.full_text` → texto final) y cae a `POST /api/chat` si no hay stream. Los errores HTTP llevan el
  código en el mensaje (`Astraura 1.58 error 503: …`) para que el router aplique cooldown/dead-source.
  Funciones puras exportadas y testeadas: `buildAstraura158Prompt`, `parseAstrauraSseLine`, `persona158For`.
- **Catálogo** (`free-catalog.ts`, al principio): `astraura-158-local` (tier `local`, `http://127.0.0.1:8000`,
  peso 1.3, timeout 95 s) y `astraura-158-nube` (tier `instant`, `baseUrl` = `NEXT_PUBLIC_ASTRAURA_158_URL`
  o proxy `/api/ai/astraura-158`, peso 1.2, cooldown 5 min). Modelos = personalidades 1.58 (`astraura-158/auto`
  + una por personalidad) con fortalezas por «órgano» (Hephaestus→code, Logos→reasoning, Kallisti/Oneiros→creative…).
- **Disponibilidad** (`availability.ts`): sonda `GET {endpoint}/api/status` (1.5 s local · 4 s nube, TTL 60 s).
  El endpoint local respeta `NeuronSettings.astraura158.endpoint` (túnel/LAN/Cloud Run propio) y la config de
  usuario de la fuente.
- **Proxy** `src/app/api/ai/astraura-158/route.ts`: `GET ?path=/api/status` y `POST` (stream passthrough) hacia
  `ASTRAURA_158_URL` (server) con `ASTRAURA_158_KEY` opcional (`X-Astraura-Key`). Solo rutas de lectura/chat
  (allowlist): nunca `/api/system/exec`, `/api/execute/*`, `/api/projects/file/*`.

## 5 · Router (`src/ai/astraura/router.ts`) — bloque «SISTEMA PRIMARIO»

Orden final de la cadena, de más a menos específico:

1. `forceSource` (reintentar con proveedor elegido a mano).
2. Pin por chat (`chatConfig.provider`; ahora casa por id de fuente **o** por `providerId` — corrige el desajuste
   histórico con `chat-config-menu.tsx`).
3. Pin neurona×personalidad (A149) / pin «fija» de la personalidad (A67) → `pinnedFirst`.
4. **Sistema primario (esta ola)** → `primaryFirst`: con `modo:"astraura-158"` se antepone la fuente 1.58
   **lista** (local antes que nube); el modelo `auto` se resuelve con `persona158For(persona)`. Con
   `modo:"fuente"` se antepone esa fuente/modelo si está lista. Con `modo:"auto"` no se toca nada.
   `exclusivo:true` ⇒ la cadena se reduce al primario (si no está listo, respuesta honesta).
5. Ranking gratis-primero de siempre (secundarios) + redes de seguridad sin clave + IA del navegador + reintento.

`AstrauraChatRequest` gana `agentId?` (lo pasa `turn.ts` desde el binding del objetivo, `primaryAgentForTarget`).
El `RouteRecord` añade `primary?: { modo, provenance }` para la transparencia (barra de acciones, rutas).

## 6 · Neurona

- `NeuronCapabilities.astraura158?: { online: boolean; endpoint: string; model?: string; bitnet?: boolean }`
  (sonda en `detectCapabilities`, publicada en `neuron_devices.capabilities` → otras neuronas pueden
  descubrir el backend de esta).
- `NeuronSettings.astraura158?: { endpoint?: string; enabled?: boolean }` (`starseed.neurons.prefs.v1`).

## 7 · Superficies (medios correctos, CLAUDE.md §11)

| Superficie | Qué aparece |
|---|---|
| Ventana «Sistemas de Astraura en esta neurona» → pestaña **LLM** | Tarjeta «Sistema primario» (efectivo + procedencia + selector 1.58 / auto / fuente concreta; «Todas» edita el ámbito neurona, una personalidad edita `porPersonalidad`). |
| `/agent?tab=astraura-158` (grupo **Infra**, «Astraura 1.58») | Panel: estado del motor, endpoint (local/túnel/nube + probar), sistema primario de cuenta y de esta neurona, personalidades 1.58 (activar / usar como modelo), agentes (toggle), habilidades (toggle), cerebros (activar), memoria mem0 (buscar), instalación (`install.sh`) y enlace a la UI completa. |
| `AgentConfigPanel` (Biblioteca → agente) | Selector «Sistema primario de este agente» (`porAgente`). |
| Paleta de comandos (Cmd/Ctrl+K) | `action:astraura-158` → abre el panel. |
| Catálogo de apps / Biblioteca | App «Astraura 1.58» (`/agent?tab=astraura-158`), sin migración de dock (pestaña ya registrada). |
| Barra de acciones del mensaje / registro de rutas | `RouteRecord.primary` (qué sistema primario actuó y por qué). |

## 8 · Diseño
Acento del proveedor: **cian 1.58** (`#00f0ff` del propio Astraura) sobre los tokens `--aw-*` de la ventana A149;
icono Lucide `Cpu`/`Binary`; etiqueta «1.58-bit» en chip mono. Sin emoji como icono. Estados honestos:
«listo · local», «listo · nube», «arrancando», «apagado (cae a secundarios)».

## 9 · Backend 1.58 (repo `astraura`) — cambios mínimos de esta ola
- `backend/app/api/starseed_bridge.py` (NUEVO): `GET /api/starseed/manifest` (motor, personalidades, agentes,
  habilidades, cerebros, versión en UNA llamada), `GET /api/starseed/health` (ligero, sin telemetría),
  `POST /api/starseed/chat` (acepta `messages[]` estilo OpenAI + `persona_id`, construye la transcripción en el
  servidor y reusa `orchestrator.generate_response_stream`). Registrado en `main.py` junto a `voice_studio_router`.
- `backend/app/engine/bitnet_engine.py`: `ASTRAURA_OLLAMA_URL` y `ASTRAURA_OLLAMA_MODEL` (env) para elegir
  servidor/modelo de Ollama en vez del primero de `/api/tags`.
- El OS usa `/api/starseed/chat` si existe (404 → cae a `/api/chat/stream`), así funciona con backends antiguos.

## 10 · Límites honestos (verificados en el código el 2026-08-22)
- **Inferencia real** del backend = **Ollama local** (`127.0.0.1:11434`, primer modelo de `/api/tags`). No hay
  binario BitNet compilado ni GGUF en el repo; `scripts/setup_bitnet.sh` + `scripts/download_model.py`
  (`microsoft/BitNet-b1.58-2B-4T`, `i2_s`) lo habilitan. Sin Ollama ni GGUF, el backend responde con
  **plantillas** (no es IA) → el OS lo detecta por `/api/status.engine` y avisa en el panel.
- `/api/v1/*/invoke` devuelve placeholders; enjambre, director, imaginación, sueños, OS-update y sync de
  servidores son **simulaciones con JSON**; voz = Web Speech + WAV procedural. El OS los muestra como
  informativos y NO los presenta como funciones reales.
- **Seguridad**: el backend no tiene auth (`/api/system/exec`, `/api/execute/*`, `/api/projects/file/write`
  ejecutan/escriben sin clave, CORS `*`) y el repo contiene claves de API en `data/*_apis.json` y
  `backend/data/*_apis.json`, GPS exacto en `data/sensorium/` y rutas `/Users/alex/...` hardcoded. Mientras no se
  proteja, el OS solo lo usa para chat/lectura y el proxy del OS aplica allowlist. Acción de Alex: rotar claves,
  sacar `data/` y `r2_credentials.local.json` del repo y del Proyecto de Claude.
- **Vercel** `astraura` NO está enlazado a GitHub (deploys manuales con CLI, último 2026-08-20 < commits del
  21-22) y `active_tunnel.json` da 404 en producción → redeploy pendiente o enlazar el proyecto al repo.
- **Cloud Run** con `min-instances 0` arranca frío (>4 s) ⇒ la sonda lo marca «arrancando» y ese turno va a
  secundarios; con `min-instances 1` queda 24/7.
- **Supabase MCP** (26a13ed1) no tiene acceso a `nxstilnyidvkqeosofuh`: la migración se aplica por Management API
  como las anteriores.

## 11 · Pendiente (siguientes olas)
- Importar perfiles de VoiceStudio 1.58 a OmniVoice (mapeo de prosodia) · mezclar mem0/grafo con `memories`.
- Auth del backend (`X-Astraura-Key` para TODO) y quitar RCE sin clave; entonces cablear terminal/explorador.
- Compilar BitNet en la neurona (kit local desde el panel) y leer `engine.models_on_disk` para el chip «BitNet real».
- Enlazar Vercel `astraura` a GitHub; `min-instances 1` en Cloud Run; CSP enforcing con loopback.

## 12 · Verificación de la ola
`tsc --noEmit` 0 · `vitest` (tests nuevos: `primary-system`, `astraura-158` provider puro) · `next build` ✓.

## 13 · Estado tras la tanda 2 (2026-08-22 · «siguientes pasos»)

**CERRADO**
- Migración `20260822120000_astraura_state.sql` **APLICADA** al proyecto `nxstilnyidvkqeosofuh` por Management API (tabla ya existía con 8 filas y RLS activa; añadidos `owner_id`, índices, política `astraura_state_select_own`, `revoke anon`) y **registrada** en `schema_migrations`.
- Backend 1.58 endurecido (`backend/app/core/security.py`): modos `local-only` (defecto) · `key` · `open`; 27 patrones de rutas peligrosas; clave maestra (`ASTRAURA_API_KEY` / `~/.astraura/master_key.txt`); claves de personalidades/agentes movidas a `~/.astraura/keys/` con migración única; `api_status` enmascara la clave; `scripts/rotate_keys.py` + `scripts/purge_secrets_from_repo.sh` + `.gitignore`.
- Rutas portables: 101 rutas `/Users/alex/...` en 21 módulos → `WORKSPACE`/`HOME` derivados de `core/config.py`; `/active_tunnel.json` único y dinámico.
- Bugs corregidos: `HTTPException` sin importar; imports inexistentes `app.core.{memory_graph_engine,personality_engine,starseed_memory_engine,cerebros_manager}` (4 rutas 500); `TypeError` del despachador proactivo del enjambre (`target_folder_path`); `search_documents` (layered), `synthesize_speech` (voice preview), `trigger_manual_dream` (workflows); `is_compiled` honesto (exige binario).
- Motor honesto: `engine.real_mode` (`bitnet-native` · `ollama` · `templates`), sonda cacheada a Ollama, `ASTRAURA_OLLAMA_URL/MODEL`. El OS lo muestra (`describeAstraura158Engine`).
- Memoria: memory root bajo `DATA_DIR` (antes `backend/data`, nunca se sincronizaba), tope FIFO de documentos autogenerados (`ASTRAURA_MAX_AUTOGEN_DOCS`), sync **incremental** por hash con tope de tamaño (`ASTRAURA_SYNC_MAX_MB`), secciones nuevas (personalidades, habilidades, recuerdos, manifiesto), `scripts/compact_memory_docs.py` (dry-run: 33 789 docs → 2 231; archivo `.json.gz` completo).
- Frontend 1.58: fallback `/api` correcto, deep-link `?gateway=` aplicado y limpiado, `apiUrl()` en todos los servicios (omniVoice, sensorium, App), `Content-Type` JSON, `fs_access_api` import, `omniVoice.stop()`, GatewayModal accesible (botón en cabecera y «Más»), QR **local** (`services/qrCode.js`, sin servicios externos), auto-detección que no pisa un gateway del usuario. `vite build` ✓.
- OS: CSP `connect-src` con loopback explícito (`http://127.0.0.1:*`, `ws://localhost:*`…).

**NO cerrado (acción de Alex)**
- **Vercel `astraura`**: no se pudo redesplegar desde aquí (el bundle no cabe en la herramienta) ni enlazar a GitHub (`repo_no_access`: la app de GitHub de Vercel no tiene acceso a la organización `StarSeedSystem`). Pasos: GitHub → Settings → Applications → Vercel → dar acceso a `StarSeedSystem/astraura`; luego Vercel → proyecto `astraura` → Settings → Git → conectar el repo con Root Directory `frontend`. Mientras tanto: `cd "IA 1.58 bit/frontend" && npx vercel --prod`.
- **Cloud Run**: `gcloud run services update astraura-backend --region us-central1 --min-instances 1 --set-env-vars ASTRAURA_AUTH_MODE=key,ASTRAURA_API_KEY=<clave>` y la misma clave como `ASTRAURA_158_KEY` en Vercel del OS (+ `ASTRAURA_158_URL`).
- Rotar claves (`scripts/rotate_keys.py`) y purgar del índice/historial; compactar el memory root (`--apply`); compilar BitNet + GGUF `i2_s` (`scripts/setup_bitnet.sh` + `download_model.py`).
- El dispositivo de escritorio rechazó el staging (`untrusted_device`): hay que volver a iniciar sesión en la app de Claude para que los archivos se escriban en disco; mientras, se entregan como parches/zip.

## 14 · OLA 3 — Integración TOTAL: Astraura 1.58 como cerebro operativo del OS (2026-08-22)

> Petición de Alex: «rediseñar toda la sección de Astraura IA del OS para que use Aurora 1.58 —Exocórtex, orbe
> flotante con su chat y todas las páginas—; todo lo desarrollado en 1.58 debe incorporarse (salvo diseños
> visuales); todos los agentes y personalidades con sus procesos imaginativos/intuitivos autónomos en segundo
> plano, sincronizados en cerebros, memorias y personalidades, con accesos completos y notificaciones especiales».

### 14.1 Principio
El OS es la **superficie** (diseño Crystal Liquid Glass, navegación, cuenta, neuronas, sync) y Astraura 1.58 es el
**cerebro operativo**: motor, personalidades, agentes, imaginación, enjambre, director, memoria episódica,
sensorium, privacidad, almacenamiento, proyectos, creaciones, workflows y voz-prosodia. Todo lo que el backend
sabe hacer se opera desde el OS; nada del OS deja de funcionar si el backend no está (secundarios + honestidad).

### 14.2 Backend (repo `astraura`) — procesos REALES, no plantillas
- `backend/app/core/cognition.py` — `await generate(prompt, system, max_tokens, temperature, timeout)` →
  `{text, real, mode}` sobre `bitnet_engine.generate_stream`. `real=false` (texto vacío) cuando `real_mode=="templates"`.
- Motores que lo usan en sus puntos de creación de contenido (plantilla solo como respaldo, marcando
  `generated_by: "llm" | "template"` en cada registro): imaginación (ramas/hipótesis por `process_type`),
  sueños (`execute_dream_burst`), enjambre (entregable real por tarea al completar), director (auditoría,
  formulación de la siguiente tarea), informes de síntesis (resumen).
- Chat: temperatura de la personalidad; `[RECUERDOS]` mem0 top-3 en el contexto; `record_user_activity()`
  (gobernador adaptativo del enjambre). `/api/v1/{agents,personalities}/{id}/invoke` devuelven texto REAL.
- Air-gap REAL: `privacy_manager.is_air_gapped()` bloquea navegador/crawl/deep-research, clima y sync.
- Puente (`starseed_bridge.py`): `GET /api/starseed/events?since=` (notificaciones no leídas, insights y
  propuestas de imaginación pendientes, tareas del enjambre completadas, eventos de aprendizaje; con `actions`
  ejecutables), `POST /api/starseed/events/ack {ids}`, `GET /api/starseed/processes` (imaginación + enjambre +
  director + sueños + autorizaciones en una llamada), `POST /api/starseed/processes/imagination/trigger`.

### 14.3 OS — superficies rediseñadas
| Superficie | Qué cambia |
|---|---|
| Chat (Exocórtex, orbe, /agent, consejo) | Proveedor 1.58 recoge `branching_plan`/`agent_traces`/`tool_executions`/personalidades participantes → `AuroraMessageMeta.astraura158` (modal de proceso «Ramificación y agentes 1.58»). `@Menciones` de personalidades 1.58 en el texto → `selected_personalities` + modo diálogo/coral. Orbe: timeout 120 s. |
| Personalidades | Importación idempotente de las 10 personalidades 1.58 como perfiles del OS (`p158-<id>`, prompt/color/voz; primario `astraura-158/<id>` vía `porPersonalidad`). Hub con sección «Personalidades 1.58». |
| Agentes | Importación de los agentes 1.58 (bóveda + ecosistema) como agentes de la Biblioteca (`agent158-<id>`), con capacidades mapeadas y primario por agente. Tareas del enjambre, director, horarios y agentes del ecosistema operables desde el Studio. |
| Imaginación (NUEVO `/agent?tab=imaginacion`) | Estado always-on, procesos, ramas/propuestas (aplicar/conceder), agentes con imaginación, director, informes de síntesis, configuración global (frecuencia, % CPU, permisos). |
| Notificaciones especiales | `astraura-158-feed.ts` sondea `/api/starseed/events` (30 s) → notificaciones del OS (`app-notify`) con acciones (autorizar/aplicar), pestaña «Alertas» de Trinity y Studio; ack al backend. |
| Cerebros · Memoria | Cerebros 1.58 y mem0/grafo/recuerdos en el Studio; cerebro activo 1.58 ↔ `brainId` del OS (`porCerebro`). |
| Sentidos · Privacidad · Almacenamiento · Proyectos · Creaciones · Workflows · Voz 1.58 · Instalación | Pestañas del Studio «Astraura 1.58» con el diseño del OS, operando los endpoints reales del backend. |
| Neuronas | Tarjeta «Backends 1.58 en tus neuronas» (capacidades publicadas) con «Usar este backend». |
| Configuración | Pestaña Astraura: tarjeta «Procesos autónomos 1.58» (always-on, frecuencia, permisos, capacidad del enjambre). |

### 14.4 Verificación real (criterio de cierre)
Backend arrancado con lifespan (bucles de fondo) y un modelo real (BitNet nativo o Ollama): (1) `/api/starseed/events`
trae eventos nuevos tras ≥2 ciclos; (2) ramas de imaginación y entregables del enjambre con `generated_by:"llm"`;
(3) `invoke` devuelve texto real; (4) chat con `@Hermes @Logos` produce segmentos de varias personalidades;
(5) air-gap bloquea la web; (6) OS: `tsc` 0 · vitest ✓ · `next build` ✓.

### 14.5 Estado (2026-08-23 · Adenda 155 — Ola 3 ejecutada)

**Backend (repo `astraura`) — HECHO Y VERIFICADO EN VIVO:**
- Motor nativo REAL: `bitnet_cpp_manager` gestiona `llama-server` (build propio) con el GGUF i2_s
  (2B-4T), DOS perfiles sobre los mismos pesos (mmap): `interactive` (chat/orbe) y `background`
  (`cognition`, `nice 15`). `real_mode: "bitnet-native"` ahora significa modelo cargado sirviendo.
- Parche CRÍTICO: `3rdparty/llama.cpp/src/models/bitnet.cpp` SILU→**RELU_SQR** (el 2B-4T usa ReLU²;
  con SiLU degeneraba: PPL 40.9 → **5.38** tras el parche). Guarda `scripts/check_bitnet_patch.sh`.
- Plantilla de chat oficial (`System:/User:/Assistant:` + `<|eot_id|>`) inyectada por el manager
  (la del GGUF está rota) + `--override-kv tokenizer.ggml.pre=str:llama-bpe`; presupuesto de
  contexto honesto (4096; recorte de system/prompt, ≥¼ para la respuesta); prioridad de turno
  (el fondo espera al chat). Diagnóstico de layouts: `scripts/repack_i2s_gguf.py` (verificó
  bit-a-bit contra los pesos bf16 de HF: layout strided32 correcto, coincidencia 98.8%).
- Verificación real: `scripts/verify_real_ola3.py` contra backend vivo (ver resultados en state.md).

**OS — HECHO (tsc 0):**
- Studio 1.58 completo (`astraura-158-panel.tsx` + `s158/*`): Resumen (procesos del puente +
  acciones), Personalidades, Agentes (Director+enjambre+bóveda+ecosistema), Imaginación (ciclos,
  ramas con `generated_by`, tronco dual, tipos de proceso con permisos, sueños, síntesis),
  Notificaciones (backend + orquestador de autorizaciones + eventos del puente + ramificación),
  Cerebros, Memoria (recuerdos/pinned/grafo/memory-root/mem0), Sentidos (sensorium + privacidad +
  air-gap), Almacenamiento (dispositivos/reglas/agente/malla), Proyectos (proyectos/creaciones/
  workflows), Voz (daemon + presencia por personalidad + VoiceStudio), Habilidades, Instalación.
  Deep-links `?sub=` + badges de contadores.
- `astraura-158-import.ts` (siembra idempotente de 10 personalidades `p158-*` y agentes
  `agent158-*` con primario 1.58 por ámbito) · `astraura-158-feed.ts` (sondeo 30 s del puente →
  centro de notificaciones + ack + siembra; montado en `app-globals`) ·
  `astraura-158-processes-card.tsx` (en la sección LLM de personalidad/neurona) ·
  `astraura-158-neuron-card.tsx` (en el panel de neuronas) · tira «Procesos 1.58» en la pestaña
  de notificaciones de Trinity · modal «Ver proceso» con sección «Ramificación y agentes 1.58».

### 14.6 Correcciones de diseño surgidas de la verificación REAL (2026-08-23)

Verificar de verdad (backend vivo + modelo real) destapó tres cosas que ninguna prueba
sintética habría visto, y las tres están corregidas:

1. **El motor «funcionaba» pero pensaba mal.** `3rdparty/llama.cpp` aplicaba `LLM_FFN_SILU`
   a la arquitectura `bitnet-b1.58`; el modelo 2B-4T usa **ReLU²**. Resultado: respuestas en
   bucle y PPL 40.9. Con el parche `LLM_FFN_RELU_SQR`: **PPL 5.38** y chat correcto.
   Antes de culpar a los pesos se verificó el layout I2_S bit a bit contra los pesos bf16 de
   HF (`scripts/repack_i2s_gguf.py`): 98.8% de coincidencia ⇒ los pesos estaban bien.
2. **Disparar un ciclo de imaginación bloqueaba la UI.** Un ciclo hace inferencia real
   (2 generaciones encoladas tras los procesos de fondo): minutos en CPU. Ahora
   `POST /api/starseed/processes/imagination/trigger` **programa el ciclo y responde en ~1 s**
   (`scheduled: true`); la rama llega por el feed de eventos. `?wait=1` conserva el modo
   bloqueante para scripts. El OS dispara por el puente y cae al endpoint clásico si no existe.
3. **El feed de eventos lo monopolizaba el enjambre.** Con corte por recencia pura, 34 tareas
   completadas tapaban imaginación, director y aprendizaje — justo las «notificaciones
   especiales» que el usuario quiere ver. Ahora hay **cuota por tipo de proceso** (round-robin
   de los más recientes + relleno por recencia), se emiten también las ramas ya resueltas
   (`Imaginado: …`, con `generated_by`) y las decisiones del Director, y el puente devuelve
   `unread_count` (alias que consumía el OS y que no existía: el badge habría quedado a 0).

### 14.7 Resultado de la verificación funcional REAL (backend vivo, BitNet nativo)

`cd backend && python3 scripts/verify_real_ola3.py` → **11/11 PASS en 601 s**:

| # | Comprobación | Resultado |
|---|---|---|
| 1 | Motor con modelo REAL | `bitnet-native` · ggml-model-i2_s.gguf · listo |
| 2 | Puente StarSeed | 1.1.0 |
| 3 | Chat `@Hermes @Logos` multi-personalidad | `branching_plan` + `agent_traces` + `multi_personality_start` + 3729 chars |
| 4 | Disparo de imaginación no bloqueante | 0.99 s · `scheduled: true` |
| 5 | Rama imaginada por el modelo | `generated_by: llm` (texto real, no plantilla) |
| 6 | Feed con TODOS los procesos | página `{imagination 6, swarm 11, learning 1, director 6}` de 79 |
| 7 | `ack` de eventos | 2 confirmados y desaparecen del feed |
| 8 | Procesos del puente | 8: engine · imagination · swarm · director · dream · auth · privacy · sync |
| 9 | `invoke` real de personalidad (clave con scope) | `generated_by: llm`, texto real de Logos |
| 10 | Air-gap soberano on/off | corta y restaura |
| 11 | Ciclo de supervisión del Director | ejecuta y enruta entregables a proyectos/cerebros |

Velocidad medida en el contenedor de verificación (2 núcleos x86): ~10 tok/s. En el M1 con
NEON el mismo binario va varias veces más rápido; los timeouts de `cognition` se adaptan solos
a la velocidad medida, así que el comportamiento es correcto en ambos.
