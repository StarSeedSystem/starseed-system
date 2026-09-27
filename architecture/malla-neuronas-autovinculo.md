# Malla de neuronas — detección y auto-vínculo (Ola 366)

> **SOP de la Ola 366 (2026-09-26).** Fuente de verdad del subsistema que detecta las neuronas
> (dispositivos) de la MISMA cuenta y las auto-vincula por WebRTC sin botón, más el radar de
> neuronas cercanas de OTRAS cuentas por faros. Léelo antes de tocar `src/lib/network/malla-neuronas.ts`,
> `identidad-dispositivo.ts`, `signaling.ts`, `webrtc-mesh.ts` o `server-relay.ts`.

## 0. El problema que resuelve

Alex, verbatim: «los dispositivos mesh aún no se detectan y autovinculan y sincronizan, ni de
múltiples cuentas ni de la misma cuenta de starseed os». Los datos ya existían en Supabase
(`neuron_devices` con heartbeats frescos, `os_mesh_relay` con faros recientes) pero **nada en el
producto los usaba**: el vínculo P2P era un botón manual en un panel (`DeviceNetworkPanel`) montado
solo en `/servidores`, sin auto-detección, sin reintento y con varios bugs de señalización que
dejaban las conexiones "colgadas" para siempre.

## 1. Identidad de dispositivo — tres namespaces, una lectura

Existían (y se conservan, para no invalidar nada ya guardado en `localStorage` o en Supabase):

| Clave de `localStorage` | Módulo que la crea | Para qué se usaba |
|---|---|---|
| `starseed.device.id` | `src/lib/sync/entity-state.ts` (`deviceId()`) — MISMA clave que `src/lib/network/device-registry.ts` | Motor de sync de cuenta (`realtime-sync.ts`), mesh WebRTC compartido (`lan-sync.ts: ensureMesh(self.id)`) |
| `starseed.neuron.device-id` | `src/lib/neurons/neurons.ts` (registro de neuronas) | Fila propia en `neuron_devices` |
| `starseed.mesh.device-id.v1` | `src/ai/astraura/mesh/federation.ts` | Faros/topología de la malla LoRa (`os_mesh_relay`, `os_mesh_topology`) |

`src/lib/network/identidad-dispositivo.ts` (nuevo) los lee los tres con `safeGet`, crea el que
falte con el MISMO formato que su módulo original (nunca inventa un cuarto formato), y expone:

```ts
identidadDispositivo(): { syncDeviceId, neuronDeviceId, meshDeviceId }
etiquetaFaroPropio(): { nid?, sid? }  // para colgar del payload de un faro propio
```

`syncDeviceId` es el id que usa el motor WebRTC compartido (`lan-sync.ts`), así que es la clave de
unión entre una fila de `neuron_devices` (que ya publica `capabilities.syncDeviceId` desde la
Adenda 71-bis) y su enlace P2P.

`src/lib/neurons/neurons.ts` ahora también guarda `meshDeviceId` en `NeuronCapabilities` (import de
`federation.ts`, sin tocar ese archivo) para que una neurona quede casada con su faro LoRa/`os_mesh_topology`
sin depender solo de `owner_id`.

## 2. El motor — `src/lib/network/malla-neuronas.ts`

Un único hook de motor, `useMallaNeuronas(deps?)`, montado **una sola vez** por
`MallaNeuronasMount` (ver §3). Publica su estado a dos *stores* de módulo (patrón pub/sub con
`useSyncExternalStore`) para que cualquier otro componente pueda leerlo **sin volver a arrancar el
motor**:

- `usePeersMalla(): { propios: number, otrasCuentas: number }` — resumen ligero, pensado para
  `use-estado-capas.ts` (integración pendiente del equipo de IA, NO se tocó ese archivo).
- `useMallaNeuronasEstado(): MallaNeuronasState` — filas completas (`misDispositivos`, `cercanas`,
  `loading`), consumido de solo-lectura por `MallaNeuronasPanel`.

### 2.1 Detección — misma cuenta

Cada `NEURON_POLL_MS` se listan las `neuron_devices` de la cuenta (`listNeurons()`, ya existente).
Se considera "online" con la misma ventana que el resto del OS (`ONLINE_WINDOW_MS = 3 min`).

### 2.2 Detección — otras cuentas ("neuronas cercanas")

Se arranca `startMeshSubsystem()` (idempotente, ya usado sin teardown en varias páginas: federación
+ descubrimiento + capa sináptica). **No** se toca el radio LoRa (`connectMesh()`), así que esto
**no** enciende hardware de radio — solo lee/escribe faros (`os_mesh_relay`, `subscribeNearby`/
`getNearbyBeacons`). Un faro se etiqueta con `nid`/`sid` propios (`server-relay.ts`, ver §5) para
que el lado que lo recibe pueda, en el futuro, saber si es "otra cuenta" del mismo usuario o de
alguien más — hoy se etiqueta como "de otra cuenta" por defecto (no hay sesión que lo contradiga)
y se respeta `capaMeshCompartiendo()` (capa mesh de Astraura): con esa capa apagada, no se escuchan
ni se emiten faros nuevos, aunque la capa YA tenga vecinos cacheados de antes se siguen mostrando
como lectura pasiva.

### 2.3 Decisión de auto-vínculo — `decidirAutovinculo(neuronas, peers)`

Función **pura** (sin IO), la pieza más importante para revisar en un cambio futuro:

```ts
decidirAutovinculo(neuronas: NeuronaParaMalla[], peers: Record<string, PeerEstadoLite>): string[]
```

Reglas (todas cubiertas por test, ver §6):
1. Nunca se propone a uno mismo (`isThisDevice`).
2. Se ignora una neurona sin `syncDeviceId` publicado todavía (no hay con qué llamarla).
3. Se ignora una neurona `online: false` (heartbeat viejo).
4. Se deduplica por `syncDeviceId` (dos filas de `neuron_devices` con el mismo id de sync no
   generan dos intentos).
5. Un peer `connected` o `connecting` **no** se relanza (evita ofertas duplicadas).
6. Un peer `failed` o `closed` **sí** se reintenta (para que un fallo temporal no deje el
   dispositivo aislado para siempre).
7. Con menos de 2 neuronas online (contando la propia) no hay nadie con quien vincularse.

El resultado (lista de `syncDeviceId`) se pasa a `mesh.connectToDevice(id)` del motor WebRTC
compartido (`lan-sync.ts: getSharedMesh()` / `ensureMesh()`), reutilizando la MISMA malla que ya usa
el panel manual — así el botón manual sigue funcionando sin tumbar el auto-vínculo, y viceversa.

### 2.4 Ficha de dispositivo ("ficha")

Al abrirse un canal de datos con un peer, cada lado manda una `FichaDispositivo`
(`construirFicha()`): nombre, tipo (desktop/tablet/móvil/etc.), plataforma, versión del OS
(`OS_VERSION`), capas de Astraura servibles, si el backend local responde (`sondaBackendLocal()`:
`fetch` con `AbortSignal.timeout(1500)` a `http://127.0.0.1:8000/api/ping`, **solo si el origen de
la página ya es localhost/127.0.0.1/`::1`** — `esOrigenLocal()` — para no disparar una sonda a
loopback desde una pestaña servida en `starseed-os.vercel.app`), clase de RAM (`claseRam()`,
`navigator.deviceMemory` cuando existe) y versión de la app. Se reenvía cada 30s junto con un
heartbeat (`{t:"malla:hb", at}`) mientras el canal siga abierto — así el panel puede mostrar
capacidades REALES en vez de las cifras fijas que tenía antes.

## 3. Montaje global — `src/components/network/malla-neuronas-mount.tsx`

```tsx
// src/app/layout.tsx (root)
<RealtimeSyncProvider />
<MallaNeuronasMount />
```

Hermano de `SovereignSyncMount`/`RealtimeSyncProvider`: no pinta nada (`return null`), degrada en
silencio sin sesión. **Excluido de `/mando` y `/voces`** (`esRutaConsola`, `solo-fuera-de-consola.tsx`)
por el mismo motivo que `AppGlobals`: son rutas de trabajo en máquinas de 8 GB donde cada
suscripción/timer de más le quita sitio a un agente.

## 4. Arreglos de señalización

### 4.1 `signaling.ts` — hub en vuelo memoizado

`ensureRealtimeHub` comprobaba `realtimeHubs` (mapa síncrono) pero solo escribía en él DESPUÉS de un
`await channel.subscribe(...)`. Dos llamadas concurrentes para el mismo `userId` (p. ej. dos
componentes montándose casi a la vez) pasaban ambas el check síncrono antes de que ninguna
escribiera, abriendo dos canales Supabase con el MISMO nombre — el segundo `removeChannel` podía
tumbar el primero ya suscrito. Arreglo: `hubPromises: Map<string, Promise<RealtimeHub | null>>`
memoiza la promesa en vuelo; una segunda llamada concurrente espera la misma promesa en vez de
crear un segundo canal. Cubierto por test (`signaling.test.ts`): dos llamadas concurrentes abren
un solo canal.

### 4.2 `webrtc-mesh.ts` — tres arreglos

1. **ICE que adelanta a la oferta.** `handleIce` comprobaba `if (!p) return` y tiraba el candidato
   si aún no existía el `PeerRecord` (p. ej. el ICE llega antes que la oferta por reordenado del
   transporte). Ahora se bufferiza en `pendingIceBeforePeer: Map<string, RTCIceCandidateInit[]>` y
   se drena al crear el peer.
2. **Glare (ofertas cruzadas).** `esCortes(miId, remoteId) = miId < remoteId` decide quién cede: el
   de id MENOR es cortés (cierra su oferta y responde como *callee*), el de id MAYOR ignora la
   oferta entrante y conserva la suya. Regla determinista por comparación de string, sin reloj ni
   negociación adicional.
3. **Oferta perdida.** `OFFER_TIMEOUT_MS = 15_000`, `RETRY_BACKOFF_MS = [3s, 6s, 12s]`
   (`MAX_OFFER_ATTEMPTS = 4`). Sin respuesta, `scheduleRetryOrFail` reintenta con backoff creciente
   y, agotados los reintentos, marca el peer `failed` con un `reason` legible ("… tras 4 intentos")
   en vez de dejarlo "conectando" para siempre. Un `connectToDevice` MANUAL sobre un peer agotado
   resetea el contador de intentos (el usuario pulsando "Sincronizar" otra vez no debe seguir
   "agotado" para siempre).

El *fallback* de polling sobre `user_settings.prefs.signals[]` se **conserva** tal cual (no se quitó
ni se rediseñó): el arreglo de memoización ya resuelve el bug principal sin necesitar tocarlo.

## 5. Faros con identidad — `server-relay.ts`

`RelayBeacon` gana dos campos opcionales, `neuronId`/`syncId`, poblados desde
`etiquetaFaroPropio()` al emitir (`emitBeacon()`) y leídos de vuelta en `pullBeacons()`. Es la base
para que, en un paso futuro CON consentimiento, dos cuentas puedan reconocerse como "la misma
persona en otro dispositivo" — hoy solo viaja el dato, no se usa para nada automático entre
cuentas.

## 6. UI

- **Hub de Conexiones** (`connections-center.tsx`): nueva pestaña «Malla» (icono `Wifi`) →
  `MallaNeuronasPanel`.
- **`/red-mesh`** (`red-mesh-center.tsx`): nueva sección «7 · Dispositivos StarSeed» tras el panel
  de *Peers* LoRa, separada con su propio encabezado ("malla, sin radio") para que quede claro que
  es un mecanismo distinto del mesh LoRa.
- **`malla-neuronas-panel.tsx`**: dos listas — "Tu malla" (dispositivos propios, con su estado de
  enlace: conectando/conectado + latencia/fallida + motivo) y "Cercanas de otras cuentas" (por
  faros, con antigüedad y si ofrecen internet público). Botón «Solicitar vínculo» presente pero
  **deshabilitado a propósito** (tooltip "Próximamente: vínculo con consentimiento de ambas
  cuentas") — el vínculo entre cuentas queda fuera de alcance de esta ola porque requiere
  consentimiento de ambos lados.
- Mobile-first (390px), iconos lucide, `cursor-pointer`, sin emojis.

## 7. Privacidad y egress

- El radar de "otras cuentas" es **solo faros** (`os_mesh_relay`), nunca activa el radio LoRa.
- Respeta `capaMeshCompartiendo()`: con la capa mesh de Astraura apagada, no se emiten ni se
  escuchan faros nuevos.
- La sonda de backend local (`sondaBackendLocal`) solo se dispara si la propia página ya está
  servida desde localhost/127.0.0.1 — nunca se sondea `127.0.0.1` desde una pestaña remota.
- **Egress estimado por dispositivo, con ≥2 neuronas propias online:**
  - Polling de `neuron_devices`: 1 select cada `NEURON_POLL_MS` (mismo intervalo que ya usaba el
    registro de neuronas) → ya existente, sin cambio de cadencia.
  - Faros: `BEACON_EMIT_MS=40s` (emitir) + `BEACON_PULL_MS=30s` (leer) — ya existentes en
    `synaptic.ts`, ahora activos en más rutas porque `startMeshSubsystem()` se arranca globalmente
    en vez de solo en páginas puntuales. Con esta cadencia: ~90 emisiones + ~120 lecturas de faro
    por hora y por dispositivo (filas pequeñas, un puñado de columnas).
  - Señalización WebRTC (oferta/respuesta/ICE): un puñado de mensajes solo durante el
    establecimiento del enlace (segundos), no recurrente.
  - Ficha + heartbeat por el canal WebRTC YA establecido: cada 30s, **no pasa por Supabase** (viaje
    dentro del DataChannel P2P), así que no añade egress de servidor mientras el enlace esté vivo.
  - **Neto nuevo respecto a antes de esta ola:** el coste de faros (antes limitado a las páginas que
    montaban `startMeshSubsystem()`) ahora corre en todas las páginas fuera de `/mando`/`/voces`
    mientras haya sesión — es el cambio de egress más honesto a señalar: más superficie con la
    misma cadencia por dispositivo, no una cadencia más agresiva.

## 8. Qué falta (fuera de alcance de esta ola)

- **TURN**: se mantiene STUN-only (no se investigó ni añadió un TURN público fiable). Sin TURN, un
  NAT simétrico en ambos lados puede no conseguir conectar — el peer queda `failed` con motivo "La
  conexión ICE falló (posible NAT simétrico sin TURN)" en vez de fingir éxito.
  Se contempla como paso siguiente.
- **Estadísticas por tipo de candidato** (host/srflx/relay): no implementado.
- **Vínculo entre cuentas distintas**: **ya entregado en la Ola 370** (2026-09-26/27) — el botón
  «Solicitar vínculo» dejó de estar deshabilitado; usa exactamente el `syncId` de faro que este
  documento dejó preparado. Fuente de verdad completa (modelo de datos, secreto de par por
  ECDH+HKDF, señalización HMAC-firmada, API para otras capas, modelo de amenazas):
  `architecture/vinculos-entre-cuentas.md`. Ver también §10 de este documento.
- **`use-estado-capas.ts`**: no se tocó (fuera de los archivos permitidos en esta ola). El hook
  `usePeersMalla()` queda listo para que el equipo de IA lo consuma.

## 9. Tests

- `src/lib/network/__tests__/identidad-dispositivo.test.ts` — lectura/creación estable de los 3
  ids, composición de la etiqueta de faro.
- `src/lib/network/__tests__/signaling.test.ts` — regresión de memoización del hub (dos llamadas
  concurrentes → un solo canal).
- `src/lib/network/__tests__/webrtc-mesh.test.ts` — ICE antes de oferta, glare en ambas
  direcciones, reintento con backoff hasta agotar + reset manual.
- `src/lib/network/__tests__/malla-neuronas.test.ts` — `decidirAutovinculo`, `claseRam`,
  `esOrigenLocal`, `esMensajeFicha` (funciones puras).
- `src/components/network/__tests__/malla-neuronas-panel.test.tsx` — el panel pinta dispositivos
  propios + cercanas de otras cuentas, y degrada a listas vacías sin motor montado.

Resultado verificado en esta ola: **77 tests / 10 archivos en verde**
(`src/lib/network src/lib/neurons src/ai/astraura/mesh src/components/connectivity src/components/network`)
y `tsc --noEmit -p .` limpio. `next build` **no** se ejecutó (regla del área: nunca con el enjambre
vivo / nunca en esta sesión de agente) — sigue siendo la tercera puerta pendiente antes de publicar.

## 10. Astraura 1.58 REAL sobre el canal (Ola 367 · 2026-09-26)

El punto pendiente del §8 ("`usePeersMalla()` queda listo para que el equipo de IA lo consuma")
se resolvió: la malla ya no es solo un contador de vecinos, es una FUENTE de inteligencia. Sobre
el MISMO data channel que este documento describe (nunca un segundo mesh), el nuevo módulo
`src/lib/network/astraura-por-malla.ts` deja que una neurona sin backend local propio (p. ej. una
tablet con la app instalada, cargando la web pública) le pida un turno de Astraura 1.58 a OTRA
neurona de la MISMA cuenta que sí lo tenga (p. ej. la Mac) — protocolo JSON `astraura.*` sobre el
`sendToPeer`/`onPeer` de siempre.

Dos añadidos a este módulo para hacerlo posible:
- `FichaDispositivo` (§4 de este documento) gana `sirveAstraura?: boolean` y
  `astrauraLatenciaMs?: number` — calculados en `construirFicha()` con
  `puedeServirAstrauraPorMalla()` (same-origin local o endpoint propio declarado, Y la capa mesh
  compartiendo encendida) y viajan en la misma ficha que ya se intercambia cada 30 s.
- Nuevo getter `snapshotMallaNeuronas()`: lectura SÍNCRONA (sin hook) del mismo estado que publica
  el motor único, para que código no-React (el relé de malla, eligiendo con qué peer hablar)
  pueda leerlo sin re-suscribirse.

Detalle completo del protocolo, el rol servidor/cliente, el enrutador y el flujo de punta a punta:
`architecture/astraura-158-sistema-primario.md` §17.

## 11. Archivos por la malla P2P (Ola 369 · 2026-09-26)

Tercer protocolo sobre el MISMO data channel de siempre (junto a la ficha/latidos, `astraura.*`
del §10 e `ia.*` de la ola del relé genérico): `archivo.*`, un motor de transferencia de archivos
de cualquier formato y tamaño (hasta 4 GB por defecto), con integridad SHA-256, reanudación tras
desconexión y backpressure real. Fuente de verdad completa, con el protocolo, la justificación de
base64-vs-binario, el almacenamiento (OPFS/IndexedDB) y las políticas de recepción:
`architecture/archivos-malla-p2p.md`.

Resumen de una línea: `src/lib/network/archivos-malla.ts` es transporte-agnóstico
(`CanalArchivos`, hoy adaptado a este mesh vía `canalDesdeMesh`/`iniciarMotorArchivosPorMalla`,
mañana adaptable al canal de PAR entre cuentas distintas sin tocar el archivo); lo único que se
tocó de este mesh fue una adición aditiva y opcional a `MeshHandle`:
`bufferedAmount(deviceId): number` (getter sobre `RTCDataChannel.bufferedAmount`, cero riesgo
para los `MeshHandle` de mentira que ya construían otras pruebas).

## 12. IA por la malla, para CUALQUIER modelo (Ola 368 · 2026-09-26)

El §10 dejó el relé de Astraura 1.58 por malla. Alex pidió generalizarlo a cualquier modelo que
cualquier neurona tenga configurado (no solo Astraura): un SEGUNDO módulo,
`src/lib/network/ia-por-malla.ts`, sobre el MISMO data channel de siempre (`sendToPeer`/`onPeer`),
protocolo propio `ia.*` que convive con `astraura.*` sin fusionarse.

Dos añadidos más a este archivo para hacerlo posible:
- `FichaDispositivo` gana `fuentesServibles?: string[]` — los ids de catálogo que están LISTOS en
  este dispositivo ahora mismo (barato: se lee de un snapshot que ya se actualiza como
  efecto colateral de las sondas de disponibilidad que YA se hacían por otras razones, nunca una
  sonda nueva), viajando en la misma ficha de siempre cada 30 s.
- `servidoresIaPorMalla({fuente?})`: igual que `servidoresAstrauraMalla()` pero filtrando por
  CUALQUIER fuente del catálogo, no solo Astraura (con compatibilidad hacia atrás: un peer viejo
  en Ola 367 que solo anuncia `sirveAstraura` sigue contando para pedir una fuente `astraura-158-*`).

Detalle completo del protocolo, el codec del modelo pineado, el rol servidor (qué enrutador usa y
cómo se evita el bucle), el rol cliente, la integración con el enrutador y la UI:
`architecture/astraura-158-sistema-primario.md` §18.

## 13. Vínculo entre cuentas con consentimiento (Ola 370 · 2026-09-26/27)

El punto pendiente del §8 ("vínculo entre cuentas distintas: deliberadamente fuera de alcance")
se resolvió. El faro con identidad (§5 de este documento, `neuronId`/`syncId`) era justo la pieza
que faltaba: el `syncId` de un faro fresco es el identificador que `solicitar_vinculo` usa para
resolver, del lado del servidor, a qué cuenta pertenece la neurona destino — el cliente que pide
un vínculo nunca lee `owner_id` directamente.

Resumen de una línea: tabla `os_mesh_vinculos` (máquina de estados con RLS de solo lectura +
4 funciones SECURITY DEFINER) + un secreto de par por dispositivo (ECDH P-256 no extraíble en
IndexedDB → HKDF con la sal del vínculo) + un canal de señalización con topic no adivinable y
cada mensaje autenticado con HMAC + un `MeshHandle` dedicado por vínculo, reutilizando el mismo
núcleo de negociación de `webrtc-mesh.ts` (extraído a `createMesh`) sin tocar el mesh compartido
intra-cuenta que describe el resto de este documento. Expone `vinculosActivos()`/`useVinculos()`/
`enviarAPar()`/`onMensajeDePar()` para que el relé de IA y la transferencia de archivos entre
cuentas reutilicen el mismo canal ya abierto, cada uno comprobando sus propios permisos
(`permisos.ia`/`permisos.archivos`) antes de usarlo.

Fuente de verdad completa: `architecture/vinculos-entre-cuentas.md`.
