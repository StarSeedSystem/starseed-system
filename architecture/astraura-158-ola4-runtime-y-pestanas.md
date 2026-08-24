# SOP — Ola 4 (Adenda 156): runtime de código en el chat, notificaciones de IA propias y rediseño de TODAS las pestañas 1.58

> **Fecha:** 2026-08-24 · **Estado:** fuente de verdad de esta ola.
> Continúa la Adenda 155 (Ola 3). Regla dorada del repo: este SOP va ANTES del código.

## 0 · Qué pidió el usuario (literal, resumido)

1. **Los programas con código generados en CUALQUIER chat deben ser funcionales desde el mismo chat**:
   ejecutar o cerrar, abrir en ventana o pestaña nueva, cambiar el tamaño de la ventana, definir el
   **modo de uso** del código, **ver el código y la consola**, todo dentro del chat; soporte para
   **múltiples herramientas en una sola experiencia**; disponible en la sección Astraura IA, en la
   **orbe flotante**, en el **Exocórtex** y en cualquier entorno del OS; **personalizable desde el
   propio código de la página y del sistema**.
2. **Las notificaciones de la IA van a una pestaña especial** (como en Astraura 1.58 original), con
   todas sus funciones/opciones/configuraciones, con el diseño del OS, dentro de la sección Astraura IA.
   **No deben aparecer sobre la pantalla** (nada de toasts) **ni mezclarse con otras notificaciones**:
   ahí SOLO van las de la IA, los procesos automáticos/imaginativos/intuitivos y las solicitudes de
   tareas y procesos de la IA.
3. **Rediseñar TODAS las pestañas** del OS a partir de las 21 del sistema original 1.58, incluidos el
   Exocórtex y la orbe, analizando cada función, configuración, opción e interconexión, mejoradas y
   funcionando automáticamente con el sistema 1.58, interconectadas con agentes autónomos, procesos
   imaginativos/intuitivos, personalidades, memorias, cerebros, proyectos, sensorium, enrutamiento de
   almacenamiento y servidores dinámicos.
4. **Anotar tareas y progreso en las memorias de StarSeed** (memory root + `memory/`).

## 1 · Runtime de código en el chat (`code-runtime`)

### 1.1 Dónde vive
- `src/lib/aurora/code-runtime.ts` — capa PURA (sin React, SSR-safe): clasificación del bloque,
  directivas del fence, construcción del documento sandbox y del puente de consola.
- `src/components/aurora/code-runner.tsx` — la tarjeta ejecutable (UI).
- Enganche ÚNICO en `src/components/aurora/message-renderer.tsx` → `CodeBlock`: como ese renderizador
  lo usan TODOS los chats (orbe, Exocórtex, `/agent`, consejo, Astraura IA), la capacidad aparece en
  todas las superficies sin duplicar código.

### 1.2 Qué se puede ejecutar (honesto)
| Lenguaje del fence | Modo | Cómo corre |
|---|---|---|
| `html`, `svg` | **página** | `srcdoc` en iframe `sandbox="allow-scripts allow-modals allow-popups"` (origen opaco: no toca la sesión del OS). |
| `js`, `javascript`, `mjs` | **script** | Envuelto en una página mínima con consola puenteada. |
| `css` | **estilo** | Página de demostración con el CSS aplicado a una muestra tipográfica. |
| `glsl`, `shader`, `frag` | **shader** | Boilerplate WebGL 2.0 (quad a pantalla completa, `u_time`, `u_resolution`, `u_mouse`). |
| `jsx`, `tsx`, `react` | **react** | React + ReactDOM + Babel standalone desde CDN (ya permitido por la CSP del repo). |
| `py`, `python`, `sh`, `bash` | **backend** | NO se ejecuta en el navegador: se ofrece enviarlo al backend soberano 1.58 (Terminal & Sandbox) **solo** si la neurona lo permite; si no, se dice claramente y se ofrece copiar/descargar. |
| `json`, `md`, otros | **inerte** | Se mantiene el bloque de siempre (visor JSON plegable, copiar). |

### 1.3 Controles (todos pedidos por el usuario)
- **Ejecutar / Detener / Cerrar** (cerrar deja el bloque de código plano).
- **Modo de uso**: `vista` · `código` · `dividido` · `consola` (el modo por defecto se puede fijar por
  neurona y por bloque).
- **Tamaño**: `S` (240 px) · `M` (400) · `L` (620) · `pantalla completa` (overlay del OS) + arrastre del
  borde inferior para altura libre.
- **Abrir en ventana nueva** (`window.open` con el documento como Blob) y **en pestaña nueva** del OS
  (ruta `/sandbox?src=<id>` con el documento en `sessionStorage`, para no perder la CSP del OS).
- **Consola** integrada: `log/info/warn/error`, errores no capturados y `unhandledrejection`, con
  contador, filtro por nivel y botón de limpiar. Puente por `postMessage` (el iframe no tiene
  `allow-same-origin`, así que no puede leer nada del OS).
- **Copiar**, **descargar** (`.html`/`.js`/…), **guardar en Proyectos** (Bóveda 1.58 si hay backend, o
  la Biblioteca del OS si no).

### 1.4 Personalizable «desde el propio código de la página y del sistema»
- **Directivas en el fence** (el modelo o el usuario las escriben en el propio bloque):
  ```
  ```html run autorun height=520 mode=split title="Panel de sensores" tools=console,save
  ```
  Se aceptan `run` · `autorun` · `norun` · `mode=vista|codigo|dividido|consola` · `height=<px>` ·
  `size=s|m|l|full` · `title="…"` · `tools=…` (lista de herramientas a mostrar).
- **Directiva en la primera línea del código** (`// @starseed run mode=split height=480`) para lenguajes
  donde el fence lo pone la app y no el autor.
- **Preferencias del sistema** (`starseed.aurora.code-runtime.v1`, sincronizada con la cuenta):
  autorun global, modo y tamaño por defecto, mostrar consola siempre, permitir CDNs, permitir envío al
  backend soberano. Editables en la nueva pestaña **Configuración & Preferencias** del Studio 1.58.

### 1.5 Seguridad (no negociable)
- iframe **sin** `allow-same-origin` → origen opaco: no hay acceso a cookies, `localStorage` ni DOM del OS.
- Nada se ejecuta solo salvo que el usuario active `autorun` (por bloque o global); por defecto hay que
  pulsar **Ejecutar**.
- El envío a la terminal del backend soberano exige neurona propia + confirmación explícita; el proxy
  del OS sigue SIN exponer rutas de ejecución (allowlist intacta).

## 2 · Notificaciones de la IA — pestaña propia (`sub=notificaciones`)

- **Único destino**: el feed 1.58 **deja de escribir** en el centro de notificaciones del OS y **deja de
  emitir toasts**; se elimina la tira 1.58 de la pestaña de avisos de Trinity. `astraura-158-feed.ts`
  pasa a ser un **almacén vivo** (estado + evento `starseed:astraura158-events`) que alimenta:
  el **badge** de la sección Astraura IA y la pestaña de notificaciones.
- **Contenido y funciones** (paridad con el original + diseño del OS):
  filtros por categoría (Todas · Solicitudes de autorización · Imaginación & Sueños · Sensores & Clima ·
  Hardware & M1 · Red & Almacenamiento), **Autorizar y Aplicar Todas**, **Marcar todo leído**, vaciar,
  refrescar, **Auto-Orquestación** (toggle del agente de autorizaciones) con sus contadores
  (orquestaciones · procesadas · medios), **Árbol de Procesos Ramificados** (ramas con sus pasos y
  tiempos), prioridad por evento, acciones por evento (autorizar y aplicar · conceder · descartar ·
  marcar leída) y estado honesto («aplicada», «pendiente», «en embargo»).
- **Preferencia**: `starseed.astraura158.notify.v1` — «solo en su pestaña» (por defecto) o «también en el
  centro del OS» (opt-in explícito del usuario).

## 3 · Pestañas del Studio 1.58 (paridad con las 21 originales)

| Original 1.58 | Pestaña del OS (Studio `?sub=`) | Estado |
|---|---|---|
| Chat Multiagéntico & Voz | `chat` | **nueva** (Ola 4): control del chat multiagente + menciones @persona + enlace al Exocórtex |
| VoiceStudio & Forja de Sonido | `voz` | Ola 3 |
| Proyectos y Creaciones | `proyectos` | Ola 3 |
| Imaginación Intuitiva | `imaginacion` | Ola 3 |
| Enrutamiento de Almacenamiento & Medios | `almacenamiento` | Ola 3 |
| Sensorium 360° & Clima | `sentidos` | Ola 3 |
| Privacidad & Permisos de Sensores | `sentidos` | Ola 3 |
| Notificaciones & Logs | `notificaciones` | **rediseñada** (Ola 4, §2) |
| Cerebros Multidimensionales | `cerebros` | Ola 3 |
| Memorias y Recuerdos | `memoria` | Ola 3 |
| Personalidades / Arquetipos | `personalidades` | Ola 3 |
| Enjambre de Agentes | `agentes` | Ola 3 |
| Navegador Autónomo | `navegador` | **nueva** (Ola 4) |
| Explorador del Dispositivo | `dispositivo` | **nueva** (Ola 4) |
| Workflows & Automatización | `proyectos` | Ola 3 |
| Habilidades & Bóveda | `habilidades` | Ola 3 |
| Instalador Universal & Scan | `instalacion` | Ola 3 |
| Biblioteca StarSeed | `biblioteca` | **nueva** (Ola 4): puente con la Biblioteca del OS |
| Telemetría 1.58-Bit | `telemetria` | **nueva** (Ola 4) |
| Terminal & Sandbox | `terminal` | **nueva** (Ola 4, honesta: lectura + runtime del §1) |
| Configuración & Preferencias | `configuracion` | **nueva** (Ola 4): preferencias del runtime, notificaciones, primario |

Regla común a todas: leer del backend real por `astraura-158-client.ts`, degradar con estado honesto si
no responde, deep-link `?sub=`, y enlazar con personalidades/agentes/cerebros/memorias cuando el dato lo
permita.

## 4 · Criterio de cierre de la ola
1. `tsc --noEmit` 0 · vitest verde · `next build` ✓.
2. Un bloque ```html y uno ```glsl generados en el chat se ejecutan, muestran consola, se abren en
   ventana/pestaña y se cierran — desde la orbe, el Exocórtex y `/agent`.
3. Las notificaciones de la IA **no** aparecen como toast ni en el centro del OS; sí en su pestaña, con
   filtros, autorización masiva y árbol de procesos.
4. Las 21 pestañas del original tienen su equivalente en el Studio.
5. Notas en `starseed_memory_root` (tasks/logs) y en `memory/state.md`; publicado en `main`.

---

## 5 · Estado (2026-08-24 · tanda 1 ejecutada)

**Runtime de código (§1) — HECHO**
- `src/lib/aurora/code-runtime.ts` (puro, 14 tests): `detectRunnable` (página · script · estilo ·
  shader · react · backend · inerte), `parseFenceDirectives` / `parseInlineDirectives` / `directivesFor`
  (run · autorun · norun · mode · size · height · title · tools, con alias en español),
  `buildSandboxDoc` (documento aislado + puente de consola; boilerplate WebGL2 con
  `u_time`/`u_resolution`/`u_mouse`; React+Babel por CDN solo si las preferencias lo permiten),
  `readCodeRuntimePrefs`/`writeCodeRuntimePrefs` (`starseed.aurora.code-runtime.v1`, sincronizada).
- `src/components/aurora/code-runner.tsx`: ejecutar · detener · cerrar · modo (vista/código/dividido/
  consola) · tamaño S/M/L/pantalla completa + arrastre · ventana nueva · pestaña nueva · copiar ·
  descargar · consola con niveles y contador. Iframe `sandbox="allow-scripts allow-modals allow-popups"`
  SIN `allow-same-origin`.
- Enganche ÚNICO en `message-renderer.tsx` → todos los chats (orbe, Exocórtex, `/agent`, consejo,
  Astraura IA) lo heredan. El fence conserva su `info string` completo para leer las directivas.

**Notificaciones de la IA (§2) — HECHO**
- `astraura-158-feed.ts` ya NO empuja al centro del OS ni lanza toasts salvo opt-in explícito
  (`starseed.astraura158.notify.v1`, por defecto `"tab"`); se eliminó la tira 1.58 de Trinity.
- `s158/notificaciones-tab.tsx` rediseñada con paridad: filtros por categoría, autorizar y aplicar
  todas, marcar leídas, vaciar, auto-orquestación con contadores, árbol de procesos ramificados,
  prioridad y acciones por evento. `astraura-158-notify.ts` (puro, 21 tests) con `categoryForEvent`.

**Pestañas (§3) — HECHO (21/21 cubiertas)**
- Nuevas: `chat` · `navegador` · `dispositivo` · `biblioteca` · `telemetria` · `terminal` ·
  `configuracion`, cableadas en el panel con sus alias de deep-link.
- `configuracion` gobierna de verdad el runtime del §1, el modo de notificación, el sistema primario,
  el backend de la neurona y la limpieza de datos locales.

**Puertas:** `tsc --noEmit` 0 · vitest **125/125** · `next build` ✓.
