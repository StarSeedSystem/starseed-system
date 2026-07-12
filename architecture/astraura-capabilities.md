# 🧩 Astraura · Capacidades de Aurora (contrato unificado OS · Nexus · Café)

> **Fuente de verdad** de cómo las *skills* instaladas desde la Biblioteca dejan de
> ser un catálogo decorativo y se convierten en **capacidad viva**: Aurora las
> **ejecuta** inyectando instrucciones en su cerebro (system prompt) y **sesgando el
> routing** de Astraura (modelo fuerte / web / visión / planificación). Igual en los
> tres sistemas, sincronizado **desde la misma cuenta** y con **modo invitado** local.

## Vocabulario de capacidades (fijo, compartido)

`prefs.capabilities: string[]` en `user_settings.prefs` (Supabase del OS
**`nxstilnyidvkqeosofuh`** — ⚠️ corregido 2026-07-12: `dzkjapinnewkxzjltadv` es
el proyecto de Nexus/Café, con cuentas separadas). Espejo local para invitados: `localStorage["starseed.capabilities.v1"]`.

| id | Disparadores (skill/paquete) | systemPrompt (resumen) | routing bias |
|---|---|---|---|
| `taste` | aurora-taste / iatool-taste-skill | criterio de diseño de alto nivel al generar UI/contenido | preferStrong |
| `pm` | aurora-pm / iatool-pm-skills | descomponer en objetivo·alcance·riesgos·pasos accionables | preferStrong, planning |
| `web-senses` | aurora-web-senses / iatool-agent-reach | sentidos web: razonar sobre enlaces X/Reddit/YouTube/web, pedir URL | web |
| `research` | iatool-open-notebook | modo investigación: hechos vs inferencias, citar origen, notas | preferStrong |
| `vision` | aurora-vision | interpretar imágenes que comparte el usuario | vision |
| `voice` | aurora-voice-kokoro | voz de mayor calidad (Kokoro) cuando esté disponible | — |
| `voice-neural` | aurora-voice-bark / aurora-voice-sovits / aurora-voice-omnivoice (iatool-bark / iatool-gpt-sovits / iatool-omnivoice) | voz neural por ENDPOINT (Bark expresivo · SoVITS clonación · OmniVoice multilingüe); Aurora sabe cambiar motor/estilo con sus tools de voz (`ajustar_voz`/`cambiar_motor_voz`/`estado_voz`) y que el fallback la mantiene hablando | — |
| `web-access` | aurora-web-access / iatool-crawl4ai / deepcrawl / webharvest / universal-scraper / scrapling | acceso web auto-seleccionado (gratis/local primero) | web |
| `model-discovery` | iatool-hugging-bay-registry | recomendar modelos reales vía Hugging Bay | — |
| `app-builder` | iatool-dyad | constructor local de apps (scaffold sin lock-in) | preferStrong |
| `agent-recipes` | iatool-goose | patrón "recipe" reutilizable para Agentes | planning |
| `deep-research` | iatool-deerflow | investigación profunda con informe/deck/web | preferStrong |
| `sandbox-exec` | iatool-daytona | recomendar sandbox aislado antes de ejecutar código | — |
| `multi-agent-code` | iatool-parallel-code | despachar agentes de código en worktrees paralelos | preferStrong, planning |
| `web-scraping-adaptativa` | iatool-scrapling | motor de scraping adaptativo/stealth adicional | web |
| `router-proxy` | iatool-9router | proxy local 9Router como fuente si está corriendo | — |
| `design-import` | iatool-website-cloner | extraer tokens de diseño de una web de referencia | preferStrong |
| `rag-knowledge` | iatool-ragflow | RAG con citas verificables sobre documentos propios | preferStrong |
| `voice-realtime` | iatool-pipecat | patrón de voz conversacional en tiempo real | — |
| `self-hosting-deploy` | iatool-coolify | PaaS self-host para desplegar apps/BD en tu propio servidor | — |
| `dev-agent` | iatool-openhands | agente de desarrollo autónomo (escribe/ejecuta/navega) | preferStrong, planning |
| `web-robots` | iatool-maxun | motor de scraping no-code adicional (robots monitorizan sitios) | web |
| `local-llm-ui` | iatool-open-webui | interfaz de chat self-hosted para cerebros locales (Ollama) | — |
| `agent-browsing` | iatool-browser-use | agente que usa el navegador como humano (self-host) | web |
| `flow-builder` | iatool-langflow | constructor visual de flujos/agentes LLM (drag&drop) | planning |
| `pdf-tools` | iatool-stirling-pdf | herramientas PDF self-hosted (unir/dividir/OCR/firmar) | — |
| `llm-apps-platform` | iatool-dify | plataforma LLM completa (agentes+workflows+RAG+observabilidad) | preferStrong |
| `bookmarks-ai` | iatool-karakeep | Marcadores con IA: guardar enlace/nota/imagen con etiquetado y búsqueda | — |
| `local-objects` | iatool-anytype | objetos/notas local-first cifrados, sync P2P sin servidor central | — |
| `audio-library` | iatool-audiobookshelf | biblioteca de audiolibros/podcasts (conector real de solo lectura) | — |
| `home-automation` | iatool-home-assistant | domótica local (conector real de SOLO LECTURA sobre dispositivos) | — |
| `p2p-sync` | iatool-syncthing | sincronización de archivos P2P sin servidor central | — |
| `aurora-avatar` | iatool-open-llm-vtuber | referencia de avatar con voz en tiempo real (ver §18 del OS) | — |
| `data-science-fasta` | iatool-altair | ciencia de datos: comparación FASTA alignment-free | — |
| `photo-backup` | iatool-immich | fotos/vídeos self-host con ML (conector real de SOLO LECTURA v1: álbumes/recientes) | — |
| `ai-search` | iatool-perplexica | búsqueda IA con citas (Perplexica, renombrado "Vane"; conector real) | web |
| `flow-automation` | iatool-flowise | chatflows/agentes visuales sobre LangChain (conector real; complementa a `flow-builder`) | planning |
| `rag-workspace` | iatool-anything-llm | workspace RAG todo-en-uno (conector real, chat con tus documentos) | preferStrong |
| `local-ai-notes` | iatool-reor | notas locales con IA y grafo (sin conector: sin API pública hoy) | — |

Detalle completo de las 10 capacidades del "stack OSS por defecto" (jul-2026):
`architecture/astraura-inteligencia.md` §15. Ocho capacidades más (infraestructura
soberana y flujos visuales, jul-2026): `architecture/astraura-inteligencia.md` §16.
Siete capacidades más (Marcadores, conocimiento, IoT y ciencia, jul-2026):
`architecture/astraura-inteligencia.md` §19. Cinco capacidades más (Galería/
Immich + IA-Agentes: Perplexica, Flowise, AnythingLLM, Reor, jul-2026):
`architecture/astraura-inteligencia.md` §21.

## Cómo lo consume cada sistema

1. **Detectar activas** — unión de skills instaladas (`starseed.library.functions.v1`)
   y paquetes instalados (`starseed.library.installed.v1`) mapeados al vocabulario,
   MÁS lo que llegue de la cuenta (`prefs.capabilities`). Unión, nunca resta.
2. **Inyectar en el cerebro** — antes de llamar al modelo, se antepone/mezcla un
   bloque de system prompt: `"Capacidades activas de Aurora:\n• …"`.
3. **Sesgar el routing** — `preferStrong`/`planning` suben la dificultad estimada
   (RouteLLM → modelo más capaz); `web`/`vision` marcan la intención de tarea.
4. **Sincronizar** — al instalar/desinstalar, se recomputa `prefs.capabilities` y se
   sube (merge no destructivo). Al iniciar sesión / cambiar de cuenta, se baja y se
   fusiona. Sin sesión: solo localStorage (invitado). Local siempre es la verdad
   offline; la nube solo enriquece.

## Implementación por sistema

- **OS:** `src/ai/astraura/skills.ts` (manifiesto + `skillsSystemPrompt()` +
  `skillsRoutingBias()` + `activeCapabilityIds()`), consumido en `astrauraChat()`
  (`router.ts`); sync en `library-sync.ts` (añade `prefs.capabilities`). Nombre
  `skills.ts` para NO colisionar con `src/lib/aurora/capabilities.ts` (capacidades
  de dispositivo/voz, concepto distinto).
- **Nexus / Café:** `astraura-core.js` gana `SKILL_CAPS`, `capsSystemPrompt()`,
  `capsBias()` leídas por `brain()`; `astraura-install.js` gana las skills con
  recomendadas pre-instaladas; sync por cuenta reutilizando el lector de
  `user_settings.prefs` que ya usan para `intelligence.v1`. ⚠️ Pendiente portar
  las 10 capacidades del stack OSS por defecto (jul-2026 · §astraura-inteligencia
  §15.5): quedan solo en el OS hasta que se actualicen esos repos.

*Adenda 68 · 2026-07-05. Adenda "Stack OSS por defecto" · 2026-07-07. Adenda
"Infraestructura soberana y flujos visuales" · 2026-07-07. Adenda "Segunda ola:
productividad y ciencia" (Marcadores/IoT/audio/P2P/avatar/ciencia) · 2026-07-07.
Adenda "Tercera ola: galería y agentes" (Immich/Perplexica-Vane/Flowise/
AnythingLLM/Reor — primer conector real en la Galería) · 2026-07-07.*
