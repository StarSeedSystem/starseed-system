# Spec — Imaginación Intuitiva 1.58b · contrato versionado

> **Por qué existe.** La pantalla «Imaginación Intuitiva (Always-On)» del OS (`/imaginacion`,
> embebida en `/agent?tab=imaginacion`) reconstruye con paridad funcional el
> `IntuitiveImaginationView.jsx` del Astraura 1.58-bit original (repo `StarSeedSystem/astraura`).
> Su spec técnica (~2870 líneas) vivía en `/tmp/imagination-spec.md`, ruta efímera que moría al
> reiniciar: contrato implícito y sin versionar (hallazgo SA092925 del 2026-09-29; versionado por
> la tarea SP092935). El texto original NO se conservó: se fija el contrato tal como lo implementó
> la Ola 6 y lo citan los componentes de `src/components/astraura/imaginacion/`. **Los epígrafes
> §1–§11 son los que cita el código y §12 recoge las mejoras propias del OS: no se renumeran
> (§9 no lo cita ningún componente; el hueco se conserva).** SOP de la ola:
> `astraura-158-ola6-menu-imaginacion-orbe.md` §3 (sondeo short-polling HTTP, sin WebSocket, como el original).

## §1 · Cabecera (citas: §1.2.1 · §1.2.4 · §1.2.6 · §1.6)

- Botones maestros: Director, Informe de Síntesis, ubicación calibrable del Sensorium,
  Acceso Universal (aviso: no reconstruido), Always-On y «Disparar Síntesis».
- **§1.2.1** Countdown «Próxima Síntesis»: se pinta SOLO con `next_cycle_formatted` del
  sondeo; nunca hay temporizador local que descuente (mentiría sobre el backend).
- **§1.2.4** `environment_context` no está tipado en `Astraura158ImaginationStatus`:
  lectura defensiva de `location.city`/`country`; la calibración escribe en el backend
  (`setAstraura158Location`) y localStorage queda como caché de la etiqueta.
- **§1.2.6** El botón de cabecera SIEMPRE dispara el id fijo `rem_synaptic_consolidation`.
- **§1.6** Director (Metis): 4 métricas + 4 pestañas (Gobernanza · Cola de Agentes ·
  Bóveda de Memorias · Auditorías); estado desde el sondeo del padre (badge y modal, una
  sola fuente); `swarm/status` solo con esa pestaña visible. Bóveda: solo lectura.

## §2 · Carga de datos y Gobernador de Recursos

- `loadData` trae EN PARALELO status · catálogo · tronco dual · agentes · Director.
  **`status.dual_trunk` gana** al fetch directo: en el original se aplica DESPUÉS.
- Gobernador de Recursos (bloque entre cabecera y sub-pestañas): pinta `dualTrunk`
  TAL CUAL — **sin normalizar a 100 %** —; reserva de chat y núcleos son de solo
  lectura (los recalcula el backend, que devuelve el objeto COMPLETO tras escribir).
- Sliders Tronco A/B con **debounce de 400 ms** (mejora Ola 6; el original: un `POST` por píxel).

## §3 · Las 5 sub-pestañas y la semilla temática (citas: §3.1 · §3.2 · §3.2.1)

- 5 sub-pestañas con contadores: Procesos Oníricos & Niveladores · Agentes & Imaginación
  en 2do Plano · Ramas & Propuestas (corta a 12 con «Ver todas» y avisa del freno
  `is_paused_due_to_threshold`) · Creaciones Proactivas · Permisos & Configuración.
- **§3.1** Un único `customTheme` compartido por cabecera, tarjeta y modal Director;
  viaja como `theme` opcional en cada disparo.
- **§3.2** Tarjeta de agente: interruptor de imaginación, permiso de ensueño, tronco,
  cuotas CPU/RAM e insignias (`is_custom`, `linked_cerebros`, `interconnections`).
- **§3.2.1** `AgentEditorModal`/`AgentApiManagerModal`: externos y fuera de alcance
  (lo marca la propia spec); sus entradas enlazan al Studio 1.58.

## §4 · Iconografía del catálogo

6 iconos (`Moon` · `Sparkles` · `Wand2` · `Code2` · `Compass` · `Layers`; cualquier otro
cae a `Sparkles`). Nombre/descripción/categoría/icono/color: 100 % del backend
(`process_types_catalog`); el cliente nunca los fija.

## §5 · Tarjeta de proceso (§5, puntos 2 · 5 · 6)

- 3 contenedores según `pt.status` (running/paused/defecto) · Punto 2: badge de
  actividad con 3 estados (Ejecutando con ping · Pausado · Activo).
- Punto 5: propuestas acumuladas contra `max_proposals_per_agent_limit ?? 4` (vive en
  el estado central del padre) con **auto-pausa** al llegar al límite.
- Punto 6: badge «Modo Permisos» colapsa los 4 niveles en 3 textos (Autónomo ·
  Supervisado · Auto-Seguro).
- Slider de Tronco A y 4 acciones: Ramas & Logs (§6.A) · Ajustes (detalle completo
  §1.6/§6 en la propia tarjeta) · Pausar/Reanudar · Disparar.

## §5.3 · Los 4 niveles de permiso y sus tres juegos de etiquetas

`auto_apply_safe` · `auto_apply_minor` · `always_ask` · `autonomous_sovereign`, **tres juegos
de etiquetas literales** por contexto (proceso · agente · config global); se replican tal
cual: cambiarlas rompe la paridad.

## §6.A · «Ramas & Logs» de un proceso · §6.B fuera de alcance

- §6.A (`ProcessBranchesModal.jsx`): cada disparo genera una rama (hipótesis →
  insights) y «Bifurcar» crea sub-rama. 5 sub-pestañas (En Progreso · Comparador de
  Mejoras & Diff AST · Historial · Completadas · Todas); en vivo cada 3 s SOLO con el
  modal abierto y «En Vivo» encendido. Por rama: Regenerar · Bifurcar · Editar · Eliminar.
- §6.B: `ParallelAgentBranchingTree`/`ProcessBranchingFullViewModal` (ramificación de
  CHAT, `ChatInterface.jsx`): otro sistema que NO cuelga de esta pantalla.

## §7 · Autorizaciones (§7.3) · Aplicación sincronizada (§7.5) · Edición (§7.6)

- **§7.3** Orquestador Inteligente de Autorizaciones (`[INFERIDO-CRUZADO]` de
  `NotificationsLogsView.jsx`): badges Procesando/En espera · MODO DRENAJE (cola >
  `max_balanced_queue`) · EMBARGO · auto-orquestación; sondeo 5 s con su panel visible.
- **§7.5** Aplicación sincronizada multi-agente: modal de progreso de
  `applyAllAstraura158Proposals`, 6 sub-agentes FIJOS en el cliente (nombres/colores NO
  vienen del backend), progreso por `agent_progress[key].tasks`; sondeo 2 s con el modal abierto.
- **§7.6** Modal genérico «Editar»: propuesta (tema/hipótesis) y creación (título/contenido).

## §8 · Informe de Síntesis del Usuario

`SynthesisReportModal.jsx`: el cronista (Hermes-Chronicler / Mnemosyne) resume el ciclo
en lenguaje llano. 2 columnas: historial + 5 pestañas (Resumen Ejecutivo · Agentes &
Para Qué · Completados & Próximos · Lo Nuevo/Modificado/Mejoras · Comparativa). Se abre
SIN `initialReportId` (auto-selecciona `res.latest`), exporta a Markdown y no sondea.

## §10 · Sondeo: todas las reglas juntas

| Qué | Cada | Condición |
|---|---|---|
| Estado global (status · tipos · tronco · agentes · Director) | 5 s | pausado si `document.hidden` |
| Ramas del proceso | 3 s | solo modal «Ramas & Logs» + «En Vivo» |
| Aplicación sincronizada | 2 s | solo con su modal abierto |
| Informe de síntesis | nunca | se trae al abrir y al pedir |
| Enjambre (`swarm/status`) y autorizaciones | 5 s | solo con su pestaña/panel visible |

## §11 · Sustituciones que la propia spec recomendaba

`window.dispatchEvent(new CustomEvent('open-file-viewer', …))` → callback `onOpenFile`
(sin visor de archivos soberano aquí, se informa por toast). En el OS además (Adenda
137): `window.confirm`/`prompt` → `useConfirm`/`usePrompt` accesibles del OS.

## §12 · Mejoras propias del OS y mapa de archivos

Debounce 400 ms en el gobernador · insignia `generated_by` por rama (llm real vs plantilla;
el original nunca la pintaba) · procedencia por proceso (`process-provenance.ts`) · destino
local/nube por `useAstraura158Host` con «sin conexión» honesto (`S158EndpointStrip`) ·
**nunca datos inventados si el backend no responde**. Mapa fichero → qué reconstruye: §3 del
SOP de la Ola 6. Red: todo sale de `astraura-158-client.ts` (contratos §5.1).
