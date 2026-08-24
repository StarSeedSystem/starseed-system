# SOP — Adenda 158 · Ola 6: el menú de Astraura pasa a ser el del sistema original 1.58-bit

> **Fuente de verdad de esta ola.** Sustituye a ningún SOP anterior: amplía
> `astraura-158-sistema-primario.md` (Adenda 153 · Olas 3-5). Si tocas el menú de
> `/agent`, la página `/imaginacion` o la orbe de voz, lee esto antes.
>
> Fecha: 2026-08-24 · Repos: `StarSeedSystem/starseed-system` (OS) y
> `StarSeedSystem/astraura` (backend soberano 1.58-bit).

---

## 1 · El problema que resuelve

Las Olas 3-5 construyeron dentro del OS las 22 pestañas del programa original
Astraura 1.58-bit (`src/components/astraura/s158/*`), pero **todas vivían dentro
de una sola pestaña** del menú: `Infraestructura › Astraura 1.58`, con su propio
parámetro `?sub=`. El menú de «Astraura AI & Orchestration» seguía enseñando las
11 secciones históricas del OS (Chats, Nexus, Espacios de trabajo, Cerebro &
Memorias, Modelos & Proveedores, Habilidades, Sentidos & Canales, Personalidades,
Infraestructura, Estudio, Gobernanza).

Consecuencia práctica, y exactamente la queja del usuario: **para quien navega el
OS, las áreas del sistema original no existían.** Se aplica aquí la regla dorada
de descubribilidad del `CLAUDE.md` §11 — crear la pantalla no la hace accesible;
hay que registrarla en los medios de navegación.

---

## 2 · La estructura nueva del menú

`src/app/(app)/agent/page.tsx` → `STUDIO_SECTIONS`. El esqueleto pasa a ser las
**21 áreas del original**, con sus nombres propios, más una sección 22
(«Gobernanza de la Red») que es del OS y no tiene equivalente allí. Cada pestaña
que el OS ya tenía se ha COLOCADO dentro del área a la que pertenece: **no se ha
perdido ninguna** — los 45 `value` anteriores siguen existiendo, con su mismo
contenido y sus mismos deep-links.

| # | Sección (label) | `value`s que contiene |
|---|---|---|
| 1 | Chat Multiagéntico & Voz | `chat` · `chat-158` · `conexiones-chat` · `telegram` |
| 2 | VoiceStudio & Forja de Sonido | `aurora` · `coherencia` · `voz-158` |
| 3 | Proyectos y Creaciones | `proyectos-158` · `espacios` · `quick` · `pizarra` · `pizarras` · `publicar` |
| 4 | Imaginación Intuitiva | `imaginacion` |
| 5 | Enrutamiento de Almacenamiento & Medios | `almacenamiento-158` · `almacenes` · `conexiones` |
| 6 | Sensorium 360° & Clima | `sensorium` · `senses` |
| 7 | Privacidad & Permisos de Sensores | `privacidad` · `permisos-158` · `seguridad` |
| 8 | Notificaciones & Logs | `notificaciones` |
| 9 | Cerebros Multidimensionales | `cerebros` · `cerebro` · `servidores` · `servers` · `red3d` |
| 10 | Memorias y Recuerdos | `memorias` · `memoria-158` · `baules` · `conocimiento` · `okf` |
| 11 | Personalidades / Arquetipos | `personalidades` · `mesh` |
| 12 | Enjambre de Agentes | `enjambre` · `agentes-158` · `runtimes` · `foundry` |
| 13 | Navegador Autónomo | `navegador-158` · `navegador` |
| 14 | Explorador del Dispositivo | `explorador` |
| 15 | Workflows & Automatización | `workflows-158` · `workflows` · `rules` · `batch` |
| 16 | Habilidades & Bóveda | `boveda` · `skills` · `tools` · `mcp` · `fuentes` · `integraciones` · `habilidades` · `apps-ia` |
| 17 | Instalador Universal & Scan | `instalador` |
| 18 | Biblioteca StarSeed | `biblioteca` |
| 19 | Telemetría 1.58-Bit | `telemetria` · `overview` |
| 20 | Terminal & Sandbox | `terminal` |
| 21 | Configuración & Preferencias | `config-ia` · `astraura-158` · `configuracion-158` · `proveedor` · `neuronas` |
| 22 | Gobernanza de la Red *(propia del OS)* | `decisiones` · `mi-actividad` |

**«Daedalus 1.58b»** no es una sección: en el original es la *insignia* de
«Proyectos y Creaciones». Se conserva como tal, no como área aparte.

### 2.1 · Cómo se monta un área nueva: `S158TabHost`

`src/components/astraura/s158-host.tsx` (nuevo). Resuelve por su cuenta lo mismo
que resolvía el panel —destino efectivo (**local si responde, si no la nube**),
manifiesto, contadores y recarga— y monta UNA pestaña `s158` como sección de
primer nivel, precedida por `<S158EndpointStrip>` (endpoint, en línea / motivo
del fallo, actualizar, salto al Studio).

Exporta además `useAstraura158Host()`, que reutiliza la página de Imaginación
para no duplicar el sondeo.

**Regla:** si el backend soberano no responde, la cinta lo dice con su motivo.
**Nunca se rellena con datos inventados.**

### 2.2 · Compatibilidad: los deep-links no se rompen

El mecanismo sigue siendo `TAB_ALIASES` (`normalizeTab` → `TAB_ALIASES[raw] ?? raw`,
validado contra `VALUE_TO_SECTION`). Un `value` desconocido **falla en silencio**
(primera carga → `chat`; navegación posterior → no pasa nada), así que un enlace
roto no se detecta en QA manual: por eso toda reorganización va acompañada de sus
alias.

Los enlaces que antes iban al Studio ahora caen en la sección de primer nivel:
`imaginacion`/`imagination`/`suenos` → `imaginacion`; `enjambre`/`swarm`/
`orquestacion`/`metis`/`director` → `enjambre`; `sensorium`/`clima`/`entorno` →
`sensorium`; `notificaciones-158`/`notifications`/`logs` → `notificaciones`; y así
para bóveda, explorador, instalador, biblioteca, telemetría, terminal, proyectos,
almacenamiento, memoria, voz, chat, workflows y configuración.

⚠️ **`navegador` NO se aliasa**: es un `value` que ya existía (las ventanas de
navegador guardadas del OS) y `funciones-index` enlaza a él. El navegador
autónomo del backend vive en `navegador-158`, en la misma sección.

### 2.3 · Comprobación mecánica

Antes de dar por buena cualquier reorganización del menú, correr esta comprobación
(los cuatro resultados deben ser vacíos, salvo el falso positivo conocido
`sentidos`, que está dentro de un comentario):

```
menú sin contenido · contenido sin menú · alias rotos · alias que tapan un value real
```

---

## 3 · La página de Imaginación Intuitiva

Ruta nueva **`/imaginacion`** (`src/app/(app)/imaginacion/page.tsx`), y la misma
vista embebida en `/agent?tab=imaginacion` con botón «Abrir a pantalla completa».
Componentes en `src/components/astraura/imaginacion/`:

| Fichero | Qué reconstruye del original |
|---|---|
| `imaginacion-view.tsx` | La pantalla: cabecera (Director, Informe de Síntesis, núcleos M1, ubicación calibrable, entropía, acceso universal, «Próxima Síntesis», Always-On, Disparar Síntesis) y las 5 sub-pestañas con sus contadores |
| `resource-governor.tsx` | Gobernador de Recursos: Tronco A (Imaginación) / Tronco B (Multi-Agentes) / Reserva de Chat |
| `process-card.tsx` | Tarjeta de proceso onírico con permisos graduales, slider de tronco y los 4 botones |
| `branches-modal.tsx` | «Ramas & Logs»: 5 sub-pestañas, en vivo cada 3 s, paso en vivo, y por rama regenerar/bifurcar/editar/eliminar |
| `synthesis-report-modal.tsx` | Informe de Síntesis del Usuario: historial + 5 pestañas + exportar a Markdown |
| `director-modal.tsx` | Supervisor Orquestador Director (Metis): gobernanza, cola de agentes, bóveda de memorias, auditorías |
| `sync-modal.tsx` | Aplicación sincronizada multi-agente en 2º plano |
| `agents-imagination-panel.tsx` | Agentes imaginando en segundo plano, con su tronco, CPU y RAM |

### 3.1 · Reglas de esta pantalla

- **Sondeo:** global cada **5 s** (pausado con `document.hidden`); ramas cada
  **3 s** solo con el modal abierto y «En Vivo» encendido; sincronización cada
  **2 s** solo con el modal abierto. No hay WebSocket: es *short-polling* HTTP,
  igual que el original.
- **El countdown «Próxima Síntesis» NO descuenta en el cliente**: se pinta tal
  como llega en `next_cycle_formatted`. Es deliberado — inventar un temporizador
  local mentiría sobre el estado del backend.
- **El gobernador de troncos lleva debounce de 400 ms** (mejora sobre el
  original, que disparaba una petición de red por cada píxel arrastrado). El
  frontend **no normaliza los porcentajes**: los envía y repinta lo que el
  backend devuelve, que es quien recalcula la reserva de chat.
- **Los 4 niveles de permiso** (`auto_apply_safe` · `auto_apply_minor` ·
  `always_ask` · `autonomous_sovereign`) tienen **tres juegos de etiquetas
  distintos** según el contexto (tarjeta de proceso, tarjeta de agente, config
  global). Se replican tal cual: cambiarlos rompe la correspondencia con el
  original.
- **Mejora propia:** cada rama muestra su `generated_by` como insignia «modelo
  real» vs «plantilla». El backend siempre mandó ese campo; el original nunca lo
  pintaba, y sin él no se distingue una propuesta pensada de una rellenada.
- **Diálogos:** los del OS (`useConfirm`/`usePrompt`, Adenda 137), nunca
  `window.confirm`/`prompt`.

---

## 4 · La orbe cuántica de voz

La orbe del OS (`aurora-orb.tsx`) **se conserva como base y como estado de
reposo**. Cuando hay voz activa (hablando · escuchando · pensando) conmuta con un
fundido de ~260 ms a `<QuantumOrb>`, el renderizador de canvas 2D equivalente al
`QuantumVoiceOrbWidget` del original.

| Fichero | Papel |
|---|---|
| `src/lib/aurora/quantum-orb-theme.ts` | Las 10 personalidades con sus colores, `styleType` y `badgeTitle` literales del original, más `QuantumOrbParams` (`turbulence`, `spikiness`, `symmetry`, `hueShift`, `breath`) |
| `src/components/aurora/quantum-orb.tsx` | El motor: glow, geometría por personalidad, partículas, núcleo |
| `src/components/aurora/quantum-orb-avatar.tsx` | Miniatura viva para listas de procesos, agentes y personalidades |
| `src/lib/aurora/quantum-orb-bus.ts` | Bus tipado `on/off/emit` (`state`, `level`, `frequencies`, `persona`, `params`) |

**Mejoras sobre el original**, todas sin dependencias nuevas:

1. **Ruido simplex 2D propio** como perturbación de baja frecuencia — rompe la
   periodicidad perfecta de los senos, que es lo que hacía que la orbe original
   se leyera como «matemáticas» y no como algo vivo.
2. **Bandas de frecuencia** (graves/medios/agudos) ponderadas distinto por
   personalidad, en vez de una media plana de los primeros 32 bins.
3. **Partículas atadas a un bin concreto** del FFT, no moviéndose todas en bloque.
4. **Estela líquida** (`rgba(5,7,13,0.18)`) en vez de limpiar el frame entero.
5. **Crossfade de paleta** (~250 ms) al cambiar de hablante, en vez del salto.
6. **`ResizeObserver` + `devicePixelRatio`** — el original fijaba la resolución
   una sola vez y se pixelaba al cambiar de tamaño.
7. **`prefers-reduced-motion`** → respiración lenta, sin partículas ni ruido.
8. **Geometría propia para Astraura Prime y Aurora**: en el original,
   `quantum_toroid` y `aurora_heart_petals` eran nombres distintos que caían en
   la MISMA rama `else` — solo se diferenciaban por color.

**Audio:** reutiliza el singleton de micrófono que ya vive en
`aurora-orb-bus.ts`. No se abre ningún `AnalyserNode` nuevo.

**Parámetros en vivo del 1.58b:** el canal `params` del bus queda listo para que
el backend publique el vector visual por cláusula; ningún componente lo consume
todavía, `<QuantumOrb>` sigue dirigido por props.

---

## 5 · Paridad: los huecos que se cierran en esta ola

Funciones nuevas en `src/lib/astraura/astraura-158-client.ts` (bloque «Ola 6») y
sus superficies:

| Área | Qué faltaba | Dónde está ahora |
|---|---|---|
| Ramas | paso en vivo, regenerar, bifurcar, modificar, eliminar; estado de la aplicación sincronizada | `imaginacion/branches-modal.tsx`, `sync-modal.tsx` |
| Bóveda | credenciales por servicio y 4 parámetros de inferencia | `s158/boveda-tab.tsx` |
| Workflows | crear, editar y eliminar (antes solo ejecutar/activar) | `s158/workflows-tab.tsx` |
| Proyectos | crear/eliminar proyecto, versión, rama, merge, borrar archivo, bifurcar creación, ejecutar muestra | `s158/proyectos-tab.tsx` + `proyectos-dialogs.tsx` |
| Memoria | documentos StarSeed (CRUD), OpenViking, quitar memoria fijada | `s158/memoria-tab.tsx` |
| Almacenamiento | escanear/fusionar cerebros externos, app portátil, editar y simular reglas | `s158/almacenamiento-tab.tsx` |
| Privacidad | **permisos REALES del navegador** (geolocalización, micrófono, cámara, almacenamiento persistente) | `s158/privacidad-tab.tsx` |
| Instalador | script servido por el backend, autodetección de SO, re-escaneo de dispositivos | `s158/instalador-tab.tsx` |
| Telemetría | recompilar `bitnet.cpp` nativo | `s158/telemetria-tab.tsx` |
| Configuración | estado/actualizaciones del sistema soberano y auto-modificación con consentimiento explícito | `s158/configuracion-tab.tsx` |

### 5.1 · Verificación contra el backend real (2026-08-24, misma sesión)

Se contrastaron los 25 endpoints contra `backend/app/main.py` y se probaron **en
vivo** contra la neurona local. Resultado: **22 ya existían** y **3 se han
implementado**. Lo que de verdad estaba roto no eran las rutas, sino los
**contratos** — y eso no lo detecta ninguna prueba de humo, porque el backend
responde 200 y el OS pinta un estado vacío como si no hubiera datos.

**Implementado en el backend (Ola 6):**

| Endpoint | Qué hace | Medido en vivo |
|---|---|---|
| `POST /api/creations/run_sample` | Ejecuta la muestra de una creación en el sandbox local (`creations_manager.execute_sample_simulation`) | Compiló y corrió C++ ARM64 NEON de verdad: 4,1 s, `return_code 0` |
| `POST /api/system/index_path` | Indexa CUALQUIER ruta del dispositivo en la memoria 1.58, acotando `DocumentIndexer` a esa raíz | 17,4 s por una carpeta con un `.md`; ruta inexistente → error con motivo |
| `POST /api/bitnet/build` | Clona y recompila `bitnet.cpp` con las banderas SIMD locales | Responde al instante si ya está compilado |

**Corregido en el backend:** `/api/vault/connection/update` **tiraba el token**
(solo ponía `token_set = True`) y `vault.py` declaraba `vault_file` sin leerlo ni
escribirlo nunca: todo vivía en memoria y moría al reiniciar. La bóveda del OS
decía «token guardado» sin que hubiera nada guardado. Ahora persiste en
`~/.astraura/vault.json` (carpeta `0700`, fichero `0600`, escritura atómica),
sobrevive al reinicio, admite conexiones nuevas y **nunca devuelve el token en
claro**: el OS recibe `token_set` y `masked_token`. También se añadieron
`limit`/`offset` opcionales a `/api/memory/starseed/documents`, porque el memory
root real de esta neurona tiene **10 147 documentos** y la pestaña los pedía todos.

**Contratos corregidos en el cliente del OS** (cada uno habría fallado en silencio):

| Función | Estaba | Es |
|---|---|---|
| `updateAstraura158VaultConnection` | `{service, token}` | `{conn_id, token, account, status}` |
| `createAstraura158Project` | `{name, description?, kind?, path?}` | `{name, description, type}` — sin `path` |
| `addAstraura158ProjectVersion` | `content` | `changes: string[]` |
| `createAstraura158ProjectBranch` | `note` | `notes` + `origin_branch` |
| `mergeAstraura158ProjectBranch` | `branch_id` | `source_branch` + `target_branch` |
| `forkAstraura158CreationVersion` | `{version_id?, note?}` | `{branch_name, diff_summary, new_content}` |
| `fetchAstraura158Documents` | `{documents: []}` | **array pelado** + paginación |
| `saveAstraura158Document` | `title` / `content` | `name` / `markdown` / `branch` |
| `scanAstraura158ExternalBrains` | POST | **GET**, y responde `external_brains` |
| `setAstraura158ExternalBrainPermissions` | `permission_mode` | `mode` |
| `syncAstraura158Portable` | `volume`, `include_models` | `drive_path`, `include_projects`, `include_voice_studio` |
| `runAstraura158DiscoveryScan` | POST | **GET** |
| `fetchAstraura158InstallerScript` | `res.json()` | **texto plano** (`text/x-shellscript`) — reventaba el parseo |
| `installAstraura158OsUpdate` | `restart` | `auto_restart` + `channel` |
| `modifyAstraura158OsConfiguration` | `{granted, reason}` | `{os_type, user_permissions_granted, security_consent_token}` |

**Tiempos reales, y por qué importan:** `longTimeout` (30 s en local) abortaba
llamadas que el backend sí atiende. Medido: `discovery/scan` **48 s y 8,6 MB**,
`index_path` **17 s**, `bitnet/build` minutos en frío. Esos tres pasan ahora a
180 s / 180 s / 600 s. Un timeout demasiado corto se ve exactamente igual que un
backend caído: el usuario habría leído «sin conexión» de un sistema sano.

---

## 6 · Registro en los medios de navegación (CLAUDE.md §11)

| Medio | Qué se tocó |
|---|---|
| **OmniDock** | Preset `imaginacion` → `/imaginacion` (icono `Sparkles`, morado) |
| **Garantía de predeterminados** | `DOCK_DEFAULTS_VERSION` **14 → 15** y `imaginacion` añadido a `DOCK_DEFAULT_ON_IDS`, para que aparezca en cuentas y neuronas ya existentes |
| **App Launcher** | `imaginacion` y `enjambre` en `APP_CATALOG`, y en las colecciones `starseed` / `sistema` |
| **Biblioteca instalable** | `app-imaginacion` en `packages.ts` (icono `Sparkles`, ya en `ICON_MAP`) |
| **Índice de funciones** | `funciones-index.tsx` reescrito con las 21 áreas; de paso se corrige el error histórico de su primera fila, etiquetada «Nexus» pero apuntando a `tab=chat` |

`funciones-index.tsx` es la **cuarta fuente de verdad** de la navegación y no se
sincroniza sola: si el menú cambia, hay que actualizarla a mano.

---

## 7 · Cómo se verifica

`npx tsc --noEmit` (0 errores) · `npx vitest run` (125/125) · `npm run build` ·
la comprobación mecánica del §2.3 · CI de GitHub, que es el build autoritativo
(el build local puede morir por la RAM del contenedor, no por el código).
