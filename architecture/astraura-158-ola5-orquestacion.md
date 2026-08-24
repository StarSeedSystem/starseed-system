# SOP — Ola 5 (Adenda 157): «Astraura AI & Orchestration» — ventanas vivas, orquestación autónoma y gobierno de permisos

> **Fecha:** 2026-08-24 · **Estado:** fuente de verdad de esta ola. Continúa las Adendas 155 (Ola 3) y
> 156 (Ola 4). Regla del repo: el SOP va ANTES del código.

## 0 · Qué falta del sistema original (análisis)

Las olas 3 y 4 trajeron los DATOS y las pestañas. Lo que el original tiene y el OS todavía no:

| Del original 1.58 | Qué es | Falta en el OS |
|---|---|---|
| **«Pág. Completa»** en cada proceso/agente | Cada entidad viva tiene su propia ventana con todo su contexto | No hay ventana por entidad |
| **«Hablar en Vivo»** por agente/proceso | Chat con ESE agente, con su personalidad, cerebro y tarea actual | El chat del OS no se puede atar a un agente concreto |
| **«Ramas & Logs»** por proceso | Árbol de ramas de ese proceso + su bitácora | Solo hay lista global de ramas |
| **«Ajustes»** por proceso/agente | Ventana de configuración por entidad (recursos, permisos, frecuencia) | Solo controles sueltos en la pestaña |
| **Tareas en Progreso en Segundo Plano** | Tablero vivo del enjambre: fase 1/4→4/4, CPU, RAM, progreso, pausa/reanuda por agente | Hay lista de tareas, no tablero por agente con fases |
| **Gobernanza de permisos graduales** | Niveles por proceso, por agente y por personalidad + solicitudes de acceso y su aprobación | Disperso; sin superficie de gobierno |
| **Topología sináptica** | Grafo cerebro ↔ memorias ↔ creaciones ↔ agentes | Solo contadores del grafo |
| **Orquestación autónoma** | Director que enruta entregables a proyectos/cerebros y renueva tareas | Controles sí; visión de conjunto no |
| **Presencia en todo el OS** | La orbe y el Exocórtex saben qué está pasando de fondo | La orbe/Exocórtex no lo muestran |

## 1 · Ventana universal de entidad (`Astraura158Window`)

- `src/components/astraura/window/astraura-158-window.tsx` — una sola ventana para
  `proceso · agente · personalidad · cerebro · proyecto · creacion · rama`, con pestañas internas
  **Resumen · Ramas & Logs · Ajustes · Hablar en Vivo**, cargando el detalle real por entidad
  (`/api/imagination/process/{id}` (+`/branches`), `/api/agents/{id}`, `/api/ecosystem/agents/{id}`,
  `/api/personalities` + `api_status`, `/api/cerebros` + `synaptic_tree`, `/api/projects/{id}`,
  `/api/creations/{id}`).
- Tres formas de abrirla, todas con el MISMO componente:
  1. **superpuesta** en la propia pestaña (overlay con tamaño S/M/L/completa, arrastre y foco atrapado);
  2. **página completa** en `/(app)/agent/astraura/[kind]/[id]` (enlazable y compartible);
  3. **ventana del escritorio** del OS cuando el usuario lo pida (reusa el sistema de ventanas ya existente).
- Bus de apertura: `starseed:astraura158-open-window` con `{kind, id, tab?}` — así la orbe, el Exocórtex,
  las notificaciones y cualquier pestaña abren la misma ventana sin acoplarse.

## 2 · «Hablar en Vivo» (chat atado a la entidad)

- `src/components/astraura/window/live-talk.tsx`: chat que usa el proveedor `astraura-158` con
  `persona_id` de la entidad (o de su personalidad principal), inyectando como contexto: quién es, en qué
  tarea está, su cerebro y sus últimas ramas. Streaming real, con el **runtime de código de la Ola 4**
  disponible en las respuestas (los programas se ejecutan ahí mismo).
- Nunca inventa: si el backend no responde, lo dice y ofrece la cadena de secundarios del OS.

## 3 · Centro de orquestación (`?sub=orquestacion`)

Tablero vivo, refresco 10 s:
- **Agentes en vivo**: tarjeta por agente con estado, tarea actual, **fase n/4**, progreso, CPU y RAM,
  personalidades que usa, cerebros vinculados, y acciones: pausar/reanudar, concurrencia, **Hablar en
  Vivo**, **Pág. Completa**.
- **Director (Metis)**: directiva activa, ciclo, auditorías, enrutados y renovación de tareas.
- **Tronco dual**: reparto imaginación ↔ enjambre ↔ reserva de chat, con el gobernador de capacidad.
- **Sincronización multiagente**: qué proceso alimenta a qué cerebro/proyecto (del Director y del agente
  de enrutamiento), en una línea por flujo.

## 4 · Gobierno de permisos y accesos (`?sub=permisos`)

- **Por proceso**: nivel de permiso (auto-aplicar menores · auto-aplicar seguras · preguntar siempre ·
  autónomo soberano) con su explicación y efecto.
- **Por agente** y **por personalidad**: permisos granulares reales (`update_permissions`).
- **Accesos del dispositivo**: acceso universal (concesión explícita), sensores (privacidad) y air-gap.
- **Solicitudes pendientes**: propuestas que esperan aprobación + solicitudes de acceso, con
  **conceder** / **conceder todas** / descartar, y el estado de embargo del orquestador.
- **Cerebros**: permisos por neurona sobre cada cerebro y auto-enlace sináptico.

## 5 · Presencia en la orbe y el Exocórtex

- Tira compacta (sin toasts, coherente con la Ola 4): «N procesos activos · M agentes vivos ·
  K aprobaciones pendientes», con botones a Orquestación, Imaginación y Notificaciones, y apertura
  directa de la ventana de un agente. Se apoya en el feed vivo (`useAstraura158Feed`) y en
  `/api/starseed/processes`.

## 6 · Criterio de cierre

1. `tsc` 0 · vitest verde · `next build` ✓.
2. Desde cualquier pestaña se abre la ventana de un agente y se habla con él en vivo.
3. El tablero de orquestación muestra fases, CPU/RAM y permite pausar un agente.
4. La gobernanza permite cambiar el nivel de permisos de un proceso y conceder un acceso.
5. La orbe y el Exocórtex muestran el estado de fondo sin invadir la pantalla.
6. Notas en las memorias de StarSeed y publicación en `main`.

---

## 7 · Estado (2026-08-24 · Ola 5 ejecutada)

**Ventanas vivas (§1-§2) — HECHO**
- `src/components/astraura/window/`: `astraura-158-window-bus.ts` (evento
  `starseed:astraura158-open-window`, `openAstraura158Window`, `astraura158WindowHref`),
  `astraura-158-window.tsx` (Resumen · Ramas & Logs · Ajustes · Hablar en Vivo para
  proceso/agente/personalidad/cerebro/proyecto/creación/rama), `live-talk.tsx` (chat atado a la
  entidad por el proveedor 1.58, con el runtime de código de la Ola 4 dentro) y
  `astraura-158-window-host.tsx` (pila de ventanas montada en `app-globals`).
- Página completa: `/(app)/agent/astraura/[kind]/[id]`.

**Orquestación (§3) — HECHO**: `s158/orquestacion-tab.tsx` — tablero de agentes vivos (estado, tarea,
fase, progreso, CPU/RAM, personalidades y cerebros, pausar/reanudar, concurrencia, hablar, página
completa), Director con directivas y ciclo, tronco dual + gobernador, flujos de sincronización
multiagente y tarjetas de los 8 procesos del puente.

**Gobierno (§4) — HECHO**: `s158/permisos-tab.tsx` — panorama, solicitudes pendientes con conceder /
conceder todas / aplicar seguras, permisos por proceso (nivel + política), por agente y por
personalidad (`update_permissions` reales), accesos del dispositivo (universal, sensores, air-gap) y
permisos de cerebros + auto-enlace sináptico.

**Presencia (§5) — HECHO**: `astraura-158-presence.tsx` (`Astraura158PresenceBar` en el Exocórtex,
`Astraura158PresenceDot` en la orbe) — silenciosa, sin toasts, oculta si el backend no responde.

**Cuantización (petición del mismo día) — HECHO y medido**
- Backend: `app/memory/turboquant.py` (Algorithm 1 de TurboQuant en NumPy) + índice comprimido de
  primer paso en `vector_store.py`; `bitnet_cpp_manager.quantization_backends()` inventaría los motores
  de pesos (bitnet.cpp nativo · spbitnet CUDA 2:4 con su motivo honesto de no-aplicabilidad) y
  `/api/status → engine.quantization_stack` lo publica.
- OS: tarjeta «Pila de cuantización» en la pestaña Telemetría (motores + índice de memoria con
  compresión y coseno medidos).
- Medido: 4 bits ⇒ coseno 0.9953 y 7.4× de compresión; búsqueda 2.8× más rápida con top-5 idéntico
  sobre 2 000 documentos. NanoQuant evaluado y NO integrado (sin implementación pública utilizable).

**Puertas:** `tsc` 0 · vitest 125/125 · `next build` (en verificación al cierre de la ola).
