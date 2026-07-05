# 🧩 Astraura · Capacidades de Aurora (contrato unificado OS · Nexus · Café)

> **Fuente de verdad** de cómo las *skills* instaladas desde la Biblioteca dejan de
> ser un catálogo decorativo y se convierten en **capacidad viva**: Aurora las
> **ejecuta** inyectando instrucciones en su cerebro (system prompt) y **sesgando el
> routing** de Astraura (modelo fuerte / web / visión / planificación). Igual en los
> tres sistemas, sincronizado **desde la misma cuenta** y con **modo invitado** local.

## Vocabulario de capacidades (fijo, compartido)

`prefs.capabilities: string[]` en `user_settings.prefs` (Supabase soberano
`dzkjapinnewkxzjltadv`). Espejo local para invitados: `localStorage["starseed.capabilities.v1"]`.

| id | Disparadores (skill/paquete) | systemPrompt (resumen) | routing bias |
|---|---|---|---|
| `taste` | aurora-taste / iatool-taste-skill | criterio de diseño de alto nivel al generar UI/contenido | preferStrong |
| `pm` | aurora-pm / iatool-pm-skills | descomponer en objetivo·alcance·riesgos·pasos accionables | preferStrong, planning |
| `web-senses` | aurora-web-senses / iatool-agent-reach | sentidos web: razonar sobre enlaces X/Reddit/YouTube/web, pedir URL | web |
| `research` | iatool-open-notebook | modo investigación: hechos vs inferencias, citar origen, notas | preferStrong |
| `vision` | aurora-vision | interpretar imágenes que comparte el usuario | vision |
| `voice` | aurora-voice-kokoro | voz de mayor calidad (Kokoro) cuando esté disponible | — |

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
  `user_settings.prefs` que ya usan para `intelligence.v1`.

*Adenda 68 · 2026-07-05.*
