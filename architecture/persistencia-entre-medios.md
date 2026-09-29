# Persistencia entre medios — qué recuerda StarSeed OS y dónde (2026-09-29)

> **Problema (Alex):** «hay algunas ventanas que reaparecen de las configuraciones de las neuronas al
> reiniciar, como la de configuración de sistemas de Astraura; asegura que todos los datos sean
> recordados en los dispositivos desde cualquier medio».

## 1. Por qué reaparecían

Un **medio** es cada sitio desde el que se abre el OS: `localhost:9002` (Mac), `starseed-os.vercel.app`,
la PWA instalada y la app Tauri. Cada medio tiene **su propio `localStorage`** y, con él, sus propias
marcas de «ya lo vi» y su propio id de neurona. Todo lo que solo vivía en `localStorage` y no estaba en
`SYNCED_KEYS` se olvidaba al cambiar de medio, y las ventanas que se abren solas se decidían con el medio
recién abierto (vacío) **antes** de que la cuenta hubiera entregado nada.

Tres causas, tres arreglos:

| Causa | Arreglo |
|---|---|
| El «visto/hecho/luego» de cada ventana era una clave local suelta | Un solo almacén **fusionable por id** que viaja con la cuenta: `src/lib/sync/avisos-cuenta.ts` (clave `starseed.avisos.vistos.v1`) |
| La ventana decidía antes de que bajara la cuenta | `esperarPullInicial()` / `cuandoCuentaFiable()` en `realtime-sync.ts`: no se decide con la cuenta sin leer; un fallo de lectura queda como estado `sin-conexion` (no como «nunca visto») |
| Cada medio es una neurona «nueva» para la cuenta | «¿Es esta una neurona que ya configuraste?» → adoptar el id de esa neurona (§4) |

## 2. Cómo viaja lo que viaja

- **`SYNCED_KEYS`** (`src/lib/settings-sync.ts`): lista blanca de claves de `localStorage` que el motor de
  `realtime-sync.ts` sube a `user_settings.prefs` (RPC atómico `merge_user_prefs`, migración
  `20260714020000_merge_user_prefs_atomic.sql`) y aplica al llegar. Resolución **por clave, última
  escritura gana** (marcas en `starseed.sync.meta.v1`, local). No hay «catch-all» por prefijo salvo
  `starseed.brain.<id>.*`: **cada clave se añade a mano**.
- **`starseed.avisos.vistos.v1`** es la excepción **fusionable** (`CLAVES_FUSIONABLES`): en vez de
  pisarse, los medios se unen por id (por registro: la marca más reciente; a igualdad, `hecho` › `visto` ›
  `luego`). Así dos medios que marcan cosas distintas a la vez convergen sin perder ninguna.
- **Otros canales** (no pasan por `SYNCED_KEYS`; no duplicarlos): escritorios del perfil
  (`profile-desktops.ts` → `entity_state`), dashboards y widgets (`dashboard_state`), ajustes de mensajería
  (`entity_state`, `ajustes-tipos.ts`), pantalla de perfil (`entity_state` `layout`), agentes (espejo por
  unión vía `library-sync`, `lib/agents/store.ts`) y la Biblioteca por entidad (`entity-state.ts`).
- Todo se escribe por `localStorage.setItem` (parcheado): **sin sondeos ni bucles nuevos**; subida con
  debounce y refresco por eventos (`EVENT_BY_KEY` en `realtime-sync.ts`).

## 3. Ventanas que se abren solas (y qué recuerdan ahora)

Todas esperan a `cuandoCuentaFiable` (máx. 4 s por lectura; si la cuenta no responde no se decide y, en
cuanto responde, se decide), **respetan la marca local antigua y la copian a la cuenta**, y cierran por
cualquier vía dejando rastro en la cuenta.

| Ventana | Id en la cuenta (`avisos-cuenta`) | Antes | Ahora |
|---|---|---|---|
| Configuración de sistemas de Astraura (A149) | `a149.sistemas.inicio` (hecho), `a149.sistemas.luego` (luego+hasta), `a149.catalogo.<firma>` (visto) — `startup-updates.ts::decidirArranque` | Se decidía a los 1,2 s con el medio vacío; el cierre sin aplicar no dejaba nada; cada cambio de catálogo reabría la ventana grande | Decide con la cuenta bajada; «primera vez / pendiente» abre la ventana; un cambio de catálogo es un **aviso pequeño con «Ver»** (no ventana) sellado en la cuenta; cerrar sin aplicar pospone |
| Centro de configuración de Aurora | `aurora.setup.centro.v<SETUP_VERSION>` | Marca local; cada medio lo reabría | Las tres puertas (`aurora-setup-center.tsx`) esperan a la cuenta; `resetSetupState` crea un registro nuevo que gana a cualquier «hecho» viejo |
| «Neurona nueva» (ajustes de la neurona) | `neurona.configurada` y `neurona.nueva.luego` (por neurona) | «Más tarde» solo duraba la visita; sin cuenta bajada decidía «nueva» | Marcas por neurona en la cuenta; espera al pull; añade la pregunta de adopción (§4) |
| Guía de bienvenida (`aurora-guide.tsx`) | `guia.bienvenida` — `lib/onboarding/guia-vista.ts` | `starseed.guide.seen.v1` local | Espera a la cuenta; «vista» en cualquier medio basta; reabrir a demanda no cambia |
| Aviso de novedad de bloqueo/pantalla inicial | `novedad.arranque.bloqueo-inicio` — `lib/inicio/aviso-novedad.ts` | Respuesta local por dispositivo | Una novedad se anuncia **una vez por cuenta**: `configurado`→hecho, `no-mostrar`→visto, `luego`→luego (3 días). Lo definitivo gana a «luego». Lo que sigue siendo por dispositivo es *tener* bloqueo/pantalla inicial |

## 4. «¿Es esta una neurona que ya configuraste?» (adoptar una neurona)

Con cuenta y si la cuenta ya tiene **otras** neuronas, «Neurona nueva» pregunta antes de abrir el asistente.
«Usar su configuración» → `usarConfiguracionDeNeurona` (`lib/neurons/adopcion-neurona.ts`):

1. `adoptarNeurona(id)` (`lib/network/identidad-dispositivo.ts`) escribe el alias por origen
   `starseed.device.alias.v1` y luego `starseed.neuron.device-id`, verifica y es idempotente (conserva el id
   `propia` original). Nombre, permisos, ajustes y overrides de sistemas por personalidad cuelgan de ese id y
   ya viajan, así que llegan sin repetir nada.
2. Deja la neurona adoptada como configurada (`marcarNeuronaConfigurada`).
3. Borra la fila duplicada de `neuron_devices` **solo si** el id anterior era el propio y distinto del
   adoptado, **nació en este arranque** y la persona **no le puso nombre/permisos/ajustes**. Ante prefs
   ilegibles no borra. Un fallo de red deja una fila offline (no invalida la adopción).
4. Recarga (`recargar ?? window.location.reload()`); «Es otra neurona» sigue el asistente de siempre.

**Solo se adopta el id de neurona.** El id de sync (`starseed.device.id`, supresión de eco) y el de malla
(`starseed.mesh.device-id.v1`, anclaje TOFU de claves) **no se alinean a propósito**: compartirlos rompería la
supresión de eco y permitiría suplantar/mezclar identidades de la malla. La pantalla de arranque por neurona
guardada bajo el id de sync no se transfiere al adoptar.

## 5. Política: qué viaja, qué se queda y cómo añadir una clave

**Viaja (con la cuenta):** preferencias de **usuario** pequeñas (< unas decenas de KB), sin secretos, que la
persona espera ver igual en cualquier medio (apariencia, voz elegida, privacidad, favoritos, pantalla de
inicio, permisos de neuronas…), y los «visto/hecho/luego» de las ventanas (siempre vía `avisos-cuenta`).

**Nunca viaja:** secretos y credenciales (claves API, tokens, OAuth), bloqueo/PIN/biometría/passkeys,
identidades y claves de la malla, **ids de dispositivo/neurona/malla**, cachés (espejos de memoria, catálogos),
colas y telemetría de trabajo, y estado del hardware de un dispositivo concreto (calidad de fondo, nivel de
movimiento, motor de voz local, permisos de cámara/sensores).

**Se queda por medio a propósito:** avisos ligados al propio medio (`entorno.*`, aviso de la web,
«saltar inicio de sesión»), estado de pantalla (posiciones, plegados, vistas).

### Cómo añadir una clave (lista de comprobación)
1. ¿Es un «ya lo vi / ya lo hice / más tarde» de una ventana? **No crees clave**: `marcarAviso`/`estadoAviso`/
   `useAviso` de `avisos-cuenta` y espera con `cuandoCuentaFiable`.
2. ¿Secreto, id de dispositivo, caché, cola o hardware? → **no** a `SYNCED_KEYS`; si es sensible, añádela a
   `NEVER_SYNCED_KEYS` (defensa en profundidad) y **no escribas «viaja con la cuenta»** en su comentario.
3. ¿Mezcla preferencias y secretos en el mismo valor (p. ej. `media.prefs.v1`)? Solo puede viajar con un
   sanitizador (`sanitizeForCloud`); mientras tanto, a `NEVER_SYNCED_KEYS`.
4. Preferencia segura → añade la clave a `SYNCED_KEYS` con un comentario de una línea y, si su store emite un
   evento, a `EVENT_BY_KEY` (`realtime-sync.ts`) para el refresco en vivo.
5. Añádela a `AÑADIDAS` en `src/lib/sync/__tests__/claves-sincronizadas.test.ts` y a la tabla de §6.
6. Si la dejas por dispositivo a propósito, dilo en el comentario de su declaración (motivo incluido).

## 6. Auditoría de claves `starseed.*` (2026-09-29)

Método: barrido de `src/**` (sin tests) buscando declaraciones `const … = "starseed…"` y llamadas
`getItem/setItem/safeGet/safeSet`; 345 claves, 82 ya en `SYNCED_KEYS`, 17 ya en `NEVER_SYNCED_KEYS`.

### 6.1 Añadidas a la cuenta en esta auditoría
| Clave | Qué es | Evento |
|---|---|---|
| `starseed.astraura.chime.v1` | sonido sutil al guardar en la ventana de sistemas | `starseed:astraura-chime` |
| `starseed.voz.modo.v1` | voz femenina/masculina/neutra/autónoma | `starseed:voz-modo` |
| `starseed.voz.timbre.v1` | timbre elegido (id) | — |
| `starseed.voz.timbres-propios.v1` | timbres propios (≤ 6, solo parámetros; viajan con el timbre que los referencia) | — |
| `starseed.inicio.pantalla.v1` | pantalla al abrir StarSeed, por perfil y neurona | `starseed:inicio` |
| `starseed.theme.favorites.v1` | temas favoritos | — |
| `starseed.privacy.telemetry` | telemetría opt-in | — |
| `starseed.privacy.ghost` | modo fantasma | — |

Además: `starseed.avisos.vistos.v1` (fusionable, §2). Se quitó un duplicado de
`starseed.audiomorphic.presets.v1` en `SYNCED_KEYS`.

### 6.2 Nunca viajan (añadidas a `NEVER_SYNCED_KEYS` como defensa en profundidad)
`starseed.media.prefs.v1` (mezcla `hfToken`/`muapiKey`), `starseed.nvidia.apikey`, `starseed.voicebox.key.v1`,
`starseed.almacenamiento.tokens.v1`, `starseed.almacenamiento.clientids.v1`, `starseed.telegram.user.v1`,
`starseed.bloqueo.v1` / `.sesion.v1` / `.intentos.v1`, `starseed.device.id`, `starseed.device.id.v1`,
`starseed.device.self`, `starseed.device.alias.v1`, `starseed.neuron.device-id`, `starseed.mesh.device-id.v1`,
`starseed.mesh.identity.v1`, `starseed.mesh.master-identity.v1`, `starseed.mesh.enc-identity.v1`,
`starseed.mesh.relay-key.v1`, `starseed.mesh.relay-keyring.v1`, `starseed.mesh.revocation-cert.v1`.
(Más las que ya estaban: proveedores IA, credenciales de conectores, clave Porcupine, chats con `apiKey`,
espejos y colas de cerebros…)

### 6.3 Se quedan locales a propósito
- **Marcas de ventanas** (su decisión ya pasa por `avisos-cuenta`; la clave local se conserva por
  compatibilidad): `starseed.guide.seen.v1`, `starseed.novedad.arranque.v1`, `starseed.neuron.setup.v1`,
  `starseed.astraura.startup.v1` (el blob local conserva `autoUpdate`/`strategy` propios de esta neurona; los
  flags de «visto» viajan aparte).
- **Marcas propias del medio:** `starseed.primer-arranque.aviso-web.v1` / `.saltado.v1` /
  `.neurona-pospuesta.v1`, `starseed.entorno.*` (sugerencias según el medio), `starseed.rito.v2`,
  `starseed.guia.tras.perfil`, `starseed.perfil.launch`, `starseed.recien.registrado`, `starseed.recarga-version.v1`,
  `starseed.native.android-release.v1`, `starseed.dock.items.migrated.v3…v12`, `starseed.aurora.conv.migrated.v1`,
  `starseed.astraura158.seed.v1`, `starseed.astraura158.events.seen.v1`, `starseed.astraura.freellm.seen.v1`,
  `starseed.mando.*` (consola de la máquina).
- **Estado de esta pantalla o de su hardware:** `starseed.fondo.calidad.v1`, `starseed.movimiento.*`,
  `starseed.guide.button.visible.v1` (decisión explícita del módulo: «elección de esta pantalla»),
  `starseed.guide.mode.v1` (reabrir siempre vuelve a preguntar), `starseed.media.volume`,
  `starseed.voz.nivel`, `starseed.voz-rt.*`, `starseed.voz.neurona.v1/.v2` (motor por neurona),
  `starseed.astraura.local-en-este-dispositivo`, `starseed.astraura.scout.sig.v1` (la firma incluye la RAM/GPU
  de este equipo), `starseed.camera.hw.v1`, `starseed.ai-overlay.position.v1`, `starseed.llamadas.esquina.v1`,
  `starseed.dock.folders.open.v1`, `starseed.dashboard.editor.v1`, `starseed.desktops.folderview`,
  `starseed.contactos.vista.v1`, `starseed.entitylib.sort.v1/.view.v1`, `starseed.library.filters.v1`,
  `starseed.network.*`, `starseed.mesh.{inferencia-local,transporte-preferido,replay-nonces,lclock,device-owner,account-mfp}.v1`.
- **Cachés, colas y telemetría:** `starseed.account.profile.cache.v1`, `starseed.workspaces.cache.v1`,
  `starseed.updates.available.cache.v1`, `starseed.aurora.conv.cache.v1`, `starseed.aurora.folders.cache.v1`,
  `starseed.astraura.openrouter-catalog.v1`, `starseed.astraura.freellm-sources.v1`,
  `starseed.aurora.openvoice.{discovery,health}.v1`, `starseed.voz.daemon.ausente.hasta`,
  `starseed.supabase.{corte,dia,freno}.v1` (guardián de consumo), `starseed.notifications.v1`,
  `starseed.neurons.logs.v1`, `starseed.osfiles.pending.v1`, `starseed.library.pending.v1`,
  `starseed.batch.jobs.v1`, `starseed.hermione.queue.v1`, `starseed.openhuman.*`, `starseed.living-graph.v1`,
  `starseed.content-store.v1`, `starseed.correos.avisados.v1`, `starseed.dm.readmarks.v1`,
  `starseed.terminal.history.v1`, `starseed.clipboard.v1`, `starseed.desktop.clipboard.v1`.
- **Ya viajan por otro canal** (§2): `starseed.desktops.v1`, `starseed_dashboards*`, `starseed_boards`,
  `starseed_widgets`, `starseed.mensajeria.ajustes.v1`, `starseed.profile.display.v1`, `starseed.agents.*`.
- **Secretos o mezcla con secretos (no viajan):** `starseed.ai.*` (proveedores, salt, verifier),
  `starseed.connectors.creds.v1`, `starseed.external-calendars.v1` y `starseed.n8n.hooks.v1` (URLs privadas),
  `starseed.iot.homeassistant.v1`, `starseed.ntfy.settings.v1`, `starseed.hermes.{mcp,senses}.v1`,
  `starseed.agentharness.config`, `starseed.memory.vault.v1`.

### 6.4 Candidatas a revisar (preferencias de usuario que hoy NO viajan; contenido/tamaño sin verificar)
`starseed.capabilities.disabled.v1` (**incoherente**: `capabilities.v1` viaja pero no las desactivadas
explícitamente), `starseed.astraura.ui-permisos.v1` (permisos de agentes sobre la interfaz: decisión de
seguridad, se deja local hasta decidirlo), `starseed.astraura.signals.v1`, `starseed.astraura.custom-models.v1`,
`starseed.moa.config.v1`, `starseed.memory.roots.v1`, `starseed.memory-admin.v1`, `starseed.connection-priority.v1`,
`starseed.server-registry.*`, `starseed.skill-stack.v1`, `starseed.mesh.{settings,rules,voz.*}.v1`,
`starseed.sync.provider*.v1`, `starseed.library.{brains,links,repos,functions,design,sources,storage,assets}.v1`,
`starseed.apps.installed` / `starseed.library.saved`, `starseed.clima.reminders.v1`, `starseed.voz.autonoma.*`,
`starseed.voces.*`, `starseed.aurora.{chattree,chatcatalog,activeChatId,bgtasks,persona-coherence}.v1`,
`starseed_feed_preference_v1` (+`_version`), `starseed_sidebar_config_v1`, `starseed_pinned_widgets`,
`starseed_internet_servers_v1`, `starseed_widget_library_v1` / `starseed_widget_sessions_v1`
(`lib/widget-sync`, comprobar su canal), `starseed.audiomorphic.params.v1`, `starseed.avatares.*` /
`starseed.mundo.avatares.v1`, `starseed.politics.*`, `starseed.stories.v1`, `starseed.social.state.v1`,
`starseed.sharing.local.v1`. Para cada una: leer su tipo de valor, confirmar que no lleva secretos y medir
su tamaño **antes** de añadirla (la columna `prefs` llegó a 2,8 MB por dos espejos y todo se atascó).

## 7. Guardián de consumo y estado degradado

- `senalEsencial(timeoutMs = 8000)` (`lib/consumo/guardian.ts`) marca una lectura como **esencial**: no la
  recorta el presupuesto **local** (diario/por pestaña/freno local/cola) —el arranque no se puede quedar sin
  leer la cuenta—, pero **sí** respeta el corte 402 y el freno remoto `os_freno`, y no se deduplica sobre una
  lectura en cola. La lectura de arranque de `user_settings.prefs` (`readCloudPrefs` en `realtime-sync.ts`) la usa.
- Estado de la cuenta (`getEstadoCuentaPrefs()`, evento `starseed:sync:cuenta`): `pendiente` · `sin-sesion` ·
  `sincronizado` · **`sin-conexion`** (hay sesión pero la cuenta no se pudo leer). En `sin-conexion` **no se
  sube lo local «porque la cuenta no lo tiene»** ni las ventanas asumen «nunca visto»: esperan. Se reintenta
  **una sola vez** cuando el cortacircuitos se cierra o el navegador vuelve a estar `online` (mín. 30 s entre
  intentos; sin temporizadores ni sondeo).

## 8. Notas para el integrador
- Confirmar en el Supabase activo que existe el RPC `merge_user_prefs` (migración `20260714020000`).
- Los ids de sync y de malla **no** se alinean al adoptar una neurona (a propósito, §4).
- La lectura esencial exige que el llamador pase `senalEsencial()` como `abortSignal` (contrato del guardián; solo `readCloudPrefs` lo hace hoy).
- No hay chip visible de «sin conexión con la cuenta»: está el estado y el evento; enlazarlo a la barra o
  al panel `/servidores` es trabajo de UI pendiente.
- Tests: `src/lib/sync/__tests__/claves-sincronizadas.test.ts` fija la política de este documento.
