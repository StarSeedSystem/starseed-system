# Protocolo de Servidor Propio — Red Sináptica StarSeed (Adenda 103)

Un **servidor propio** (privado o público) es un endpoint HTTP que un usuario o grupo
añade en **Señales → Servidor** y selecciona como servidor activo de un contexto
(cuenta, grupo, página, cerebro, etc.). La neurona habla con él por HTTP para
enviar y recibir contenido, en paralelo al servidor público StarSeed (Supabase).

Cliente: `src/ai/astraura/mesh/server-relay.ts` — `postToEndpoint` (envío, Adenda 101)
y `pullFromEndpoint` (recepción, Adenda 103). Endpoint base = `MeshServer.endpoint`
(`servers.ts`). Implementación de referencia (paquete): `docs/examples/starseed-mesh-server/`.

## Envío (neurona → servidor)

- **POST `<endpoint>/mesh/public`** — contenido público (texto plano).
  Body JSON:
  ```json
  { "channel": "public", "device_id": "dev-xxxx",
    "envelope": { "cls": "P2", "ptype": "post", "body": { ... }, "recipient": null } }
  ```
- **POST `<endpoint>/mesh/relay`** — relé privado. `body` ya viene **cifrado AES-GCM
  en el cliente** (`{ iv, ct }`): el servidor NO puede leerlo, solo lo transporta.
  ```json
  { "channel": "relay", "device_id": "dev-xxxx",
    "envelope": { "cls": "P2", "ptype": "message", "body": { "iv": "…", "ct": "…" }, "recipient": "…" } }
  ```
- Respuesta `2xx` = aceptado. Cualquier otro código → la entrega hace failover a
  otra vía (malla / StarSeed) y encola.

## Recepción (servidor → neurona)

- **GET `<endpoint>/mesh/public?since=<epoch_ms>`** — contenido público posterior a `since`.
  Respuesta `{ items: [...] }` (o un array). Cada ítem:
  ```json
  { "id": "p123", "device_id": "dev-yyyy", "cls": "P2", "ptype": "post", "body": { ... }, "at": 1730000000000 }
  ```
- **GET `<endpoint>/mesh/relay?recipient=<deviceId>&since=<epoch_ms>`** — BUZÓN DIRIGIDO:
  los mensajes de relé dirigidos a esa neurona. `body` viene **cifrado E2E** (`{iv,ct}`);
  la neurona lo descifra en cliente. Requiere auth si el servidor la exige.
  Respuesta `{ items: [ { id, device_id, cls, ptype, body, hops, at } ] }`.
- **GET `<endpoint>/mesh/stream?recipients=<ids>&token=<token>`** — REALTIME (SSE): flujo
  `text/event-stream` que **empuja al instante** cada ítem público y cada relé cuyo `recipient`
  esté en `recipients`. Cada evento es `data: { channel, ...item }`. Cliente:
  `subscribeEndpointStream` (`EventSource`); el sondeo GET queda de respaldo. El `token` viaja en
  la query porque `EventSource` no admite cabeceras.

Los ítems incluyen `hops` (saltos de federación recorridos; 0 = origen local). En todos los casos
la neurona **deduplica por `id`/`oid`** y **excluye su propio `device_id`**.

## Reglas

- **CORS obligatorio**: el servidor debe responder `Access-Control-Allow-Origin` con el
  origen del OS (o `*` para uno público) y permitir `GET, POST, OPTIONS`.
- **Relé cifrado E2E**: el servidor jamás lee `body` en `/mesh/relay`.
- **Auth (opcional)**: cabecera `Authorization: Bearer <token>` en POST, en GET `/mesh/relay` y
  en `GET /mesh/stream` (SSE; el token viaja como `?token=` en la query porque `EventSource` no
  fija cabeceras). El GET público puede quedar abierto. El token se guarda **por servidor**
  (`MeshServer.token`, editable en Señales → Servidor) y el cliente lo adjunta solo al endpoint
  que lo tiene. Modelo de referencia: `STARSEED_TOKENS = { "<token>": ["<identidad>"] }` — el
  buzón dirigido solo lo lee un token que **incluya** ese `recipient` (identidad).
- **Expiración de token (opcional)**: en la referencia, un token puede declararse como
  `{ "ids":[...], "exp":<epoch_ms> }` en lugar de un array; pasado `exp` se trata como inexistente
  (401/403). Retrocompatible con la forma de array (sin caducidad).
- **Firma de origen (opcional)**: el contenido público va **firmado** (ECDSA P-256, sobre
  `{v:1,b,s,k,f}`). Un servidor en modo `STARSEED_VERIFY=1` **rechaza** (400) el POST público sin
  firma válida y **descarta** en federación el ítem sin firma. El relé privado ya va autenticado
  por AES-GCM.
- **Identidad ↔ cuenta**: la neurona publica un **registro de identidad firmado**
  (`kind:"identity"`, `payload:{owner,fp,pub,sig}`) que liga su huella pública (`fp`) a un `owner`
  (uuid de cuenta). El receptor verifica la firma y resuelve `signerFp → cuenta`, mostrando el
  contenido con su cuenta de origen (no solo la huella del dispositivo).
- **Revocación de identidad**: una neurona puede publicar un **acta de revocación firmada**
  (`kind:"revocation"`, `payload:{fp,pub,sig}`) donde `sig` firma `{revoke:fp}` con la propia clave.
  Es **auto-autenticable**: solo quien controla la clave de `fp` puede firmarla, y el receptor exige
  `fpOf(pub)===fp` (nadie revoca una huella ajena). Los receptores **descartan** el contenido firmado
  con una huella revocada — enforcement en el **receptor** (transporte-agnóstico). Al revocar, la
  neurona rota a una clave nueva.
- **Idempotencia**: los reintentos pueden reenviar; deduplica por `envelope.oid` / `id`.
- **Control de saltos (federación)**: cada ítem lleva `hops`; al re-federar se incrementa y se
  descarta si supera `STARSEED_MAX_HOPS` (def. 4). Evita bucles y propagación infinita entre pares.
- **Reputación de pares (federación)**: en modo `VERIFY`, un par que sirve firmas inválidas suma
  contra su reputación; si `(malas − buenas) > STARSEED_PEER_MAX_BAD` (def. 20) se **aísla**
  (`STARSEED_PEER_QUARANTINE_MS`, def. 300000) y no se le sondea durante el enfriamiento.
- **Retención**: el servidor decide TTL; la neurona solo pide `since` reciente.

## Estado

- **Envío** (`postToEndpoint`) — Adenda 101.
- **Recepción público** (`pullFromEndpoint` + `pullPublicExtra`) — Adenda 103: el sondeo del
  feed público consume además el servidor propio activo de la cuenta.
- **Buzón dirigido + persistencia real + auth** — Adenda 104: `pullRelayFromEndpoint` +
  `pullRelayExtra` (el sondeo de bandeja consume el buzón dirigido del servidor propio,
  descifrando en cliente). Referencia con **node:sqlite** + bearer token + buzón por `recipient`.
- **Realtime + identidades + paquete servidor** — Adenda 105:
  · `subscribeRelayRealtime` (Supabase Realtime sobre `os_mesh_relay`): entrega INSTANTÁNEA
    del contenido/relé/faros sin esperar el sondeo (que sigue de respaldo).
  · `neuronIdentities()`: el buzón dirigido se recoge para TODAS las identidades de la neurona
    — dispositivo, **cuenta** (uuid) y **grupos** (`group:<slug>` vía `os_memberships`). El
    `recipient` de una transmisión puede ser un uuid de cuenta o `group:<slug>`.
  · Paquete de referencia `docs/examples/starseed-mesh-server/` con **Postgres** (además de
    SQLite/memoria), **auth de grupo** (tokens → identidades; el buzón solo lo lee su dueño) y
    **federación** (peer-pull entre servidores propios).
- **Firma + SSE + federación robusta** — Adenda 106:
  · **Contenido público FIRMADO** (ECDSA P-256, `mesh-identity.ts`): `wrapSigned` al enviar,
    `unwrapSigned` al recibir → los ítems llevan `verified` (insignia en /red-feed). El relé
    privado ya iba autenticado por AES-GCM.
  · **Realtime del servidor propio (SSE)**: `GET /mesh/stream?recipients=<ids>` empuja feed
    público + buzón dirigido al instante; cliente `subscribeEndpointStream` (EventSource).
  · **Federación robusta**: `oid` (id de origen estable) con dedup único, marca de agua POR PAR
    y anti-bucle (re-federar un ítem ya visto se ignora). Ver el paquete de referencia.
- **Identidad↔cuenta + token e2e + federación endurecida** — Adenda 107:
  · **Registro de identidad firmado** (`server-relay.ts`): `registerIdentity()` publica
    `kind:"identity"` firmando el `owner`; `refreshIdentities()` verifica y construye `idMap`
    (`fp → cuenta`). El contenido recibido resuelve `signerFp → boundAccountFor(fp)` y muestra la
    **cuenta de origen** (chip «cuenta …» en /red-feed), no solo el dispositivo.
  · **Token end-to-end**: `MeshServer.token` (editable en Señales → Servidor); el cliente lo
    adjunta a `postToEndpoint`, `pullFromEndpoint`, `pullRelayFromEndpoint` y a `subscribeEndpointStream`
    (SSE, como `?token=` en la query). Referencia con `STARSEED_TOKENS`/`STARSEED_SERVER_TOKEN`.
  · **Federación con control de saltos y firma**: `hops` por ítem (columna en Postgres/SQLite/memoria),
    incremento por salto, descarte si `hops > STARSEED_MAX_HOPS`, y descarte del ítem público sin
    firma válida en modo `STARSEED_VERIFY=1`. Verificado con `scripts/smoke-mesh-server.mjs` (14/14)
    y `scripts/smoke-mesh-federate.mjs` (3/3).
- **Revocación + expiración de token + reputación de pares** — Adenda 108:
  · **Revocación de identidad** (`mesh-identity.ts` + `server-relay.ts`): `signRevocation()` firma
    el acta `{revoke:fp}`, `revokeIdentity()` la publica (`kind:"revocation"`) y rota a una clave
    nueva; `refreshRevocations()` construye el `revokedSet` verificado. `synaptic.ts` **descarta**
    en la entrega cualquier ítem con `signerFp` revocada (`isRevoked`). UI: «Revocar y regenerar
    identidad» en el panel de conectividad (cuenta), con la huella actual visible.
  · **Expiración de token** en la referencia: forma `{ids,exp}` por token; token caducado = 401/403.
  · **Reputación de pares**: `federate()` lleva `peerRep{bad,good,until}`; un par que sirve firmas
    inválidas en modo `VERIFY` se **aísla** al superar `STARSEED_PEER_MAX_BAD` durante
    `STARSEED_PEER_QUARANTINE_MS`. Verificado: `test-mesh-core` 54/54, `smoke-mesh-server` 18/18,
    `smoke-mesh-federate` 6/6.
- **Autoridad de cuenta + reloj lógico** — Adenda 115:
  · **Revocación por autoridad de cuenta**: `getRevocationCert()` (`mesh-identity.ts`) firma y guarda
    un certificado de revocación pre-generado al crear la identidad; `registerIdentity()` lo sube a la
    cuenta (`kind:"revocation-cert"`, solo la lee la cuenta por RLS). `listRevocationCerts()` +
    `revokeDeviceByCert(fp)` revocan un dispositivo PERDIDO sin su clave viva desde cualquier neurona.
  · **Reloj lógico (Lamport)** (`logical-clock.ts`): se estampa `lc` en los envelopes (`postToEndpoint`)
    y se observa en la recepción; el servidor transporta `lc`.
- **Ciclo de vida de tokens + PEX + orden por lc** — Adenda 116:
  · **Tokens dinámicos** en la referencia: `POST /tokens/issue` (admin: `STARSEED_ADMIN_TOKEN`) →
    `{token, ids, exp}`; `POST /tokens/refresh` (con el token) renueva `exp`; `POST /tokens/revoke`
    (admin) añade a la **lista de revocación**. `canWrite`/`canReadMailbox` honran tokens estáticos
    (`STARSEED_TOKENS`) y dinámicos, respetando expiración y revocación.
  · **Descubrimiento de pares (PEX)**: `GET /peers` expone los pares conocidos; con `STARSEED_PEX=1`,
    `federate()` fusiona los pares nuevos de las listas `/peers` de sus pares (hasta `STARSEED_MAX_PEERS`,
    sin añadirse a sí mismo por `STARSEED_SELF_URL`).
  · **Orden por reloj lógico**: los `GET /mesh/public` y `/mesh/relay` ordenan por `lc` (desc) con `at`
    de desempate; `revokeDeviceByCert` retira además el registro de identidad del dispositivo revocado.
    Verificado: `test-logical-clock` 12/12, `smoke-mesh-server` 27/27, `smoke-mesh-federate` 8/8.
- **Futuro**: trust de pares derivado del registro de identidades (federar solo con pares avalados por
  una identidad de confianza); rotación de la clave de firma de los tokens; reconciliación con vector
  clock entre muchas cuentas; UI de administración de tokens del servidor propio.
