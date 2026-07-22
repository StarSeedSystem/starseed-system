# StarSeed OS · Mejora de los 3 Agentes Principales (Astraura · Council · MoA)

> Entregable de la sesión "las 3 con múltiples agentes OpenRouter y más subagentes".
> Fecha: 2026-07-21. Autor: Hermes (análisis multi-subagente + implementación).

## Resumen ejecutivo

Se analizaron en paralelo los 3 agentes principales del OS mediante 3 subagentes
especializados (uno por agente) que leyeron el código real (`router.ts` 1149 líneas,
`council.ts` 618, `moa/runtime.ts` 729, `free-catalog.ts` 934, el proxy `/api/ai/openrouter`).
De sus hallazgos **convergentes** se implementó:

1. **Pegamento que faltaba**: el proxy comunitario OpenRouter (`:free`, clave en
   servidor, coste 0) ya EXISTÍA en el OS, pero `openrouter-free` del catálogo
   apuntaba a `openrouter.ai` directo (requería clave). Se reconectó al proxy →
   **todo el OS** usa ahora los `:free` sin clave del cliente.
2. **Primitiva de subagentes multi-modelo** (`src/lib/aurora/subagents.ts`):
   ejecuta N subagentes EN PARALELO contra modelos `:free` distintos vía el proxy,
   con `Promise.allSettled`, rotación de modelos, observabilidad y degradación
   honesta. Reusa `chat()` → hereda streaming/abort/errores.
3. **3 módulos orquestadores** que consumen la primitiva:
   - `astraura/astraura-multi.ts` — modo multi-agente de contraste (Astraura descompone
     y delega a subagentes de crítica/ampliación/edición que corren en `:free` distintos).
   - `lib/aurora/council-multi.ts` — Consejo con subagentes por perspectiva StarSeed
     (etapas: opiniones paralelas → revisores anonimizados → síntesis Chairman).
   - `lib/aurora/moa-multi.ts` — MoA con capas de modelos `:free` en paralelo y modo
     `crew` que descompone la tarea en subagentes con roles.

Todos los módulos respetan el **SAFETY CONTRACT** existente: nunca lanzan, degradan
al path single si falla el proxy, y no introducen coste (solo `:free`).

## Hallazgos de los subagentes (resumen)

**Astraura (task-0):** el proxy comunitario existía pero el router no lo usaba →
`openrouter-free` se llamaba sin clave a openrouter.ai y se perdían los 20 modelos
`:free`. → CORREGIDO (ver arriba).
**Council (task-1):** el Consejo NO garantizaba `:free` (filtraba `tier!=="paid"` pero
podía traer modelos de pago del usuario) y su anonimización era falsa (el dictamen
delataba la perspectiva). → `council-multi.ts` fuerza `:free` por subagente y anonimiza
de verdad en la etapa de revisión.
**MoA (task-2):** MoA orquesta *proveedores* (cada uno con UN `defaultModel`), no
múltiples `:free` por capa. → `moa-multi.ts` orquesta N `:free` por capa vía la primitiva,
rompiendo esa limitación.

## Recomendaciones profesionales de perfeccionamiento (todos los sistemas del OS)

### A. Inteligencia (Astraura / Council / MoA)
1. **Clave compartida en producción**: definir `OPENROUTER_SHARED_KEY` (y `_2`,`_3` para
   rotación ×50→×N req/día) en Vercel. Sin ella, el `:free` multi-agente degrada a failover
   local — funciona, pero sin la capa gratuita comunitaria.
2. **Cache semántico de respuestas** (pendiente): un hash de `(modelo, mensajes, temp)`
   → KV (Supabase/IndexedDB) para no repetir inferencias idénticas. Ahorra cuota `:free`.
3. **Ratelimit client-side por modelo**: el `:free` de OpenRouter es ~20 req/min por clave;
   un semáforo en `subagents.ts` evitaría ráfagas 429 masivas en el multi-agente.
4. **Telemetría de contribución**: ya devolvemos `{model, ok}` por subagente; persistirlo
   en `usage.ts` para que el usuario vea "quién respondió qué" en el panel de Inteligencia.

### B. Robustez del router
5. **Health-check del proxy**: `isOpenRouterFreeAvailable()` existe; wirearlo a
   `detectAvailabilitySafe()` para que `openrouter-free` aparezca como `ready` solo si el
   proxy 200/503-honesto, evitando intentos muertos en cada turno.
6. **Backoff exponencial** ya presente en `usage.ts`; extenderlo al multi-agente (retry 1×
   por subagente caído con modelo rotado).

### C. Consejo y gobernanza (Council)
7. **Perspectivas dinámicas**: hoy las perspectivas StarSeed son fijas; permitir que la
   comunidad proponga/consejeros vía la misma lógica de skills de la Biblioteca.
8. **Voto ponderado por consenso**: la síntesis Chairman puede usar el ranking de la etapa
   2 para resaltar el dictamen mayoritario en la UI.

### D. MoA
9. **Agregador dedicado**: cuando `perLayer>=3`, reservar el último modelo `:free` como
   agregador puro (no proposer) — patrón ya documentado en `runtime.ts`, aplicable aquí.
10. **Streaming del multi-agente**: hoy `moa-multi` devuelve texto completo; para voz en
    tiempo real, exponer `onChunk` reenviando el del agregador.

### E. Plataforma / despliegue
11. **No romper `standalone`**: el build usa `output:'standalone'` para el Docker de Vercel;
    cualquier cambio en rutas API (`/api/ai/openrouter`) debe mantener el traceo de archivos.
12. **Tests de integración del proxy**: añadir un test que POSTee un `:free` y verifique el
    400 si el modelo NO es `:free` (la regla de seguridad más importante).

## Estado de verificación
- Build: en curso (árbitro final). Los 4 módulos nuevos + el cambio de `baseUrl` deben
  compilar sin errores de tipos.
- No se ha hecho commit/push todavía (pendiente de confirmar build verde + tu visto bueno,
  dado que el tema previo #310 sigue abierto en el repo local).
